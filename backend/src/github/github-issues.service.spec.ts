import { ConflictException } from '@nestjs/common';
import type { AccessService } from '../access/access.service';
import type { ActivitiesService } from '../activities/activities.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RealtimeService } from '../realtime/realtime.service';
import type { GithubAppClient } from './github-app.client';
import { GithubIssuesService } from './github-issues.service';

jest.mock('../realtime/realtime.service', () => ({
  RealtimeService: class RealtimeService {},
}));

describe('GithubIssuesService', () => {
  const userId = 'user-1';
  const projectId = '10000000-0000-4000-8000-000000000001';
  const taskId = '20000000-0000-4000-8000-000000000001';
  const repositoryId = '30000000-0000-4000-8000-000000000001';
  const repository = {
    id: repositoryId,
    projectId,
    externalRepositoryId: '123',
    owner: 'flowplan',
    name: 'app',
    fullName: 'flowplan/app',
    githubInstallation: { externalInstallationId: '987' },
  };
  const githubIssue = {
    externalIssueId: '9001',
    number: 42,
    title: 'Fix sync',
    body: 'Issue body',
    state: 'open' as const,
    htmlUrl: 'https://github.com/flowplan/app/issues/42',
    updatedAt: '2026-09-10T00:00:00Z',
  };

  let tx: {
    $queryRaw: jest.Mock;
    repository: { findUnique: jest.Mock };
    task: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    issue: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let prisma: {
    $transaction: jest.Mock;
    repository: { findUnique: jest.Mock };
    task: { findUnique: jest.Mock };
    issue: { findUnique: jest.Mock; findMany: jest.Mock };
  };
  let access: {
    assertProjectAccess: jest.Mock;
    assertColumnInProject: jest.Mock;
  };
  let activities: { record: jest.Mock };
  let githubClient: { getIssue: jest.Mock; listIssues: jest.Mock };
  let realtime: { publish: jest.Mock };
  let service: GithubIssuesService;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: projectId }]),
      repository: {
        findUnique: jest.fn().mockResolvedValue({ id: repositoryId }),
      },
      task: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: taskId, title: 'Existing', projectId }),
        findFirst: jest.fn().mockResolvedValue({ position: 1 }),
        create: jest.fn(),
        update: jest.fn(),
      },
      issue: {
        create: jest.fn().mockResolvedValue(issueRecord()),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    prisma = {
      $transaction: jest.fn(
        async (operation: (database: unknown) => Promise<unknown>) =>
          operation(tx),
      ),
      repository: { findUnique: jest.fn().mockResolvedValue(repository) },
      task: { findUnique: jest.fn().mockResolvedValue({ projectId }) },
      issue: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    access = {
      assertProjectAccess: jest.fn(),
      assertColumnInProject: jest.fn(),
    };
    activities = { record: jest.fn() };
    githubClient = {
      getIssue: jest.fn().mockResolvedValue(githubIssue),
      listIssues: jest.fn(),
    };
    realtime = { publish: jest.fn() };
    service = new GithubIssuesService(
      prisma as unknown as PrismaService,
      access as unknown as AccessService,
      activities as unknown as ActivitiesService,
      githubClient as unknown as GithubAppClient,
      realtime as unknown as RealtimeService,
    );
  });

  it('lists compact Issue metadata with local link state', async () => {
    githubClient.listIssues.mockResolvedValue({
      items: [githubIssue],
      page: 1,
      perPage: 30,
      nextPage: null,
    });
    prisma.issue.findMany.mockResolvedValue([
      {
        externalIssueId: githubIssue.externalIssueId,
        task: { id: taskId, title: 'Existing' },
      },
    ]);

    const result = await service.listProjectIssues(userId, projectId, {
      page: 1,
      perPage: 30,
      state: 'open',
    });

    expect(result.items[0]).not.toHaveProperty('body');
    expect(result.items[0].linkedTask).toEqual({
      id: taskId,
      title: 'Existing',
    });
    expect(githubClient.listIssues).toHaveBeenCalledWith(
      '987',
      'flowplan',
      'app',
      1,
      30,
      'open',
    );
  });

  it('links a verified Issue and publishes after the transaction', async () => {
    await expect(
      service.linkTask(userId, taskId, { issueNumber: 42 }),
    ).resolves.toMatchObject({ number: 42, taskId });

    const createCalls = tx.issue.create.mock.calls as unknown as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(createCalls[0]?.[0].data).toMatchObject({
      externalIssueId: '9001',
      projectId,
      repositoryId,
      taskId,
    });
    expect(activities.record).toHaveBeenCalledTimes(1);
    expect(realtime.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'GITHUB_ISSUE_LINKED', taskId }),
    );
  });

  it('maps duplicate links to conflict without realtime publication', async () => {
    tx.issue.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.linkTask(userId, taskId, { issueNumber: 42 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it('updates a linked Task for an edited webhook without creating one', async () => {
    tx.issue.findUnique.mockResolvedValue({
      id: 'issue-row',
      taskId,
      projectId,
    });
    const result = await service.syncWebhookIssue(
      tx as never,
      projectId,
      repositoryId,
      { action: 'edited', ...githubIssue },
    );

    expect(result).toEqual({ issueId: 'issue-row', taskId, projectId });
    expect(tx.task.update).toHaveBeenCalledWith({
      where: { id: taskId },
      data: { title: 'Fix sync', description: 'Issue body' },
    });
    expect(tx.task.create).not.toHaveBeenCalled();
  });
});

function issueRecord() {
  const timestamp = new Date('2026-09-10T00:00:00Z');
  return {
    id: 'issue-row',
    projectId: '10000000-0000-4000-8000-000000000001',
    taskId: '20000000-0000-4000-8000-000000000001',
    repositoryId: '30000000-0000-4000-8000-000000000001',
    externalIssueId: '9001',
    number: 42,
    title: 'Fix sync',
    state: 'open',
    url: 'https://github.com/flowplan/app/issues/42',
    lastSyncedAt: timestamp,
    unavailableAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    repository: { fullName: 'flowplan/app' },
    task: {
      id: '20000000-0000-4000-8000-000000000001',
      title: 'Existing',
    },
  };
}
