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
  board: { columns: Array<{ id: string }> };
}

interface CommentItem {
  id: string;
  taskId: string;
  parentId: string | null;
  content: string | null;
  deletedAt: string | null;
  author: { id: string; name: string; email: string; image: string | null };
}

describe('Comments core backend (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let activities: ActivitiesService;
  let ownerClient: ReturnType<typeof request.agent>;
  let orgMemberClient: ReturnType<typeof request.agent>;
  let projectMemberClient: ReturnType<typeof request.agent>;
  let projectOwnerClient: ReturnType<typeof request.agent>;
  let outsiderClient: ReturnType<typeof request.agent>;
  let ownerId = '';
  let orgMemberId = '';
  let projectMemberId = '';
  let projectOwnerId = '';
  let outsiderId = '';
  let projectA: ProjectSetup;
  let projectB: ProjectSetup;
  let taskA = '';
  let taskA2 = '';
  let taskB = '';

  const runId = Date.now().toString(36);
  const password = 'CommentsE2ePassword123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    activities = moduleFixture.get(ActivitiesService);

    ownerClient = request.agent(app.getHttpServer());
    orgMemberClient = request.agent(app.getHttpServer());
    projectMemberClient = request.agent(app.getHttpServer());
    projectOwnerClient = request.agent(app.getHttpServer());
    outsiderClient = request.agent(app.getHttpServer());
    const users = [
      ['Owner', `comments-owner-${runId}@test.dev`, ownerClient],
      ['Org Member', `comments-org-${runId}@test.dev`, orgMemberClient],
      [
        'Project Member',
        `comments-project-${runId}@test.dev`,
        projectMemberClient,
      ],
      [
        'Project Owner',
        `comments-project-owner-${runId}@test.dev`,
        projectOwnerClient,
      ],
      ['Outsider', `comments-outsider-${runId}@test.dev`, outsiderClient],
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
    projectOwnerId = idFor(users[3][1]);
    outsiderId = idFor(users[4][1]);

    projectA = await createProject('Comments A', `comments-a-${runId}`);
    projectB = await createProject('Comments B', `comments-b-${runId}`);
    await prisma.organizationMember.createMany({
      data: [orgMemberId, projectOwnerId].map((userId) => ({
        organizationId: projectA.organizationId,
        userId,
      })),
    });
    await prisma.projectMember.createMany({
      data: [
        {
          projectId: projectA.id,
          userId: projectMemberId,
          role: ProjectRole.MEMBER,
        },
        {
          projectId: projectA.id,
          userId: projectOwnerId,
          role: ProjectRole.OWNER,
        },
      ],
    });
    taskA = await createTask(projectA, 'Task A');
    taskA2 = await createTask(projectA, 'Task A2');
    taskB = await createTask(projectB, 'Task B');
  });

  afterAll(async () => {
    if (prisma) {
      const userIds = [
        ownerId,
        orgMemberId,
        projectMemberId,
        projectOwnerId,
        outsiderId,
      ];
      const organizations = await prisma.organization.findMany({
        where: { ownerId },
        select: { id: true },
      });
      const organizationIds = organizations.map(({ id }) => id);
      const projects = await prisma.project.findMany({
        where: { organizationId: { in: organizationIds } },
        select: { id: true },
      });
      const projectIds = projects.map(({ id }) => id);
      await prisma.comment.deleteMany({
        where: { task: { projectId: { in: projectIds } } },
      });
      await prisma.notification.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.activity.deleteMany({
        where: {
          OR: [{ projectId: { in: projectIds } }, { userId: { in: userIds } }],
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

  async function createTask(project: ProjectSetup, title: string) {
    const response = await ownerClient
      .post('/api/tasks')
      .send({
        title,
        projectId: project.id,
        columnId: project.board.columns[0].id,
      })
      .expect(201);
    return (response.body as { id: string }).id;
  }

  async function createComment(
    client: ReturnType<typeof request.agent>,
    taskId: string,
    content: string,
    parentId?: string,
  ): Promise<CommentItem> {
    const response = await client
      .post(`/api/tasks/${taskId}/comments`)
      .send({ content, ...(parentId && { parentId }) })
      .expect(201);
    return response.body as CommentItem;
  }

  it('protects listing and permits all three Project access paths', async () => {
    await request(app.getHttpServer())
      .get(`/api/tasks/${taskA}/comments`)
      .expect(401);
    await ownerClient.get(`/api/tasks/${taskA}/comments`).expect(200);
    await orgMemberClient.get(`/api/tasks/${taskA}/comments`).expect(200);
    await projectMemberClient.get(`/api/tasks/${taskA}/comments`).expect(200);
    await outsiderClient.get(`/api/tasks/${taskA}/comments`).expect(403);
    await ownerClient
      .post('/api/comments')
      .send({ content: 'Nope' })
      .expect(404);
  });

  it('creates roots/replies and strictly validates content and parent scope', async () => {
    const root = await createComment(orgMemberClient, taskA, '  Root  ');
    expect(root.content).toBe('Root');
    const reply = await createComment(
      projectMemberClient,
      taskA,
      'Reply',
      root.id,
    );
    expect(reply.parentId).toBe(root.id);
    const otherTaskParent = await createComment(ownerClient, taskA2, 'Other');
    const beforeRejected = await prisma.activity.count({
      where: { projectId: projectA.id },
    });
    await ownerClient
      .post(`/api/tasks/${taskA}/comments`)
      .send({ content: 'Bad reply', parentId: otherTaskParent.id })
      .expect(400);
    expect(
      await prisma.activity.count({ where: { projectId: projectA.id } }),
    ).toBe(beforeRejected);

    await ownerClient
      .post(`/api/tasks/${taskA}/comments`)
      .send({ content: '' })
      .expect(400);
    await ownerClient
      .post(`/api/tasks/${taskA}/comments`)
      .send({ content: '   ' })
      .expect(400);
    await ownerClient
      .post(`/api/tasks/${taskA}/comments`)
      .send({ content: 'x'.repeat(5001) })
      .expect(400);
    await ownerClient
      .post(`/api/tasks/${taskA}/comments`)
      .send({ content: 'Valid', unknown: true })
      .expect(400);
    await ownerClient.get('/api/tasks/not-a-uuid/comments').expect(400);
    await ownerClient
      .patch(`/api/tasks/${taskA}/comments/not-a-uuid`)
      .send({ content: 'Valid' })
      .expect(400);
  });

  it('enforces author-only editing, rejects deleted edits, and omits no-op Activity', async () => {
    const editable = await createComment(orgMemberClient, taskA, 'Before edit');
    const beforeNoop = await prisma.activity.count({
      where: { type: ActivityEvent.COMMENT_UPDATED, projectId: projectA.id },
    });
    await orgMemberClient
      .patch(`/api/tasks/${taskA}/comments/${editable.id}`)
      .send({ content: 'Before edit' })
      .expect(200);
    expect(
      await prisma.activity.count({
        where: { type: ActivityEvent.COMMENT_UPDATED, projectId: projectA.id },
      }),
    ).toBe(beforeNoop);
    await ownerClient
      .patch(`/api/tasks/${taskA}/comments/${editable.id}`)
      .send({ content: 'Owner edit' })
      .expect(403);
    await projectOwnerClient
      .patch(`/api/tasks/${taskA}/comments/${editable.id}`)
      .send({ content: 'Project owner edit' })
      .expect(403);
    await orgMemberClient
      .patch(`/api/tasks/${taskA}/comments/${editable.id}`)
      .send({ content: 'After edit' })
      .expect(200);

    await orgMemberClient
      .delete(`/api/tasks/${taskA}/comments/${editable.id}`)
      .expect(204);
    await orgMemberClient
      .patch(`/api/tasks/${taskA}/comments/${editable.id}`)
      .send({ content: 'Restore attempt' })
      .expect(409);
  });

  it('applies author/owner moderation rules and idempotent tombstone deletion', async () => {
    const projectMemberComment = await createComment(
      projectMemberClient,
      taskA,
      'Moderate by project owner',
    );
    await orgMemberClient
      .delete(`/api/tasks/${taskA}/comments/${projectMemberComment.id}`)
      .expect(403);
    await projectOwnerClient
      .delete(`/api/tasks/${taskA}/comments/${projectMemberComment.id}`)
      .expect(204);

    const orgMemberComment = await createComment(
      orgMemberClient,
      taskA,
      'Moderate by org owner',
    );
    await projectMemberClient
      .delete(`/api/tasks/${taskA}/comments/${orgMemberComment.id}`)
      .expect(403);
    await ownerClient
      .delete(`/api/tasks/${taskA}/comments/${orgMemberComment.id}`)
      .expect(204);
    const deleteActivities = await prisma.activity.count({
      where: {
        type: ActivityEvent.COMMENT_DELETED,
        metadata: { path: ['commentId'], equals: orgMemberComment.id },
      },
    });
    await ownerClient
      .delete(`/api/tasks/${taskA}/comments/${orgMemberComment.id}`)
      .expect(204);
    expect(
      await prisma.activity.count({
        where: {
          type: ActivityEvent.COMMENT_DELETED,
          metadata: { path: ['commentId'], equals: orgMemberComment.id },
        },
      }),
    ).toBe(deleteActivities);
    const stored = await prisma.comment.findUniqueOrThrow({
      where: { id: orgMemberComment.id },
    });
    expect(stored.content).toBe('');
    expect(stored.deletedAt).not.toBeNull();
    const listed = await ownerClient
      .get(`/api/tasks/${taskA}/comments`)
      .expect(200);
    const tombstone = (listed.body as { items: CommentItem[] }).items.find(
      (item) => item.id === orgMemberComment.id,
    )!;
    expect(tombstone.content).toBeNull();
    expect(tombstone.deletedAt).not.toBeNull();
  });

  it('keeps replies attached to a deleted parent', async () => {
    const parent = await createComment(ownerClient, taskA, 'Parent secret');
    const reply = await createComment(ownerClient, taskA, 'Child', parent.id);
    await ownerClient
      .delete(`/api/tasks/${taskA}/comments/${parent.id}`)
      .expect(204);
    const response = await ownerClient
      .get(`/api/tasks/${taskA}/comments`)
      .expect(200);
    const items = (response.body as { items: CommentItem[] }).items;
    expect(items.find(({ id }) => id === parent.id)?.content).toBeNull();
    expect(items.find(({ id }) => id === reply.id)?.parentId).toBe(parent.id);
  });

  it('isolates nested IDs/cursors and paginates deterministically oldest first', async () => {
    const projectBComment = await createComment(ownerClient, taskB, 'B');
    await ownerClient
      .patch(`/api/tasks/${taskA}/comments/${projectBComment.id}`)
      .send({ content: 'Cross task' })
      .expect(404);
    await ownerClient
      .get(`/api/tasks/${taskA}/comments?cursor=${projectBComment.id}`)
      .expect(404);

    await prisma.comment.deleteMany({ where: { taskId: taskA2 } });
    const pageIds: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const row = await prisma.comment.create({
        data: {
          taskId: taskA2,
          authorId: ownerId,
          content: `Page ${index}`,
          createdAt: new Date(`2026-02-0${index + 1}T00:00:00Z`),
        },
      });
      pageIds.push(row.id);
    }
    const first = await ownerClient
      .get(`/api/tasks/${taskA2}/comments?limit=2`)
      .expect(200);
    const firstBody = first.body as {
      items: CommentItem[];
      nextCursor: string;
    };
    expect(firstBody.items.map(({ id }) => id)).toEqual(pageIds.slice(0, 2));
    expect(firstBody.nextCursor).toBe(pageIds[1]);
    const second = await ownerClient
      .get(
        `/api/tasks/${taskA2}/comments?limit=2&cursor=${firstBody.nextCursor}`,
      )
      .expect(200);
    expect((second.body as { items: CommentItem[] }).items[0]?.id).toBe(
      pageIds[2],
    );
  });

  it('records privacy-safe events, omits rejected events, and rolls back on Activity failure', async () => {
    const created = await createComment(ownerClient, taskA, 'Never log this');
    await ownerClient
      .patch(`/api/tasks/${taskA}/comments/${created.id}`)
      .send({ content: 'Still never log this' })
      .expect(200);
    await ownerClient
      .delete(`/api/tasks/${taskA}/comments/${created.id}`)
      .expect(204);
    const events = await prisma.activity.findMany({
      where: {
        projectId: projectA.id,
        type: {
          in: [
            ActivityEvent.COMMENT_CREATED,
            ActivityEvent.COMMENT_UPDATED,
            ActivityEvent.COMMENT_DELETED,
          ],
        },
        metadata: { path: ['commentId'], equals: created.id },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map(({ type }) => type)).toEqual([
      ActivityEvent.COMMENT_CREATED,
      ActivityEvent.COMMENT_UPDATED,
      ActivityEvent.COMMENT_DELETED,
    ]);
    expect(JSON.stringify(events)).not.toContain('Never log this');
    expect(JSON.stringify(events)).not.toContain('Still never log this');

    const spy = jest
      .spyOn(activities, 'record')
      .mockRejectedValueOnce(new Error('forced Activity failure'));
    await ownerClient
      .post(`/api/tasks/${taskA}/comments`)
      .send({ content: 'Must roll back' })
      .expect(500);
    expect(
      await prisma.comment.findFirst({
        where: { taskId: taskA, content: 'Must roll back' },
      }),
    ).toBeNull();
    spy.mockRestore();
  });

  it('cascades Comments on Task deletion while preserving TASK_DELETED history', async () => {
    const taskId = await createTask(projectA, 'Delete with Comments');
    const comment = await createComment(ownerClient, taskId, 'Will cascade');
    await ownerClient.delete(`/api/tasks/${taskId}`).expect(204);
    expect(await prisma.comment.findUnique({ where: { id: comment.id } })).toBe(
      null,
    );
    const deletion = await prisma.activity.findFirstOrThrow({
      where: {
        type: ActivityEvent.TASK_DELETED,
        projectId: projectA.id,
        metadata: { path: ['taskId'], equals: taskId },
      },
    });
    expect(deletion.taskId).toBeNull();
    expect(deletion.projectId).toBe(projectA.id);
  });
});
