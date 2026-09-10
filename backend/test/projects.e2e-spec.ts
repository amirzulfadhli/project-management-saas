import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrganizationRole, ProjectRole } from '../generated/prisma/client';
import { DEFAULT_COLUMNS } from '../src/projects/projects.service';

interface ProjectResponse {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  archivedAt: string | null;
  organization: { id: string; name: string };
  projectMembers: Array<{
    userId: string;
    role: ProjectRole;
  }>;
  board: {
    id: string;
    name: string;
    columns: Array<{
      id: string;
      name: string;
      position: number;
      projectId: string;
      boardId: string | null;
    }>;
  };
}

describe('Project core lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerClient: ReturnType<typeof request.agent>;
  let memberClient: ReturnType<typeof request.agent>;
  let outsiderClient: ReturnType<typeof request.agent>;
  let ownerId: string;
  let memberId: string;
  let outsiderId: string;
  let organizationId: string;
  let testNumber = 0;

  const runId = Date.now().toString(36);
  const ownerEmail = 'project-owner-' + runId + '@example.test';
  const memberEmail = 'project-member-' + runId + '@example.test';
  const outsiderEmail = 'project-outsider-' + runId + '@example.test';
  const password = 'ProjectE2ePassword123!';

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
      .send({ name: 'Project Owner', email: ownerEmail, password })
      .expect(200);
    await memberClient
      .post('/api/auth/sign-up/email')
      .send({ name: 'Project Member', email: memberEmail, password })
      .expect(200);
    await outsiderClient
      .post('/api/auth/sign-up/email')
      .send({ name: 'Project Outsider', email: outsiderEmail, password })
      .expect(200);

    const users = await prisma.user.findMany({
      where: {
        email: { in: [ownerEmail, memberEmail, outsiderEmail] },
      },
      select: { id: true, email: true },
    });
    const owner = users.find((user) => user.email === ownerEmail);
    const member = users.find((user) => user.email === memberEmail);
    const outsider = users.find((user) => user.email === outsiderEmail);
    if (!owner || !member || !outsider) {
      throw new Error('Project e2e users were not created');
    }
    ownerId = owner.id;
    memberId = member.id;
    outsiderId = outsider.id;
  });

  beforeEach(async () => {
    testNumber += 1;
    const response = await ownerClient
      .post('/api/organizations')
      .send({
        name: 'Project Workspace ' + testNumber,
        slug: 'project-' + runId + '-' + testNumber,
      })
      .expect(201);
    organizationId = (response.body as { id: string }).id;

    await prisma.organizationMember.create({
      data: {
        organizationId,
        userId: memberId,
        role: OrganizationRole.MEMBER,
      },
    });
  });

  afterEach(async () => {
    await clearTestData();
  });

  afterAll(async () => {
    await clearTestData();
    const userIds = [ownerId, memberId, outsiderId].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app.close();
  });

  async function clearTestData(): Promise<void> {
    if (!prisma || !ownerId) return;

    const organizations = await prisma.organization.findMany({
      where: { ownerId },
      select: { id: true },
    });
    const organizationIds = organizations.map(
      (organization) => organization.id,
    );
    if (organizationIds.length === 0) return;

    const projects = await prisma.project.findMany({
      where: { organizationId: { in: organizationIds } },
      select: { id: true },
    });
    const projectIds = projects.map((project) => project.id);

    if (projectIds.length > 0) {
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
      await prisma.project.deleteMany({
        where: { id: { in: projectIds } },
      });
    }

    await prisma.organizationMember.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
  }

  async function createProject(
    name = 'Core Roadmap',
    client = memberClient,
  ): Promise<ProjectResponse> {
    const response = await client
      .post('/api/projects')
      .send({ name, description: 'Project lifecycle test', organizationId })
      .expect(201);
    return response.body as ProjectResponse;
  }

  it('rejects unauthenticated Project access', async () => {
    const unauthenticated = request(app.getHttpServer());

    await unauthenticated.get('/api/projects').expect(401);
    await unauthenticated
      .post('/api/projects')
      .send({ name: 'No Session', organizationId })
      .expect(401);
  });

  it('creates and retrieves a fully initialized Project for an organization member', async () => {
    const project = await createProject('  Core Roadmap  ');

    expect(project).toMatchObject({
      name: 'Core Roadmap',
      organizationId,
      organization: { id: organizationId },
      archivedAt: null,
      board: { name: 'Main Board' },
    });
    expect(project.projectMembers).toContainEqual(
      expect.objectContaining({
        userId: memberId,
        role: ProjectRole.OWNER,
      }),
    );
    expect(project.board.columns).toHaveLength(6);
    expect(project.board.columns.map((column) => column.name)).toEqual(
      DEFAULT_COLUMNS,
    );
    expect(project.board.columns.map((column) => column.position)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(
      project.board.columns.every(
        (column) =>
          column.projectId === project.id &&
          column.boardId === project.board.id,
      ),
    ).toBe(true);

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId: memberId,
        },
      },
    });
    expect(membership).toMatchObject({ role: ProjectRole.OWNER });

    const listResponse = await memberClient
      .get('/api/projects?organizationId=' + organizationId)
      .expect(200);
    const activeProjects = listResponse.body as ProjectResponse[];
    expect(activeProjects.map((item) => item.id)).toContain(project.id);

    await memberClient.get('/api/projects/' + project.id).expect(200);
    await outsiderClient.get('/api/projects/' + project.id).expect(403);
  });

  it('rejects whitespace-only names and unknown request fields', async () => {
    await memberClient
      .post('/api/projects')
      .send({ name: '   ', organizationId })
      .expect(400);
    await memberClient
      .post('/api/projects')
      .send({ name: 'Strict Project', organizationId, unexpected: true })
      .expect(400);

    const project = await createProject();
    await memberClient
      .patch('/api/projects/' + project.id)
      .send({ name: '   ' })
      .expect(400);
  });

  it('updates a Project and returns the full detail contract', async () => {
    const project = await createProject();

    const response = await memberClient
      .patch('/api/projects/' + project.id)
      .send({ name: '  Updated Roadmap  ', description: 'Updated' })
      .expect(200);
    const updated = response.body as ProjectResponse;

    expect(updated).toMatchObject({
      id: project.id,
      name: 'Updated Roadmap',
      description: 'Updated',
      organization: { id: organizationId },
      board: { id: project.board.id },
    });
    expect(updated.projectMembers).toContainEqual(
      expect.objectContaining({
        userId: memberId,
        role: ProjectRole.OWNER,
      }),
    );
    expect(updated.board.columns).toHaveLength(6);
  });

  it('limits Project administration to an Organization OWNER or explicit Project OWNER', async () => {
    const project = await createProject('Owner Administered', ownerClient);

    await memberClient
      .patch('/api/projects/' + project.id)
      .send({ name: 'Unauthorized rename' })
      .expect(403);
    await memberClient.delete('/api/projects/' + project.id).expect(403);
    await memberClient
      .post('/api/projects/' + project.id + '/duplicate')
      .expect(403);

    await ownerClient
      .patch('/api/projects/' + project.id)
      .send({ name: 'Owner renamed' })
      .expect(200);
    await ownerClient.delete('/api/projects/' + project.id).expect(204);
    await memberClient
      .post('/api/projects/' + project.id + '/restore')
      .expect(403);
    await ownerClient
      .post('/api/projects/' + project.id + '/restore')
      .expect(200);
    await ownerClient
      .post('/api/projects/' + project.id + '/duplicate')
      .expect(201);
  });

  it('soft-archives a Project and exposes it only through archived=true', async () => {
    const project = await createProject();
    const taskResponse = await memberClient
      .post('/api/tasks')
      .send({
        title: 'Preserved Task',
        projectId: project.id,
        columnId: project.board.columns[0].id,
      })
      .expect(201);
    const taskId = (taskResponse.body as { id: string }).id;

    await memberClient.delete('/api/projects/' + project.id).expect(204);

    const activeResponse = await memberClient
      .get('/api/projects?organizationId=' + organizationId)
      .expect(200);
    const activeProjects = activeResponse.body as ProjectResponse[];
    expect(activeProjects.map((item) => item.id)).not.toContain(project.id);

    const archivedResponse = await memberClient
      .get('/api/projects?organizationId=' + organizationId + '&archived=true')
      .expect(200);
    const archivedProjects = archivedResponse.body as ProjectResponse[];
    expect(archivedProjects.map((item) => item.id)).toContain(project.id);

    const storedProject = await prisma.project.findUnique({
      where: { id: project.id },
    });
    expect(storedProject?.archivedAt).toBeInstanceOf(Date);
    await memberClient.get('/api/projects/' + project.id).expect(200);

    const restoredResponse = await memberClient
      .post('/api/projects/' + project.id + '/restore')
      .expect(200);
    expect(restoredResponse.body).toMatchObject({
      id: project.id,
      archivedAt: null,
      board: { id: project.board.id },
    });
    expect(
      (restoredResponse.body as ProjectResponse).projectMembers,
    ).toContainEqual(
      expect.objectContaining({ userId: memberId, role: ProjectRole.OWNER }),
    );
    expect(
      await prisma.task.findUnique({ where: { id: taskId } }),
    ).toMatchObject({ id: taskId, projectId: project.id });

    const activeAfterRestore = await memberClient
      .get('/api/projects?organizationId=' + organizationId)
      .expect(200);
    expect(
      (activeAfterRestore.body as ProjectResponse[]).map((item) => item.id),
    ).toContain(project.id);
    const archivedAfterRestore = await memberClient
      .get('/api/projects?organizationId=' + organizationId + '&archived=true')
      .expect(200);
    expect(
      (archivedAfterRestore.body as ProjectResponse[]).map((item) => item.id),
    ).not.toContain(project.id);
  });

  it('duplicates the Project structure without changing the source', async () => {
    const source = await createProject('Source Project');

    const response = await memberClient
      .post('/api/projects/' + source.id + '/duplicate')
      .expect(201);
    const copy = response.body as ProjectResponse;

    expect(copy).toMatchObject({
      name: 'Source Project (Copy)',
      organizationId,
      description: source.description,
      archivedAt: null,
      organization: { id: organizationId },
    });
    expect(copy.id).not.toBe(source.id);
    expect(copy.projectMembers).toContainEqual(
      expect.objectContaining({
        userId: memberId,
        role: ProjectRole.OWNER,
      }),
    );
    expect(copy.board.id).not.toBe(source.board.id);
    expect(copy.board.columns.map((column) => column.name)).toEqual(
      source.board.columns.map((column) => column.name),
    );
    expect(copy.board.columns.map((column) => column.position)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);

    const unchangedSource = await prisma.project.findUnique({
      where: { id: source.id },
      include: {
        board: { include: { columns: { orderBy: { position: 'asc' } } } },
      },
    });
    expect(unchangedSource).toMatchObject({
      id: source.id,
      name: 'Source Project',
      archivedAt: null,
      board: { id: source.board.id },
    });
    expect(unchangedSource?.board?.columns).toHaveLength(6);
    expect(
      await prisma.project.count({
        where: { organizationId },
      }),
    ).toBe(2);
    expect(await prisma.task.count({ where: { projectId: copy.id } })).toBe(0);
    expect(await prisma.file.count({ where: { projectId: copy.id } })).toBe(0);
    expect(await prisma.wikiPage.count({ where: { projectId: copy.id } })).toBe(
      0,
    );
    expect(
      await prisma.timeEntry.count({ where: { projectId: copy.id } }),
    ).toBe(0);
    expect(await prisma.issue.count({ where: { projectId: copy.id } })).toBe(0);
    expect(
      await prisma.repository.count({ where: { projectId: copy.id } }),
    ).toBe(0);
    expect(
      await prisma.projectMember.count({ where: { projectId: copy.id } }),
    ).toBe(1);
    expect(
      await prisma.activity.findMany({
        where: { projectId: copy.id },
        select: { type: true },
      }),
    ).toEqual([{ type: 'PROJECT_DUPLICATED' }]);
    expect(
      await prisma.notification.count({
        where: { projectId: { in: [source.id, copy.id] } },
      }),
    ).toBe(0);
  });
});
