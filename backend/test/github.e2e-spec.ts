import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GITHUB_WEBHOOK_SECRET } from '../src/github/github.constants';
import { GithubAppClient } from '../src/github/github-app.client';

interface ProjectSetup {
  id: string;
  organizationId: string;
}

interface RepositoryResponse {
  id: string;
  projectId: string;
  provider: string;
  externalRepositoryId: string;
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
}

describe('GitHub integration core backend (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerClient: ReturnType<typeof request.agent>;
  let memberClient: ReturnType<typeof request.agent>;
  let outsiderClient: ReturnType<typeof request.agent>;
  let ownerId = '';
  let memberId = '';
  let outsiderId = '';
  let projectA: ProjectSetup;
  let projectB: ProjectSetup;
  let webhookProject: ProjectSetup;
  let installationId = '';
  let githubClient: jest.Mocked<
    Pick<
      GithubAppClient,
      | 'getInstallUrl'
      | 'getUserAuthorizationUrl'
      | 'exchangeUserCode'
      | 'verifyUserInstallation'
      | 'getInstallation'
      | 'listRepositories'
      | 'getRepository'
      | 'listIssues'
      | 'getIssue'
    >
  >;

  const runId = Date.now().toString(36);
  const password = 'GithubE2ePassword123!';
  const webhookSecret = 'github-e2e-webhook-secret-at-least-32-characters';
  const webhookExternalId = '654321';

  beforeAll(async () => {
    githubClient = {
      getInstallUrl: jest.fn<GithubAppClient['getInstallUrl']>(
        (state: string) =>
          `https://github.com/apps/flowplan-test/installations/new?state=${state}`,
      ),
      getUserAuthorizationUrl: jest
        .fn<GithubAppClient['getUserAuthorizationUrl']>()
        .mockReturnValue('https://github.com/login/oauth/authorize?state=test'),
      exchangeUserCode: jest
        .fn<GithubAppClient['exchangeUserCode']>()
        .mockResolvedValue('ghu_transient'),
      verifyUserInstallation:
        jest.fn<GithubAppClient['verifyUserInstallation']>(),
      getInstallation: jest
        .fn<GithubAppClient['getInstallation']>()
        .mockResolvedValue({
          externalInstallationId: '988',
          accountId: '457',
          accountLogin: 'flowplan-callback',
          accountType: 'Organization',
        }),
      listRepositories: jest
        .fn<GithubAppClient['listRepositories']>()
        .mockResolvedValue({
          items: [verifiedRepository()],
          page: 1,
          perPage: 30,
          totalCount: 1,
          nextPage: null,
        }),
      getRepository: jest
        .fn<GithubAppClient['getRepository']>()
        .mockResolvedValue(verifiedRepository()),
      listIssues: jest
        .fn<GithubAppClient['listIssues']>()
        .mockImplementation(
          (_installation, _owner, _repository, page, perPage) =>
            Promise.resolve({
              items: [verifiedIssue(42)],
              page,
              perPage,
              nextPage: null,
            }),
        ),
      getIssue: jest
        .fn<GithubAppClient['getIssue']>()
        .mockImplementation((_installation, _owner, _repository, number) =>
          Promise.resolve(verifiedIssue(number)),
        ),
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GITHUB_WEBHOOK_SECRET)
      .useValue(webhookSecret)
      .overrideProvider(GithubAppClient)
      .useValue(githubClient)
      .compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    ownerClient = request.agent(app.getHttpServer());
    memberClient = request.agent(app.getHttpServer());
    outsiderClient = request.agent(app.getHttpServer());
    const users = [
      ['GitHub Owner', `github-owner-${runId}@test.dev`, ownerClient],
      ['GitHub Member', `github-member-${runId}@test.dev`, memberClient],
      ['GitHub Outsider', `github-outsider-${runId}@test.dev`, outsiderClient],
    ] as const;
    for (const [name, email, client] of users) {
      await client
        .post('/api/auth/sign-up/email')
        .send({ name, email, password })
        .expect(200);
    }
    const records = await prisma.user.findMany({
      where: { email: { in: users.map((entry) => entry[1]) } },
      select: { id: true, email: true },
    });
    const idFor = (email: string) =>
      records.find((user) => user.email === email)!.id;
    ownerId = idFor(users[0][1]);
    memberId = idFor(users[1][1]);
    outsiderId = idFor(users[2][1]);
    const installation = await prisma.githubInstallation.create({
      data: {
        externalInstallationId: '987',
        accountLogin: 'flowplan-tests',
        accountId: '456',
        accountType: 'Organization',
        connectedById: ownerId,
      },
    });
    installationId = installation.id;

    projectA = await createProject('GitHub Project A', `github-a-${runId}`);
    projectB = await createProject('GitHub Project B', `github-b-${runId}`);
    webhookProject = await createProject(
      'GitHub Webhooks',
      `github-hooks-${runId}`,
    );
    await prisma.organizationMember.createMany({
      data: [projectA, projectB, webhookProject].map((project) => ({
        organizationId: project.organizationId,
        userId: memberId,
      })),
    });
    await prisma.repository.create({
      data: {
        projectId: webhookProject.id,
        provider: 'github',
        externalRepositoryId: webhookExternalId,
        owner: 'flowplan-tests',
        name: 'webhook-source',
        fullName: 'flowplan-tests/webhook-source',
        url: 'https://github.com/flowplan-tests/webhook-source',
        defaultBranch: 'main',
      },
    });
  });

  afterAll(async () => {
    if (prisma && ownerId) {
      const organizations = await prisma.organization.findMany({
        where: { ownerId },
        select: { id: true },
      });
      const organizationIds = organizations.map((item) => item.id);
      const projects = await prisma.project.findMany({
        where: { organizationId: { in: organizationIds } },
        select: { id: true },
      });
      const projectIds = projects.map((item) => item.id);
      const repositories = await prisma.repository.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true },
      });
      const repositoryIds = repositories.map((item) => item.id);
      await prisma.issue.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.githubWebhookDelivery.deleteMany({
        // Deliveries deliberately retain Project scope after repository
        // disconnect sets repositoryId to null, so cleanup must use projectId.
        where: { projectId: { in: projectIds } },
      });
      await prisma.repository.deleteMany({
        where: { id: { in: repositoryIds } },
      });
      await prisma.githubAppState.deleteMany({
        where: { userId: { in: [ownerId, memberId, outsiderId] } },
      });
      await prisma.githubInstallation.deleteMany({
        where: { connectedById: { in: [ownerId, memberId, outsiderId] } },
      });
      await prisma.notification.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.activity.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.task.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.column.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.board.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.projectMember.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
      await prisma.organizationMember.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
      const userIds = [ownerId, memberId, outsiderId];
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  async function createProject(name: string, slug: string) {
    const organization = await ownerClient
      .post('/api/organizations')
      .send({ name: `${name} Organization`, slug })
      .expect(201);
    const project = await ownerClient
      .post('/api/projects')
      .send({ name, organizationId: (organization.body as { id: string }).id })
      .expect(201);
    return project.body as ProjectSetup;
  }

  function eventPayload(
    event: 'push' | 'pull_request' | 'issues',
    externalRepositoryId = webhookExternalId,
  ): Record<string, unknown> {
    const common = {
      repository: {
        id: Number(externalRepositoryId),
        full_name: 'flowplan-tests/webhook-source',
      },
      sender: { login: 'octocat' },
    };
    if (event === 'push') {
      return {
        ...common,
        ref: 'refs/heads/main',
        before: 'a'.repeat(40),
        after: 'b'.repeat(40),
        commits: [{ message: 'payload body must not be retained' }],
      };
    }
    if (event === 'pull_request') {
      return {
        ...common,
        action: 'opened',
        number: 7,
        pull_request: {
          title: 'Webhook foundation',
          state: 'open',
          merged: false,
          base: { ref: 'main' },
          head: { ref: 'feature/webhook' },
        },
      };
    }
    return {
      ...common,
      action: 'closed',
      issue: {
        id: 9009,
        number: 9,
        title: 'Example issue',
        body: 'Example body',
        state: 'closed',
        html_url: 'https://github.com/flowplan-tests/webhook-source/issues/9',
        updated_at: '2026-09-10T00:00:00Z',
      },
    };
  }

  function signedWebhook(
    event: 'push' | 'pull_request' | 'issues',
    payload: Record<string, unknown>,
    deliveryId = randomUUID(),
  ) {
    const body = JSON.stringify(payload);
    const signature = `sha256=${createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex')}`;
    return request(app.getHttpServer())
      .post('/api/github/webhooks')
      .set('Content-Type', 'application/json')
      .set('x-github-event', event)
      .set('x-github-delivery', deliveryId)
      .set('x-hub-signature-256', signature)
      .send(body);
  }

  function connection() {
    return {
      installationId,
      externalRepositoryId: '123456',
    };
  }

  function verifiedRepository() {
    return {
      externalRepositoryId: '123456',
      owner: 'flowplan-tests',
      name: 'project-alpha',
      fullName: 'flowplan-tests/project-alpha',
      defaultBranch: 'main',
      htmlUrl: 'https://github.com/flowplan-tests/project-alpha',
      private: true,
      archived: false,
    };
  }

  function verifiedIssue(number: number) {
    return {
      externalIssueId: String(900000 + number),
      number,
      title: `GitHub Issue ${number}`,
      body: `Body for Issue ${number}`,
      state: 'open' as const,
      htmlUrl: `https://github.com/flowplan-tests/project-alpha/issues/${number}`,
      updatedAt: '2026-09-10T00:00:00Z',
    };
  }

  it('persists only an authenticated user-verified GitHub App installation', async () => {
    await request(app.getHttpServer())
      .post('/api/github/app/install-url')
      .expect(401);
    const start = await ownerClient
      .post('/api/github/app/install-url')
      .expect(201);
    const state = new URL((start.body as { url: string }).url).searchParams.get(
      'state',
    )!;
    await ownerClient
      .get('/api/github/app/setup')
      .query({ installation_id: '988', setup_action: 'install', state })
      .expect(302)
      .expect(
        'Location',
        'https://github.com/login/oauth/authorize?state=test',
      );
    const callback = await ownerClient
      .get('/api/github/app/callback')
      .query({ code: 'oauth-code', state })
      .expect(200);
    expect(callback.body).toMatchObject({
      externalInstallationId: '988',
      accountLogin: 'flowplan-callback',
    });
    expect(githubClient.verifyUserInstallation).toHaveBeenCalledWith(
      'ghu_transient',
      '988',
    );
    expect(JSON.stringify(callback.body)).not.toContain('ghu_transient');
  });

  it('lists only the current user installations and discovers repositories with Project-safe IDs', async () => {
    await ownerClient.get('/api/github/app/installations').expect(200);
    await memberClient.get('/api/github/app/installations').expect(200, []);
    const response = await ownerClient
      .get(`/api/github/app/installations/${installationId}/repositories`)
      .query({ page: 1, perPage: 30 })
      .expect(200);
    expect(response.body).toMatchObject({
      items: [{ externalRepositoryId: '123456' }],
      nextPage: null,
    });
    await memberClient
      .get(`/api/github/app/installations/${installationId}/repositories`)
      .expect(404);
  });

  it('protects scoped reads and allows collaborators to see the connection state', async () => {
    await request(app.getHttpServer())
      .get(`/api/projects/${projectA.id}/repository`)
      .expect(401);
    await ownerClient
      .get(`/api/projects/${projectA.id}/repository`)
      .expect(200)
      .expect((response) => expect(response.text).toBe(''));
    await memberClient
      .get(`/api/projects/${projectA.id}/repository`)
      .expect(200)
      .expect((response) => expect(response.text).toBe(''));
    await outsiderClient
      .get(`/api/projects/${projectA.id}/repository`)
      .expect(403);
  });

  it('allows an owner to connect, rejects member administration, invalid DTOs, and duplicates', async () => {
    await memberClient
      .post(`/api/projects/${projectA.id}/repository`)
      .send(connection())
      .expect(403);
    await ownerClient
      .post(`/api/projects/${projectA.id}/repository`)
      .send({ ...connection(), provider: 'gitlab' })
      .expect(400);
    await ownerClient
      .post(`/api/projects/${projectA.id}/repository`)
      .send({ ...connection(), owner: 'spoofed-owner' })
      .expect(400);

    const connected = await ownerClient
      .post(`/api/projects/${projectA.id}/repository`)
      .send(connection())
      .expect(201);
    const body = connected.body as RepositoryResponse;
    expect(body).toMatchObject({
      projectId: projectA.id,
      provider: 'github',
      fullName: 'flowplan-tests/project-alpha',
      htmlUrl: 'https://github.com/flowplan-tests/project-alpha',
      installationId,
    });
    expect(body).not.toHaveProperty('webhookId');
    expect(body).not.toHaveProperty('secret');

    await ownerClient
      .post(`/api/projects/${projectA.id}/repository`)
      .send(connection())
      .expect(409);
    await ownerClient
      .post(`/api/projects/${projectB.id}/repository`)
      .send(connection())
      .expect(409);
    expect(
      await prisma.activity.count({
        where: {
          projectId: projectA.id,
          type: 'GITHUB_REPOSITORY_CONNECTED',
        },
      }),
    ).toBe(1);
  });

  it('rejects missing/invalid signatures and signed events from unknown repositories', async () => {
    const body = JSON.stringify(eventPayload('push'));
    await request(app.getHttpServer())
      .post('/api/github/webhooks')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-github-delivery', randomUUID())
      .send(body)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/github/webhooks')
      .set('Content-Type', 'application/json')
      .set('x-github-event', 'push')
      .set('x-github-delivery', randomUUID())
      .set('x-hub-signature-256', `sha256=${'0'.repeat(64)}`)
      .send(body)
      .expect(401);
    await signedWebhook('push', eventPayload('push', '999999')).expect(404);
  });

  it.each(['push', 'pull_request', 'issues'] as const)(
    'verifies and normalizes a connected %s event',
    async (event) => {
      const deliveryId = randomUUID();
      const response = await signedWebhook(
        event,
        eventPayload(event),
        deliveryId,
      ).expect(202);
      expect(response.body).toEqual({
        accepted: true,
        duplicate: false,
        deliveryId,
      });
      const delivery = await prisma.githubWebhookDelivery.findUniqueOrThrow({
        where: { deliveryId },
      });
      expect(delivery).toMatchObject({ eventType: event, status: 'PROCESSED' });
      expect(delivery.processedAt).toBeInstanceOf(Date);
      expect(JSON.stringify(delivery.metadata)).not.toContain(
        'payload body must not be retained',
      );
      expect(JSON.stringify(delivery)).not.toContain(webhookSecret);
    },
  );

  it('handles duplicate deliveries idempotently without duplicate normalized rows', async () => {
    const deliveryId = randomUUID();
    const payload = eventPayload('issues');
    await signedWebhook('issues', payload, deliveryId).expect(202);
    const repeated = await signedWebhook('issues', payload, deliveryId).expect(
      202,
    );
    expect(repeated.body).toEqual({
      accepted: true,
      duplicate: true,
      deliveryId,
    });
    expect(
      await prisma.githubWebhookDelivery.count({ where: { deliveryId } }),
    ).toBe(1);
  });

  it('links and imports verified Issues with database conflict protection', async () => {
    const repository = await prisma.repository.findUniqueOrThrow({
      where: { projectId: projectA.id },
    });
    const column = await prisma.column.findFirstOrThrow({
      where: { projectId: projectA.id },
      orderBy: { position: 'asc' },
    });
    const taskResponses = await Promise.all(
      ['Link target A', 'Link target B', 'Link target C'].map((title) =>
        memberClient
          .post('/api/tasks')
          .send({ title, projectId: projectA.id, columnId: column.id })
          .expect(201),
      ),
    );
    const taskIds = taskResponses.map(
      (response) => (response.body as { id: string }).id,
    );

    await outsiderClient
      .get(`/api/projects/${projectA.id}/github/issues`)
      .expect(403);
    const discovery = await memberClient
      .get(`/api/projects/${projectA.id}/github/issues`)
      .query({ page: 1, perPage: 30, state: 'open' })
      .expect(200);
    expect(discovery.body).toMatchObject({
      repository: { id: repository.id },
      items: [{ number: 42, linkedTask: null }],
    });

    await memberClient
      .post(`/api/tasks/${taskIds[0]}/github/link`)
      .send({ issueNumber: 42, owner: 'spoofed' })
      .expect(400);
    const linked = await memberClient
      .post(`/api/tasks/${taskIds[0]}/github/link`)
      .send({ issueNumber: 42 })
      .expect(201);
    expect(linked.body).toMatchObject({
      taskId: taskIds[0],
      externalIssueId: '900042',
      number: 42,
      repository: { fullName: 'flowplan-tests/project-alpha' },
    });
    expect(JSON.stringify(linked.body)).not.toContain('token');
    await outsiderClient.get(`/api/tasks/${taskIds[0]}/github`).expect(403);

    const concurrentLinks = await Promise.all([
      memberClient
        .post(`/api/tasks/${taskIds[1]}/github/link`)
        .send({ issueNumber: 44 }),
      memberClient
        .post(`/api/tasks/${taskIds[2]}/github/link`)
        .send({ issueNumber: 44 }),
    ]);
    expect(concurrentLinks.map(({ status }) => status).sort()).toEqual([
      201, 409,
    ]);

    const concurrentImports = await Promise.all([
      memberClient
        .post(`/api/projects/${projectA.id}/github/issues/43/create-task`)
        .send({ columnId: column.id }),
      memberClient
        .post(`/api/projects/${projectA.id}/github/issues/43/create-task`)
        .send({ columnId: column.id }),
    ]);
    expect(concurrentImports.map(({ status }) => status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await prisma.issue.count({
        where: { repositoryId: repository.id, externalIssueId: '900043' },
      }),
    ).toBe(1);
  });

  it('syncs only a linked Issue and unlink stops later webhook changes', async () => {
    const repository = await prisma.repository.findUniqueOrThrow({
      where: { projectId: projectA.id },
    });
    const link = await prisma.issue.findUniqueOrThrow({
      where: {
        repositoryId_externalIssueId: {
          repositoryId: repository.id,
          externalIssueId: '900042',
        },
      },
    });
    const notificationCount = await prisma.notification.count({
      where: { projectId: projectA.id },
    });
    const payload = {
      repository: {
        id: 123456,
        full_name: 'flowplan-tests/project-alpha',
      },
      sender: { login: 'octocat' },
      action: 'edited',
      issue: {
        id: 900042,
        number: 42,
        title: 'GitHub changed title',
        body: 'GitHub changed body',
        state: 'closed',
        html_url: 'https://github.com/flowplan-tests/project-alpha/issues/42',
        updated_at: '2026-09-10T01:00:00Z',
      },
    };
    await signedWebhook('issues', payload).expect(202);
    expect(
      await prisma.task.findUniqueOrThrow({ where: { id: link.taskId! } }),
    ).toMatchObject({
      title: 'GitHub changed title',
      description: 'GitHub changed body',
    });

    await memberClient
      .delete(`/api/tasks/${link.taskId!}/github/link`)
      .expect(204);
    await signedWebhook('issues', {
      ...payload,
      issue: { ...payload.issue, title: 'Must not synchronize' },
    }).expect(202);
    expect(
      await prisma.task.findUniqueOrThrow({ where: { id: link.taskId! } }),
    ).toMatchObject({ title: 'GitHub changed title' });
    expect(
      await prisma.notification.count({ where: { projectId: projectA.id } }),
    ).toBe(notificationCount);
  });

  it('allows owner disconnect, preserves replay protection, and leaves a user-attributed Activity event', async () => {
    const repository = await prisma.repository.findUniqueOrThrow({
      where: { projectId: projectA.id },
    });
    await prisma.githubWebhookDelivery.create({
      data: {
        deliveryId: randomUUID(),
        eventType: 'push',
        status: 'PROCESSED',
        projectId: projectA.id,
        repositoryId: repository.id,
      },
    });
    await memberClient
      .delete(`/api/projects/${projectA.id}/repository`)
      .expect(403);
    await ownerClient
      .delete(`/api/projects/${projectA.id}/repository`)
      .expect(204);
    const retainedDelivery =
      await prisma.githubWebhookDelivery.findFirstOrThrow({
        where: { deliveryId: { not: '' }, projectId: projectA.id },
        orderBy: { receivedAt: 'desc' },
      });
    expect(retainedDelivery.repositoryId).toBeNull();
    await ownerClient
      .get(`/api/projects/${projectA.id}/repository`)
      .expect(200)
      .expect((response) => expect(response.text).toBe(''));
    expect(
      await prisma.activity.count({
        where: {
          projectId: projectA.id,
          type: 'GITHUB_REPOSITORY_DISCONNECTED',
          userId: ownerId,
        },
      }),
    ).toBe(1);
    await request(app.getHttpServer()).post('/api/repositories').expect(404);
  });
});
