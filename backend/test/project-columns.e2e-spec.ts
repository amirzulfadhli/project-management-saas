import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { OrganizationRole } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEFAULT_COLUMNS } from '../src/projects/projects.service';

interface ColumnResponse {
  id: string;
  name: string;
  projectId: string;
  boardId: string;
  position: number;
}

interface ProjectResponse {
  id: string;
  organizationId: string;
  board: {
    id: string;
    columns: ColumnResponse[];
  };
}

describe('Project Column core lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerClient: ReturnType<typeof request.agent>;
  let memberClient: ReturnType<typeof request.agent>;
  let outsiderClient: ReturnType<typeof request.agent>;
  let ownerId: string;
  let memberId: string;
  let outsiderId: string;
  let projectA: ProjectResponse;
  let projectB: ProjectResponse;

  const runId = Date.now().toString(36);
  const password = 'ColumnE2ePassword123!';
  const ownerEmail = `column-owner-${runId}@example.test`;
  const memberEmail = `column-member-${runId}@example.test`;
  const outsiderEmail = `column-outsider-${runId}@example.test`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    ownerClient = request.agent(app.getHttpServer());
    memberClient = request.agent(app.getHttpServer());
    outsiderClient = request.agent(app.getHttpServer());

    await ownerClient
      .post('/api/auth/sign-up/email')
      .send({ name: 'Column Owner', email: ownerEmail, password })
      .expect(200);
    await memberClient
      .post('/api/auth/sign-up/email')
      .send({ name: 'Column Member', email: memberEmail, password })
      .expect(200);
    await outsiderClient
      .post('/api/auth/sign-up/email')
      .send({ name: 'Column Outsider', email: outsiderEmail, password })
      .expect(200);

    const users = await prisma.user.findMany({
      where: { email: { in: [ownerEmail, memberEmail, outsiderEmail] } },
      select: { id: true, email: true },
    });
    const idFor = (email: string): string => {
      const user = users.find((candidate) => candidate.email === email);
      if (!user) throw new Error(`Column e2e User missing: ${email}`);
      return user.id;
    };
    ownerId = idFor(ownerEmail);
    memberId = idFor(memberEmail);
    outsiderId = idFor(outsiderEmail);

    projectA = await createProject('Column Project A', `column-a-${runId}`);
    projectB = await createProject('Column Project B', `column-b-${runId}`);

    await prisma.organizationMember.createMany({
      data: [projectA.organizationId, projectB.organizationId].map(
        (organizationId) => ({
          organizationId,
          userId: memberId,
          role: OrganizationRole.MEMBER,
        }),
      ),
    });
  });

  beforeEach(async () => {
    const projectIds = [projectA.id, projectB.id];
    await prisma.task.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.column.deleteMany({
      where: { projectId: { in: projectIds }, position: { gte: 6 } },
    });
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
        await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
      }
      if (organizationIds.length > 0) {
        await prisma.organizationMember.deleteMany({
          where: { organizationId: { in: organizationIds } },
        });
        await prisma.organization.deleteMany({
          where: { id: { in: organizationIds } },
        });
      }
      const userIds = [ownerId, memberId, outsiderId].filter(Boolean);
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app.close();
  });

  async function createProject(
    name: string,
    slug: string,
  ): Promise<ProjectResponse> {
    const organizationResponse = await ownerClient
      .post('/api/organizations')
      .send({ name: `${name} Organization`, slug })
      .expect(201);
    const organizationId = (organizationResponse.body as { id: string }).id;
    const projectResponse = await ownerClient
      .post('/api/projects')
      .send({ name, organizationId })
      .expect(201);
    return projectResponse.body as ProjectResponse;
  }

  async function createColumn(
    project = projectA,
    name = 'Blocked',
    client = ownerClient,
  ): Promise<ColumnResponse> {
    const response = await client
      .post(`/api/projects/${project.id}/columns`)
      .send({ name })
      .expect(201);
    return response.body as ColumnResponse;
  }

  it('requires authentication and preserves broad Project collaborator access', async () => {
    const unauthenticated = request(app.getHttpServer());
    await unauthenticated
      .get(`/api/projects/${projectA.id}/columns`)
      .expect(401);
    await unauthenticated
      .post(`/api/projects/${projectA.id}/columns`)
      .send({ name: 'Unauthorized' })
      .expect(401);

    await memberClient.get(`/api/projects/${projectA.id}/columns`).expect(200);
    await createColumn(projectA, 'Member-created', memberClient);
    await outsiderClient
      .get(`/api/projects/${projectA.id}/columns`)
      .expect(403);
    await outsiderClient
      .post(`/api/projects/${projectA.id}/columns`)
      .send({ name: 'Forbidden' })
      .expect(403);
  });

  it('lists only the nested Project Board columns in position order', async () => {
    const response = await ownerClient
      .get(`/api/projects/${projectA.id}/columns`)
      .expect(200);
    const columns = response.body as ColumnResponse[];

    expect(columns.map(({ name }) => name)).toEqual(DEFAULT_COLUMNS);
    expect(columns.map(({ position }) => position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(
      columns.every(
        (column) =>
          column.projectId === projectA.id &&
          column.boardId === projectA.board.id,
      ),
    ).toBe(true);
    expect(columns.map(({ id }) => id)).not.toEqual(
      expect.arrayContaining(projectB.board.columns.map(({ id }) => id)),
    );
  });

  it('creates a trimmed Column at the end with server-derived relationships', async () => {
    const column = await createColumn(projectA, '  Ready for release  ');

    expect(column).toMatchObject({
      name: 'Ready for release',
      projectId: projectA.id,
      boardId: projectA.board.id,
      position: 6,
    });
  });

  it('strictly validates Column IDs and create/update bodies', async () => {
    await ownerClient.get('/api/projects/not-a-uuid/columns').expect(400);
    await ownerClient
      .post(`/api/projects/${projectA.id}/columns`)
      .send({ name: '   ' })
      .expect(400);
    await ownerClient
      .post(`/api/projects/${projectA.id}/columns`)
      .send({ name: 'Client relationship', projectId: projectB.id })
      .expect(400);
    await ownerClient
      .post(`/api/projects/${projectA.id}/columns`)
      .send({ name: 'Client position', position: 99 })
      .expect(400);
  });

  it('serializes concurrent appends into unique increasing positions', async () => {
    const responses = await Promise.all(
      ['Concurrent A', 'Concurrent B', 'Concurrent C'].map((name) =>
        ownerClient.post(`/api/projects/${projectA.id}/columns`).send({ name }),
      ),
    );

    expect(responses.map(({ status }) => status)).toEqual([201, 201, 201]);
    const created = responses.map(({ body }) => body as ColumnResponse);
    expect(created.map(({ position }) => position).sort()).toEqual([6, 7, 8]);
    expect(new Set(created.map(({ position }) => position)).size).toBe(3);
  });

  it('renames a nested Column and rejects invalid or cross-Project IDs', async () => {
    const column = await createColumn();
    const updatedResponse = await ownerClient
      .patch(`/api/projects/${projectA.id}/columns/${column.id}`)
      .send({ name: '  Deployment  ' })
      .expect(200);
    expect(updatedResponse.body).toMatchObject({
      id: column.id,
      name: 'Deployment',
      projectId: projectA.id,
      boardId: projectA.board.id,
      position: 6,
    });

    await ownerClient
      .patch(`/api/projects/${projectA.id}/columns/${column.id}`)
      .send({ name: '   ' })
      .expect(400);
    await ownerClient
      .patch(
        `/api/projects/${projectA.id}/columns/${projectB.board.columns[0].id}`,
      )
      .send({ name: 'Wrong Project' })
      .expect(404);
  });

  it('deletes an empty Column and treats a cross-Project ID as not found', async () => {
    const column = await createColumn();
    await ownerClient
      .delete(`/api/projects/${projectA.id}/columns/${column.id}`)
      .expect(204);
    expect(
      await prisma.column.findUnique({ where: { id: column.id } }),
    ).toBeNull();

    await ownerClient
      .delete(
        `/api/projects/${projectA.id}/columns/${projectB.board.columns[0].id}`,
      )
      .expect(404);
  });

  it('returns 409 for a non-empty Column and leaves its Tasks untouched', async () => {
    const column = await createColumn();
    const taskResponse = await ownerClient
      .post('/api/tasks')
      .send({
        title: 'Do not delete',
        projectId: projectA.id,
        columnId: column.id,
      })
      .expect(201);
    const taskId = (taskResponse.body as { id: string }).id;

    await ownerClient
      .delete(`/api/projects/${projectA.id}/columns/${column.id}`)
      .expect(409);

    expect(
      await prisma.column.findUnique({ where: { id: column.id } }),
    ).not.toBeNull();
    expect(
      await prisma.task.findUnique({ where: { id: taskId } }),
    ).toMatchObject({
      id: taskId,
      columnId: column.id,
      projectId: projectA.id,
    });
  });

  it('excludes contradictory data and prevents Tasks from using it', async () => {
    const malformed = await prisma.column.create({
      data: {
        name: 'Malformed relationship',
        projectId: projectA.id,
        boardId: projectB.board.id,
        position: 50,
      },
    });

    const listResponse = await ownerClient
      .get(`/api/projects/${projectA.id}/columns`)
      .expect(200);
    expect(
      (listResponse.body as ColumnResponse[]).map(({ id }) => id),
    ).not.toContain(malformed.id);

    const projectBResponse = await ownerClient
      .get(`/api/projects/${projectB.id}`)
      .expect(200);
    const projectBDetail = projectBResponse.body as ProjectResponse;
    expect(projectBDetail.board.columns.map(({ id }) => id)).not.toContain(
      malformed.id,
    );

    await ownerClient
      .post('/api/tasks')
      .send({
        title: 'Invisible Task attempt',
        projectId: projectA.id,
        columnId: malformed.id,
      })
      .expect(400);
  });
});
