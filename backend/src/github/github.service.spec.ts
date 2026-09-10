import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import type { AccessService } from '../access/access.service';
import type { ActivitiesService } from '../activities/activities.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { GithubAppService } from './github-app.service';
import type { GithubIssuesService } from './github-issues.service';
import { GithubService } from './github.service';

jest.mock('../realtime/realtime.service', () => ({
  RealtimeService: class RealtimeService {},
}));

describe('GithubService', () => {
  const projectId = '10000000-0000-4000-8000-000000000001';
  const repositoryId = '20000000-0000-4000-8000-000000000001';
  const actorId = 'actor-1';
  const installationId = '30000000-0000-4000-8000-000000000001';
  const secret = 'unit-test-webhook-secret-at-least-32-characters';
  const repository = {
    id: repositoryId,
    projectId,
    provider: 'github',
    externalRepositoryId: '123456',
    owner: 'flowplan',
    name: 'example',
    fullName: 'flowplan/example',
    url: 'https://github.com/flowplan/example',
    defaultBranch: 'main',
    connectedAt: new Date('2026-09-06T00:00:00Z'),
    updatedAt: new Date('2026-09-06T00:00:00Z'),
    githubInstallationId: installationId,
  };

  let transaction: {
    $queryRaw: jest.Mock<Promise<Array<{ id: string }>>, [Prisma.Sql]>;
    project: { findUnique: jest.Mock };
    repository: {
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    githubWebhookDelivery: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
  };
  let prisma: {
    $transaction: jest.Mock;
    repository: { findUnique: jest.Mock; findFirst: jest.Mock };
    githubWebhookDelivery: { findUnique: jest.Mock };
  };
  let access: {
    assertProjectAccess: jest.Mock;
    assertProjectIntegrationAdmin: jest.Mock;
  };
  let activities: { record: jest.Mock };
  let githubApp: {
    getVerifiedRepository: jest.Mock;
    assertOwnedInstallation: jest.Mock;
  };
  let githubIssues: {
    removeRepositoryLinks: jest.Mock;
    syncWebhookIssue: jest.Mock;
    publishWebhookSync: jest.Mock;
  };
  let service: GithubService;

  beforeEach(() => {
    transaction = {
      $queryRaw: jest
        .fn<Promise<Array<{ id: string }>>, [Prisma.Sql]>()
        .mockResolvedValue([{ id: projectId }]),
      project: { findUnique: jest.fn() },
      repository: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(repository),
        delete: jest.fn(),
      },
      githubWebhookDelivery: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'delivery-row' }),
      },
    };
    prisma = {
      $transaction: jest.fn(
        async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          operation(transaction as unknown as Prisma.TransactionClient),
      ),
      repository: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(repository),
      },
      githubWebhookDelivery: { findUnique: jest.fn() },
    };
    access = {
      assertProjectAccess: jest.fn(),
      assertProjectIntegrationAdmin: jest.fn(),
    };
    activities = { record: jest.fn() };
    githubApp = {
      getVerifiedRepository: jest.fn().mockResolvedValue({
        installation: { id: installationId },
        repository: {
          externalRepositoryId: '123456',
          owner: 'flowplan',
          name: 'example',
          fullName: 'flowplan/example',
          defaultBranch: 'main',
          htmlUrl: 'https://github.com/flowplan/example',
          private: true,
          archived: false,
        },
      }),
      assertOwnedInstallation: jest.fn(),
    };
    githubIssues = {
      removeRepositoryLinks: jest.fn(),
      syncWebhookIssue: jest.fn().mockResolvedValue(null),
      publishWebhookSync: jest.fn(),
    };
    service = new GithubService(
      prisma as unknown as PrismaService,
      access as unknown as AccessService,
      activities as unknown as ActivitiesService,
      githubApp as unknown as GithubAppService,
      githubIssues as unknown as GithubIssuesService,
      secret,
    );
  });

  it('connects with server-derived identity fields after narrow authorization', async () => {
    const result = await service.connectRepository(actorId, projectId, {
      externalRepositoryId: '123456',
      installationId,
    });

    expect(access.assertProjectIntegrationAdmin).toHaveBeenCalledWith(
      actorId,
      projectId,
    );
    expect(access.assertProjectIntegrationAdmin).toHaveBeenCalledWith(
      actorId,
      projectId,
      transaction,
    );
    expect(transaction.repository.create).toHaveBeenCalledTimes(1);
    const repositoryCreateCall = JSON.stringify(
      transaction.repository.create.mock.calls,
    );
    expect(repositoryCreateCall).toContain(projectId);
    expect(repositoryCreateCall).toContain('github');
    expect(repositoryCreateCall).toContain('flowplan/example');
    expect(repositoryCreateCall).toContain(
      'https://github.com/flowplan/example',
    );
    expect(result).not.toHaveProperty('webhookId');
    expect(result).not.toHaveProperty('secret');
    expect(activities.record).toHaveBeenCalledTimes(1);
    expect(repositoryCreateCall).toContain(installationId);
  });

  it('maps duplicate repository identity to a conflict', async () => {
    transaction.repository.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.connectRepository(actorId, projectId, {
        externalRepositoryId: '123456',
        installationId,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects missing and invalid signatures before database access', async () => {
    const body = Buffer.from('{}');

    await expect(
      service.receiveWebhook('push', randomUUID(), undefined, body),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.receiveWebhook(
        'push',
        randomUUID(),
        `sha256=${'0'.repeat(64)}`,
        body,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.repository.findFirst).not.toHaveBeenCalled();
  });

  it('accepts a signed push once and stores only normalized metadata', async () => {
    const body = Buffer.from(
      JSON.stringify({
        repository: { id: 123456, full_name: 'flowplan/example' },
        ref: 'refs/heads/main',
        before: 'a'.repeat(40),
        after: 'b'.repeat(40),
        commits: [{ message: 'must not be stored' }],
        pusher: { name: 'octocat' },
      }),
    );
    const deliveryId = randomUUID();
    const signature = sign(body);

    await expect(
      service.receiveWebhook('push', deliveryId, signature, body),
    ).resolves.toEqual({ accepted: true, duplicate: false, deliveryId });
    expect(transaction.githubWebhookDelivery.create).toHaveBeenCalledTimes(1);
    const deliveryCreateCall = JSON.stringify(
      transaction.githubWebhookDelivery.create.mock.calls,
    );
    expect(deliveryCreateCall).toContain(deliveryId);
    expect(deliveryCreateCall).toContain(repositoryId);
    expect(deliveryCreateCall).toContain('commitCount');
    expect(deliveryCreateCall).not.toContain('must not be stored');
    expect(activities.record).not.toHaveBeenCalled();
  });

  it('treats a matching repeated delivery as idempotent', async () => {
    const deliveryId = randomUUID();
    transaction.githubWebhookDelivery.findUnique.mockResolvedValue({
      id: 'delivery-row',
      eventType: 'issues',
      repositoryId,
    });
    const body = Buffer.from(
      JSON.stringify({
        repository: { id: 123456, full_name: 'flowplan/example' },
        action: 'opened',
        issue: {
          id: 1001,
          number: 1,
          title: 'Example',
          body: null,
          state: 'open',
          html_url: 'https://github.com/flowplan/example/issues/1',
          updated_at: '2026-09-10T00:00:00Z',
        },
      }),
    );

    await expect(
      service.receiveWebhook('issues', deliveryId, sign(body), body),
    ).resolves.toEqual({ accepted: true, duplicate: true, deliveryId });
    expect(transaction.githubWebhookDelivery.create).not.toHaveBeenCalled();
  });

  it('rejects a signed event for an unknown repository', async () => {
    prisma.repository.findFirst.mockResolvedValue(null);
    const body = Buffer.from(
      JSON.stringify({
        repository: { id: 999999, full_name: 'unknown/repository' },
        ref: 'refs/heads/main',
        before: 'a'.repeat(40),
        after: 'b'.repeat(40),
        commits: [],
      }),
    );

    await expect(
      service.receiveWebhook('push', randomUUID(), sign(body), body),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  function sign(body: Buffer): string {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  }
});
