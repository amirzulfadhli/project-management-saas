import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import request from 'supertest';
import { App } from 'supertest/types';
import { ProjectRole } from '../generated/prisma/client';
import { ActivitiesService } from '../src/activities/activities.service';
import { ActivityEvent } from '../src/activities/activity.types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface ProjectSetup {
  id: string;
  organizationId: string;
  board: { columns: Array<{ id: string; name: string }> };
}

interface ActivityItem {
  id: string;
  type: string;
  taskId: string | null;
  projectId: string;
  metadata: Record<string, unknown> | null;
  actor: { id: string };
}

describe('Activity core backend (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let activityService: ActivitiesService;
  let ownerClient: ReturnType<typeof request.agent>;
  let orgMemberClient: ReturnType<typeof request.agent>;
  let projectMemberClient: ReturnType<typeof request.agent>;
  let outsiderClient: ReturnType<typeof request.agent>;
  let ownerId = '';
  let orgMemberId = '';
  let projectMemberId = '';
  let outsiderId = '';
  let projectA: ProjectSetup;
  let projectB: ProjectSetup;

  const runId = Date.now().toString(36);
  const password = 'ActivityE2ePassword123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    activityService = moduleFixture.get(ActivitiesService);

    ownerClient = request.agent(app.getHttpServer());
    orgMemberClient = request.agent(app.getHttpServer());
    projectMemberClient = request.agent(app.getHttpServer());
    outsiderClient = request.agent(app.getHttpServer());
    const users = [
      ['Owner', `activity-owner-${runId}@test.dev`, ownerClient],
      ['Org Member', `activity-org-${runId}@test.dev`, orgMemberClient],
      [
        'Project Member',
        `activity-project-${runId}@test.dev`,
        projectMemberClient,
      ],
      ['Outsider', `activity-outsider-${runId}@test.dev`, outsiderClient],
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
    orgMemberId = idFor(users[1][1]);
    projectMemberId = idFor(users[2][1]);
    outsiderId = idFor(users[3][1]);

    projectA = await createProject('Activity A', `activity-a-${runId}`);
    projectB = await createProject('Activity B', `activity-b-${runId}`);
    await prisma.organizationMember.createMany({
      data: [projectA.organizationId, projectB.organizationId].map(
        (organizationId) => ({ organizationId, userId: orgMemberId }),
      ),
    });
    await prisma.projectMember.create({
      data: {
        projectId: projectA.id,
        userId: projectMemberId,
        role: ProjectRole.MEMBER,
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      const organizations = await prisma.organization.findMany({
        where: { ownerId },
        select: { id: true },
      });
      const organizationIds = organizations.map(
        (organization) => organization.id,
      );
      const projects = await prisma.project.findMany({
        where: { organizationId: { in: organizationIds } },
        select: { id: true },
      });
      const projectIds = projects.map((project) => project.id);
      await prisma.notification.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.activity.deleteMany({
        where: {
          OR: [
            { projectId: { in: projectIds } },
            {
              userId: {
                in: [ownerId, orgMemberId, projectMemberId, outsiderId],
              },
            },
          ],
        },
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
      const userIds = [ownerId, orgMemberId, projectMemberId, outsiderId];
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  async function createProject(
    name: string,
    slug: string,
  ): Promise<ProjectSetup> {
    const organization = await ownerClient
      .post('/api/organizations')
      .send({ name: `${name} Org`, slug })
      .expect(201);
    const project = await ownerClient
      .post('/api/projects')
      .send({ name, organizationId: (organization.body as { id: string }).id })
      .expect(201);
    return project.body as ProjectSetup;
  }

  async function feed(projectId: string): Promise<ActivityItem[]> {
    const response = await ownerClient
      .get(`/api/projects/${projectId}/activities`)
      .expect(200);
    return (response.body as { items: ActivityItem[] }).items;
  }

  it('protects the read API, supports every Project access path, and exposes no mutation route', async () => {
    await request(app.getHttpServer())
      .get(`/api/projects/${projectA.id}/activities`)
      .expect(401);
    await ownerClient
      .get(`/api/projects/${projectA.id}/activities`)
      .expect(200);
    await orgMemberClient
      .get(`/api/projects/${projectA.id}/activities`)
      .expect(200);
    await projectMemberClient
      .get(`/api/projects/${projectA.id}/activities`)
      .expect(200);
    await outsiderClient
      .get(`/api/projects/${projectA.id}/activities`)
      .expect(403);
    await ownerClient
      .post(`/api/projects/${projectA.id}/activities`)
      .send({ type: 'FAKE' })
      .expect(404);
  });

  it('isolates cursors and paginates deterministically newest first', async () => {
    await prisma.notification.deleteMany({
      where: { projectId: projectB.id },
    });
    await prisma.activity.deleteMany({ where: { projectId: projectB.id } });
    for (let index = 0; index < 3; index += 1) {
      await prisma.activity.create({
        data: {
          type: ActivityEvent.PROJECT_UPDATED,
          description: `Page ${index}`,
          projectId: projectB.id,
          userId: ownerId,
          createdAt: new Date(`2026-01-0${index + 1}T00:00:00Z`),
        },
      });
    }
    const first = await ownerClient
      .get(`/api/projects/${projectB.id}/activities?limit=2`)
      .expect(200);
    const firstBody = first.body as {
      items: ActivityItem[];
      nextCursor: string;
    };
    expect(firstBody.items).toHaveLength(2);
    expect(firstBody.nextCursor).toBe(firstBody.items[1].id);
    const second = await ownerClient
      .get(
        `/api/projects/${projectB.id}/activities?limit=2&cursor=${firstBody.nextCursor}`,
      )
      .expect(200);
    expect((second.body as { items: ActivityItem[] }).items).toHaveLength(1);
    await ownerClient
      .get(
        `/api/projects/${projectA.id}/activities?cursor=${firstBody.items[0].id}`,
      )
      .expect(404);
    await ownerClient
      .get(`/api/projects/${projectA.id}/activities?limit=101`)
      .expect(400);
  });

  it('records Project create, real update, archive, restore, and duplicate events', async () => {
    expect(
      (await feed(projectA.id)).some(
        (item) => item.type === ActivityEvent.PROJECT_CREATED,
      ),
    ).toBe(true);
    await ownerClient
      .patch(`/api/projects/${projectA.id}`)
      .send({ name: 'Activity A Renamed' })
      .expect(200);
    await ownerClient
      .patch(`/api/projects/${projectA.id}`)
      .send({ name: 'Activity A Renamed' })
      .expect(200);
    await ownerClient.delete(`/api/projects/${projectA.id}`).expect(204);
    await ownerClient.post(`/api/projects/${projectA.id}/restore`).expect(200);
    const duplicate = await ownerClient
      .post(`/api/projects/${projectA.id}/duplicate`)
      .expect(201);
    const duplicateId = (duplicate.body as { id: string }).id;
    const types = (await feed(projectA.id)).map((item) => item.type);
    expect(
      types.filter((type) => type === ActivityEvent.PROJECT_UPDATED),
    ).toHaveLength(1);
    expect(types).toContain(ActivityEvent.PROJECT_ARCHIVED);
    expect(types).toContain(ActivityEvent.PROJECT_RESTORED);
    expect((await feed(duplicateId)).map((item) => item.type)).toContain(
      ActivityEvent.PROJECT_DUPLICATED,
    );
  });

  it('records semantic Task changes, omits no-ops/rejections, and preserves deletion history', async () => {
    const created = await ownerClient
      .post('/api/tasks')
      .send({
        title: 'Activity Task',
        projectId: projectA.id,
        columnId: projectA.board.columns[0].id,
        assigneeId: orgMemberId,
      })
      .expect(201);
    const taskId = (created.body as { id: string }).id;
    await ownerClient
      .patch(`/api/tasks/${taskId}`)
      .send({
        title: 'Renamed Task',
        columnId: projectA.board.columns[1].id,
        assigneeId: null,
        priority: 3,
        description: 'Changed',
      })
      .expect(200);
    const countBeforeNoop = await prisma.activity.count({
      where: { projectId: projectA.id },
    });
    await ownerClient
      .patch(`/api/tasks/${taskId}`)
      .send({ title: 'Renamed Task', priority: 3 })
      .expect(200);
    expect(
      await prisma.activity.count({ where: { projectId: projectA.id } }),
    ).toBe(countBeforeNoop);
    await ownerClient
      .patch(`/api/tasks/${taskId}`)
      .send({ columnId: projectB.board.columns[0].id })
      .expect(400);
    expect(
      await prisma.activity.count({ where: { projectId: projectA.id } }),
    ).toBe(countBeforeNoop);
    await ownerClient.delete(`/api/tasks/${taskId}`).expect(204);

    const activities = await feed(projectA.id);
    const types = activities.map((item) => item.type);
    for (const type of [
      ActivityEvent.TASK_CREATED,
      ActivityEvent.TASK_RENAMED,
      ActivityEvent.TASK_MOVED,
      ActivityEvent.TASK_ASSIGNEE_CHANGED,
      ActivityEvent.TASK_PRIORITY_CHANGED,
      ActivityEvent.TASK_UPDATED,
      ActivityEvent.TASK_DELETED,
    ])
      expect(types).toContain(type);
    const deleted = activities.find(
      (item) => item.type === ActivityEvent.TASK_DELETED,
    )!;
    expect(deleted.taskId).toBeNull();
    expect(deleted.projectId).toBe(projectA.id);
    expect(deleted.metadata).toEqual(
      expect.objectContaining({ taskId, title: 'Renamed Task' }),
    );
  });

  it('records successful membership changes but not no-ops, duplicates, or final-owner conflicts', async () => {
    const added = await ownerClient
      .post(`/api/projects/${projectA.id}/members`)
      .send({ userId: orgMemberId, role: 'MEMBER' })
      .expect(201);
    const memberId = (added.body as { id: string }).id;
    const afterAdd = await prisma.activity.count({
      where: { projectId: projectA.id },
    });
    await ownerClient
      .patch(`/api/projects/${projectA.id}/members/${memberId}`)
      .send({ role: 'MEMBER' })
      .expect(200);
    expect(
      await prisma.activity.count({ where: { projectId: projectA.id } }),
    ).toBe(afterAdd);
    await ownerClient
      .post(`/api/projects/${projectA.id}/members`)
      .send({ userId: orgMemberId })
      .expect(409);
    expect(
      await prisma.activity.count({ where: { projectId: projectA.id } }),
    ).toBe(afterAdd);
    await ownerClient
      .patch(`/api/projects/${projectA.id}/members/${memberId}`)
      .send({ role: 'OWNER' })
      .expect(200);
    await ownerClient
      .delete(`/api/projects/${projectA.id}/members/${memberId}`)
      .expect(204);
    const creator = await prisma.projectMember.findFirstOrThrow({
      where: { projectId: projectA.id, userId: ownerId },
    });
    const beforeConflict = await prisma.activity.count({
      where: { projectId: projectA.id },
    });
    await ownerClient
      .delete(`/api/projects/${projectA.id}/members/${creator.id}`)
      .expect(409);
    expect(
      await prisma.activity.count({ where: { projectId: projectA.id } }),
    ).toBe(beforeConflict);
    const types = (await feed(projectA.id)).map((item) => item.type);
    expect(types).toEqual(
      expect.arrayContaining([
        ActivityEvent.PROJECT_MEMBER_ADDED,
        ActivityEvent.PROJECT_MEMBER_ROLE_CHANGED,
        ActivityEvent.PROJECT_MEMBER_REMOVED,
      ]),
    );
  });

  it('rolls back a domain mutation when Activity recording fails', async () => {
    const spy = jest
      .spyOn(activityService, 'record')
      .mockRejectedValueOnce(new Error('forced activity failure'));
    await ownerClient
      .post('/api/tasks')
      .send({
        title: 'Must Roll Back',
        projectId: projectA.id,
        columnId: projectA.board.columns[0].id,
      })
      .expect(500);
    expect(
      await prisma.task.findFirst({
        where: { projectId: projectA.id, title: 'Must Roll Back' },
      }),
    ).toBeNull();
    spy.mockRestore();
  });
});
