import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface ProjectSetup {
  id: string;
  organizationId: string;
  board: {
    columns: Array<{ id: string; name: string; position: number }>;
  };
}

interface TaskResponse {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  columnId: string;
  assigneeId: string | null;
  reporterId: string;
  priority: number;
  status: string;
  dueDate: string | null;
  column: { id: string; name: string; position: number };
  project: { id: string; name: string };
  assignee: { id: string; email: string } | null;
  reporter: { id: string; email: string };
}

describe('Task core lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerClient: ReturnType<typeof request.agent>;
  let outsiderClient: ReturnType<typeof request.agent>;
  let ownerId: string;
  let outsiderId: string;
  let projectA: ProjectSetup;
  let projectB: ProjectSetup;

  const runId = Date.now().toString(36);
  const ownerEmail = 'task-owner-' + runId + '@example.test';
  const outsiderEmail = 'task-outsider-' + runId + '@example.test';
  const password = 'TaskE2ePassword123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    ownerClient = request.agent(app.getHttpServer());
    outsiderClient = request.agent(app.getHttpServer());

    await ownerClient
      .post('/api/auth/sign-up/email')
      .send({ name: 'Task Owner', email: ownerEmail, password })
      .expect(200);
    await outsiderClient
      .post('/api/auth/sign-up/email')
      .send({ name: 'Task Outsider', email: outsiderEmail, password })
      .expect(200);

    const users = await prisma.user.findMany({
      where: { email: { in: [ownerEmail, outsiderEmail] } },
      select: { id: true, email: true },
    });
    const owner = users.find((user) => user.email === ownerEmail);
    const outsider = users.find((user) => user.email === outsiderEmail);
    if (!owner || !outsider) {
      throw new Error('Task e2e users were not created');
    }
    ownerId = owner.id;
    outsiderId = outsider.id;

    projectA = await createProject('Task Project A', 'task-a-' + runId);
    projectB = await createProject('Task Project B', 'task-b-' + runId);
  });

  afterAll(async () => {
    if (prisma) {
      const projectIds = [projectA?.id, projectB?.id].filter(
        (id): id is string => Boolean(id),
      );
      const organizationIds = [
        projectA?.organizationId,
        projectB?.organizationId,
      ].filter((id): id is string => Boolean(id));

      if (projectIds.length > 0) {
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
        await prisma.project.deleteMany({
          where: { id: { in: projectIds } },
        });
      }

      if (organizationIds.length > 0) {
        await prisma.organizationMember.deleteMany({
          where: { organizationId: { in: organizationIds } },
        });
        await prisma.organization.deleteMany({
          where: { id: { in: organizationIds } },
        });
      }

      const userIds = [ownerId, outsiderId].filter(Boolean);
      if (userIds.length > 0) {
        await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
    }

    await app?.close();
  });

  async function createProject(
    name: string,
    slug: string,
  ): Promise<ProjectSetup> {
    const organizationResponse = await ownerClient
      .post('/api/organizations')
      .send({ name: name + ' Organization', slug })
      .expect(201);
    const organizationId = (organizationResponse.body as { id: string }).id;

    const projectResponse = await ownerClient
      .post('/api/projects')
      .send({ name, organizationId })
      .expect(201);

    return projectResponse.body as ProjectSetup;
  }

  async function createTask(
    project = projectA,
    title = 'Core Task',
  ): Promise<TaskResponse> {
    const response = await ownerClient
      .post('/api/tasks')
      .send({
        title,
        projectId: project.id,
        columnId: project.board.columns[0].id,
      })
      .expect(201);
    return response.body as TaskResponse;
  }

  it('rejects unauthenticated Task requests', async () => {
    const unauthenticated = request(app.getHttpServer());

    await unauthenticated.get('/api/tasks').expect(401);
    await unauthenticated
      .post('/api/tasks')
      .send({
        title: 'No session',
        projectId: projectA.id,
        columnId: projectA.board.columns[0].id,
      })
      .expect(401);
  });

  it('creates and retrieves a Task with the compact detail contract', async () => {
    const response = await ownerClient
      .post('/api/tasks')
      .send({
        title: '  Ship Task Core  ',
        description: 'Lifecycle coverage',
        projectId: projectA.id,
        columnId: projectA.board.columns[0].id,
        assigneeId: ownerId,
        priority: 3,
        dueDate: '2026-09-30',
      })
      .expect(201);
    const created = response.body as TaskResponse;

    expect(created).toMatchObject({
      title: 'Ship Task Core',
      projectId: projectA.id,
      columnId: projectA.board.columns[0].id,
      assigneeId: ownerId,
      reporterId: ownerId,
      priority: 3,
      status: 'todo',
      project: { id: projectA.id },
      column: { id: projectA.board.columns[0].id },
      assignee: { id: ownerId, email: ownerEmail },
      reporter: { id: ownerId, email: ownerEmail },
    });
    expect(created.dueDate).toBe('2026-09-30T00:00:00.000Z');

    const stored = await prisma.task.findUnique({ where: { id: created.id } });
    expect(stored).toMatchObject({
      title: 'Ship Task Core',
      projectId: projectA.id,
      columnId: projectA.board.columns[0].id,
      assigneeId: ownerId,
      reporterId: ownerId,
    });

    const detailResponse = await ownerClient
      .get('/api/tasks/' + created.id)
      .expect(200);
    expect(detailResponse.body).toEqual(response.body);
  });

  it('rejects invalid and non-strict Task input', async () => {
    await ownerClient
      .post('/api/tasks')
      .send({
        title: '   ',
        projectId: projectA.id,
        columnId: projectA.board.columns[0].id,
      })
      .expect(400);
    await ownerClient
      .post('/api/tasks')
      .send({
        title: 'Bad date',
        projectId: projectA.id,
        columnId: projectA.board.columns[0].id,
        dueDate: '2026-02-30',
      })
      .expect(400);
    await ownerClient
      .post('/api/tasks')
      .send({
        title: 'Unknown field',
        projectId: projectA.id,
        columnId: projectA.board.columns[0].id,
        unexpected: true,
      })
      .expect(400);
    await ownerClient.get('/api/tasks/not-a-uuid').expect(400);
    await ownerClient.get('/api/tasks?priority=urgent').expect(400);
  });

  it('rejects inaccessible Projects, cross-Project Columns, and invalid assignees', async () => {
    await outsiderClient
      .post('/api/tasks')
      .send({
        title: 'Unauthorized create',
        projectId: projectA.id,
        columnId: projectA.board.columns[0].id,
      })
      .expect(403);

    await ownerClient
      .post('/api/tasks')
      .send({
        title: 'Mismatched IDs',
        projectId: projectA.id,
        columnId: projectB.board.columns[0].id,
      })
      .expect(400);

    await ownerClient
      .post('/api/tasks')
      .send({
        title: 'Invalid assignee',
        projectId: projectA.id,
        columnId: projectA.board.columns[0].id,
        assigneeId: outsiderId,
      })
      .expect(400);
  });

  it('rejects unauthorized Task reads and updates', async () => {
    const task = await createTask();

    await outsiderClient.get('/api/tasks/' + task.id).expect(403);
    await outsiderClient
      .patch('/api/tasks/' + task.id)
      .send({ title: 'Unauthorized update' })
      .expect(403);

    const unchanged = await prisma.task.findUnique({ where: { id: task.id } });
    expect(unchanged?.title).toBe('Core Task');
  });

  it('updates a Task and moves it repeatedly within the same Project', async () => {
    const task = await createTask();
    const destinationColumn = projectA.board.columns[1];

    const firstMoveResponse = await ownerClient
      .patch('/api/tasks/' + task.id)
      .send({
        title: '  Moved Task  ',
        columnId: destinationColumn.id,
        priority: 4,
        status: 'in_progress',
        dueDate: '2026-10-01T12:30:00.000Z',
      })
      .expect(200);
    const moved = firstMoveResponse.body as TaskResponse;

    expect(moved).toMatchObject({
      id: task.id,
      title: 'Moved Task',
      projectId: projectA.id,
      columnId: destinationColumn.id,
      priority: 4,
      status: 'in_progress',
      column: { id: destinationColumn.id },
      project: { id: projectA.id },
    });
    expect(moved.dueDate).toBe('2026-10-01T12:30:00.000Z');

    await ownerClient
      .patch('/api/tasks/' + task.id)
      .send({ columnId: destinationColumn.id })
      .expect(200)
      .expect(({ body }) => {
        expect((body as TaskResponse).columnId).toBe(destinationColumn.id);
      });
  });

  it('rejects a move to another Project without changing the Task', async () => {
    const task = await createTask();

    await ownerClient
      .patch('/api/tasks/' + task.id)
      .send({ columnId: projectB.board.columns[0].id })
      .expect(400);

    const unchanged = await prisma.task.findUnique({ where: { id: task.id } });
    expect(unchanged?.columnId).toBe(projectA.board.columns[0].id);
  });

  it('isolates Project lists and validates Project/Column filter pairs', async () => {
    const taskA = await createTask(projectA, 'Project A Task');
    const taskB = await createTask(projectB, 'Project B Task');

    const projectAResponse = await ownerClient
      .get('/api/tasks?projectId=' + projectA.id)
      .expect(200);
    const projectATasks = projectAResponse.body as TaskResponse[];
    expect(projectATasks.map((task) => task.id)).toContain(taskA.id);
    expect(projectATasks.map((task) => task.id)).not.toContain(taskB.id);

    const projectBResponse = await ownerClient
      .get('/api/tasks?projectId=' + projectB.id)
      .expect(200);
    const projectBTasks = projectBResponse.body as TaskResponse[];
    expect(projectBTasks.map((task) => task.id)).toContain(taskB.id);
    expect(projectBTasks.map((task) => task.id)).not.toContain(taskA.id);

    await ownerClient
      .get(
        '/api/tasks?projectId=' +
          projectA.id +
          '&columnId=' +
          projectB.board.columns[0].id,
      )
      .expect(400);
  });

  it('permanently deletes a Task only for an authorized user', async () => {
    const task = await createTask();

    await outsiderClient.delete('/api/tasks/' + task.id).expect(403);
    await ownerClient.delete('/api/tasks/' + task.id).expect(204);
    await ownerClient.get('/api/tasks/' + task.id).expect(404);
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull();
  });
});
