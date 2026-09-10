import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  GithubCallbackQueryDto,
  GithubRepositoryQueryDto,
  GithubSetupQueryDto,
} from './dto/github.dto';
import { GithubAppClient } from './github-app.client';
import { GITHUB_APP_CALLBACK_URL } from './github.constants';

const installationSelect = {
  id: true,
  externalInstallationId: true,
  accountLogin: true,
  accountId: true,
  accountType: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GithubInstallationSelect;

type GithubDatabaseClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class GithubAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: GithubAppClient,
    @Inject(GITHUB_APP_CALLBACK_URL) private readonly callbackUrl: string,
  ) {}

  async createInstallUrl(userId: string) {
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const url = this.client.getInstallUrl(state);

    await this.prisma.$transaction(async (tx) => {
      await tx.githubAppState.deleteMany({
        // One active flow per user keeps state bounded and makes restarting an
        // installation deterministically invalidate the older browser flow.
        where: { userId },
      });
      await tx.githubAppState.create({
        data: {
          userId,
          stateHash: this.hash(state),
          codeVerifier,
          expiresAt,
        },
      });
    });

    return { url, expiresAt };
  }

  async beginSetup(userId: string, query: GithubSetupQueryDto) {
    const stateHash = this.hash(query.state);
    const state = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "GithubAppState" WHERE "stateHash" = ${stateHash} FOR UPDATE`,
      );
      if (rows.length === 0)
        throw new BadRequestException('Invalid GitHub state');
      const stored = await tx.githubAppState.findUniqueOrThrow({
        where: { id: rows[0].id },
      });
      this.assertUsableState(stored, userId);
      if (
        stored.pendingInstallationId &&
        stored.pendingInstallationId !== query.installation_id
      ) {
        throw new ConflictException(
          'GitHub installation state is already bound',
        );
      }
      await tx.githubAppState.update({
        where: { id: stored.id },
        data: { pendingInstallationId: query.installation_id },
      });
      return stored;
    });
    const challenge = createHash('sha256')
      .update(state.codeVerifier)
      .digest('base64url');
    const authorizationUrl = this.client.getUserAuthorizationUrl(
      query.state,
      challenge,
      this.callbackUrl,
    );
    return authorizationUrl;
  }

  async completeCallback(userId: string, query: GithubCallbackQueryDto) {
    const state = await this.consumeState(userId, query.state);
    try {
      const userToken = await this.client.exchangeUserCode(
        query.code,
        state.codeVerifier,
        this.callbackUrl,
      );
      await this.client.verifyUserInstallation(
        userToken,
        state.pendingInstallationId,
      );
      const identity = await this.client.getInstallation(
        state.pendingInstallationId,
      );

      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.githubInstallation.findUnique({
          where: {
            externalInstallationId: identity.externalInstallationId,
          },
        });
        if (existing && existing.connectedById !== userId) {
          throw new ConflictException(
            'This GitHub installation is connected to another FlowPlan user',
          );
        }
        const installation = existing
          ? await tx.githubInstallation.update({
              where: { id: existing.id },
              data: {
                accountId: identity.accountId,
                accountLogin: identity.accountLogin,
                accountType: identity.accountType,
              },
              select: installationSelect,
            })
          : await tx.githubInstallation.create({
              data: { ...identity, connectedById: userId },
              select: installationSelect,
            });
        return installation;
      });
    } finally {
      await this.prisma.githubAppState.deleteMany({ where: { id: state.id } });
    }
  }

  listInstallations(userId: string) {
    return this.prisma.githubInstallation.findMany({
      where: { connectedById: userId },
      select: installationSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async listRepositories(
    userId: string,
    installationId: string,
    query: GithubRepositoryQueryDto,
  ) {
    const installation = await this.assertOwnedInstallation(
      userId,
      installationId,
    );
    return this.client.listRepositories(
      installation.externalInstallationId,
      query.page,
      query.perPage,
    );
  }

  async getVerifiedRepository(
    userId: string,
    installationId: string,
    repositoryId: string,
  ) {
    const installation = await this.assertOwnedInstallation(
      userId,
      installationId,
    );
    return {
      installation,
      repository: await this.client.getRepository(
        installation.externalInstallationId,
        repositoryId,
      ),
    };
  }

  async assertOwnedInstallation(
    userId: string,
    installationId: string,
    database: GithubDatabaseClient = this.prisma,
  ) {
    const installation = await database.githubInstallation.findUnique({
      where: { id: installationId },
      select: {
        ...installationSelect,
        connectedById: true,
      },
    });
    if (!installation || installation.connectedById !== userId) {
      throw new NotFoundException('GitHub installation not found');
    }
    return installation;
  }

  private async consumeState(userId: string, state: string) {
    const stateHash = this.hash(state);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "GithubAppState" WHERE "stateHash" = ${stateHash} FOR UPDATE`,
      );
      if (rows.length === 0)
        throw new BadRequestException('Invalid GitHub state');
      const stored = await tx.githubAppState.findUniqueOrThrow({
        where: { id: rows[0].id },
      });
      this.assertUsableState(stored, userId, true);
      await tx.githubAppState.update({
        where: { id: stored.id },
        data: { consumedAt: new Date() },
      });
      return {
        id: stored.id,
        codeVerifier: stored.codeVerifier,
        pendingInstallationId: stored.pendingInstallationId!,
      };
    });
  }

  private assertUsableState(
    state: {
      id: string;
      userId: string;
      expiresAt: Date;
      consumedAt: Date | null;
      pendingInstallationId: string | null;
      codeVerifier: string;
    } | null,
    userId: string,
    requireInstallation = false,
  ): asserts state is NonNullable<typeof state> {
    if (
      !state ||
      state.userId !== userId ||
      state.expiresAt.getTime() <= Date.now() ||
      state.consumedAt ||
      (requireInstallation && !state.pendingInstallationId)
    ) {
      throw new BadRequestException('Invalid or expired GitHub state');
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
