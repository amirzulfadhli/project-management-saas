import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { AccessService } from '../access/access.service';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityEvent } from '../activities/activity.types';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ConnectGithubRepositoryDto,
  GithubEventName,
} from './dto/github.dto';
import { githubDeliveryIdSchema, githubEventSchema } from './dto/github.dto';
import {
  GITHUB_WEBHOOK_SECRET,
  GithubDeliveryStatus,
} from './github.constants';
import { normalizeGithubWebhook } from './github-webhook';
import { GithubAppService } from './github-app.service';
import { GithubIssuesService } from './github-issues.service';

const repositorySelect = {
  id: true,
  projectId: true,
  provider: true,
  externalRepositoryId: true,
  owner: true,
  name: true,
  fullName: true,
  url: true,
  defaultBranch: true,
  githubInstallationId: true,
  connectedAt: true,
  updatedAt: true,
} satisfies Prisma.RepositorySelect;

type RepositoryRecord = Prisma.RepositoryGetPayload<{
  select: typeof repositorySelect;
}>;

@Injectable()
export class GithubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
    private readonly githubApp: GithubAppService,
    private readonly githubIssues: GithubIssuesService,
    @Inject(GITHUB_WEBHOOK_SECRET)
    private readonly webhookSecret: string | undefined,
  ) {}

  async findRepository(userId: string, projectId: string) {
    await this.access.assertProjectAccess(userId, projectId);
    const repository = await this.prisma.repository.findUnique({
      where: { projectId },
      select: repositorySelect,
    });
    return repository ? this.toRepositoryResponse(repository) : null;
  }

  async connectRepository(
    userId: string,
    projectId: string,
    dto: ConnectGithubRepositoryDto,
  ) {
    await this.access.assertProjectIntegrationAdmin(userId, projectId);
    this.requireWebhookSecret();
    const verified = await this.githubApp.getVerifiedRepository(
      userId,
      dto.installationId,
      dto.externalRepositoryId,
    );
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, projectId);
      await this.access.assertProjectIntegrationAdmin(userId, projectId, tx);
      await this.githubApp.assertOwnedInstallation(
        userId,
        dto.installationId,
        tx,
      );

      if (await tx.repository.findUnique({ where: { projectId } })) {
        throw new ConflictException(
          'This Project already has a connected repository',
        );
      }

      const verifiedRepository = verified.repository;

      try {
        const repository = await tx.repository.create({
          data: {
            provider: 'github',
            externalRepositoryId: verifiedRepository.externalRepositoryId,
            owner: verifiedRepository.owner,
            name: verifiedRepository.name,
            fullName: verifiedRepository.fullName,
            url: verifiedRepository.htmlUrl,
            defaultBranch: verifiedRepository.defaultBranch,
            projectId,
            githubInstallationId: verified.installation.id,
          },
          select: repositorySelect,
        });

        await this.activities.record(tx, {
          type: ActivityEvent.GITHUB_REPOSITORY_CONNECTED,
          description: `Connected GitHub repository ${verifiedRepository.fullName}`,
          projectId,
          userId,
          metadata: {
            repositoryId: repository.id,
            externalRepositoryId: verifiedRepository.externalRepositoryId,
            fullName: verifiedRepository.fullName,
            defaultBranch: verifiedRepository.defaultBranch,
            githubInstallationId: verified.installation.id,
          },
        });

        return this.toRepositoryResponse(repository);
      } catch (error: unknown) {
        if (this.isUniqueConstraintViolation(error)) {
          throw new ConflictException(
            'This GitHub repository is already connected',
          );
        }
        throw error;
      }
    });
  }

  async disconnectRepository(userId: string, projectId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, projectId);
      await this.access.assertProjectIntegrationAdmin(userId, projectId, tx);
      const repository = await tx.repository.findUnique({
        where: { projectId },
        select: repositorySelect,
      });
      if (!repository) {
        throw new NotFoundException('Connected repository not found');
      }

      await this.activities.record(tx, {
        type: ActivityEvent.GITHUB_REPOSITORY_DISCONNECTED,
        description: `Disconnected GitHub repository ${repository.fullName}`,
        projectId,
        userId,
        metadata: {
          repositoryId: repository.id,
          externalRepositoryId: repository.externalRepositoryId,
          fullName: repository.fullName,
        },
      });

      await this.githubIssues.removeRepositoryLinks(tx, repository.id);

      try {
        await tx.repository.delete({ where: { id: repository.id } });
      } catch (error: unknown) {
        if (this.isForeignKeyConstraintViolation(error)) {
          throw new ConflictException(
            'The repository still has linked GitHub data',
          );
        }
        throw error;
      }
    });
  }

  async receiveWebhook(
    eventNameValue: string | undefined,
    deliveryIdValue: string | undefined,
    signature: string | undefined,
    rawBody: Buffer | undefined,
  ) {
    this.verifySignature(signature, rawBody);
    const eventName = this.parseHeader(
      githubEventSchema,
      eventNameValue,
      'GitHub event header is invalid',
    );
    const deliveryId = this.parseHeader(
      githubDeliveryIdSchema,
      deliveryIdValue,
      'GitHub delivery ID is invalid',
    );

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody!.toString('utf8')) as unknown;
    } catch {
      throw new BadRequestException('Invalid GitHub webhook JSON');
    }

    const normalized = normalizeGithubWebhook(eventName, payload);
    const repository = await this.prisma.repository.findFirst({
      where: {
        provider: 'github',
        externalRepositoryId: normalized.externalRepositoryId,
        projectId: { not: null },
      },
      select: repositorySelect,
    });
    if (!repository?.projectId) {
      throw new NotFoundException('Connected GitHub repository not found');
    }
    const connectedProjectId = repository.projectId;
    const connectedRepositoryId = repository.id;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.githubWebhookDelivery.findUnique({
          where: { deliveryId },
          select: { id: true, eventType: true, repositoryId: true },
        });
        if (existing) {
          this.assertSameDelivery(existing, eventName, connectedRepositoryId);
          return {
            response: { accepted: true, duplicate: true, deliveryId },
            sync: null,
          };
        }

        await tx.githubWebhookDelivery.create({
          data: {
            deliveryId,
            eventType: eventName,
            status: GithubDeliveryStatus.PROCESSED,
            projectId: connectedProjectId,
            repositoryId: connectedRepositoryId,
            processedAt: new Date(),
            metadata: {
              repository: normalized.fullName,
              ...normalized.metadata,
            },
          },
        });
        const sync = await this.githubIssues.syncWebhookIssue(
          tx,
          connectedProjectId,
          connectedRepositoryId,
          normalized.issue,
        );
        return {
          response: { accepted: true, duplicate: false, deliveryId },
          sync,
        };
      });
      if (result.sync) await this.githubIssues.publishWebhookSync(result.sync);
      return result.response;
    } catch (error: unknown) {
      if (!this.isUniqueConstraintViolation(error)) throw error;
      const existing = await this.prisma.githubWebhookDelivery.findUnique({
        where: { deliveryId },
        select: { id: true, eventType: true, repositoryId: true },
      });
      if (!existing) throw error;
      this.assertSameDelivery(existing, eventName, connectedRepositoryId);
      return { accepted: true, duplicate: true, deliveryId };
    }
  }

  private verifySignature(
    signature: string | undefined,
    rawBody: Buffer | undefined,
  ): void {
    const webhookSecret = this.requireWebhookSecret();
    if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
      throw new UnauthorizedException('Invalid GitHub webhook signature');
    }
    if (!rawBody) {
      throw new BadRequestException('Raw GitHub webhook body is unavailable');
    }

    const expected = `sha256=${createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex')}`;
    const providedBuffer = Buffer.from(signature.toLowerCase(), 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid GitHub webhook signature');
    }
  }

  private requireWebhookSecret(): string {
    if (!this.webhookSecret) {
      throw new ServiceUnavailableException(
        'GitHub webhooks are not configured',
      );
    }
    return this.webhookSecret;
  }

  private parseHeader<T>(
    schema: {
      safeParse(
        value: unknown,
      ): { success: true; data: T } | { success: false };
    },
    value: unknown,
    message: string,
  ): T {
    const result = schema.safeParse(value);
    if (!result.success) throw new BadRequestException(message);
    return result.data;
  }

  private assertSameDelivery(
    existing: { eventType: string; repositoryId: string | null },
    eventName: GithubEventName,
    repositoryId: string,
  ): void {
    if (
      existing.eventType !== eventName ||
      existing.repositoryId !== repositoryId
    ) {
      throw new ConflictException('GitHub delivery ID is already in use');
    }
  }

  private async lockProject(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new NotFoundException('Project not found');
  }

  private toRepositoryResponse(repository: RepositoryRecord) {
    return {
      id: repository.id,
      projectId: repository.projectId,
      provider: repository.provider,
      externalRepositoryId: repository.externalRepositoryId,
      owner: repository.owner,
      name: repository.name,
      fullName: repository.fullName,
      htmlUrl: repository.url,
      defaultBranch: repository.defaultBranch,
      installationId: repository.githubInstallationId,
      connectedAt: repository.connectedAt,
      updatedAt: repository.updatedAt,
    };
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private isForeignKeyConstraintViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2003'
    );
  }
}
