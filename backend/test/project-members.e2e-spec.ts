import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { OrganizationRole, ProjectRole } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface ProjectResponse {
  id: string;
  organizationId: string;
  board: { columns: Array<{ id: string }> };
  projectMembers: Array<{ id: string; userId: string; role: ProjectRole }>;
}

interface ProjectMemberResponse {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
}

describe('Project membership administration (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let organizationOwnerClient: ReturnType<typeof request.agent>;
  let projectOwnerClient: ReturnType<typeof request.agent>;
  let organizationMemberClient: ReturnType<typeof request.agent>;
  let projectMemberClient: ReturnType<typeof request.agent>;
  let outsiderClient: ReturnType<typeof request.agent>;
  let organizationOwnerId: string;
  let projectOwnerId: string;
  let organizationMemberId: string;
  let projectMemberId: string;
  let outsiderId: string;
  let organizationId: string;
  let project: ProjectResponse;
  let testNumber = 0;

  const runId = Date.now().toString(36);
  const password = 'MembershipE2ePassword123!';
  const users = [
    ['Organization Owner', `membership-org-owner-${runId}@example.test`],
    ['Project Owner', `membership-project-owner-${runId}@example.test`],
    ['Organization Member', `membership-org-member-${runId}@example.test`],
    ['Project Member', `membership-project-member-${runId}@example.test`],
    ['Outsider', `membership-outsider-${runId}@example.test`],
  ] as const;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    organizationOwnerClient = request.agent(app.getHttpServer());
    projectOwnerClient = request.agent(app.getHttpServer());
    organizationMemberClient = request.agent(app.getHttpServer());
    projectMemberClient = request.agent(app.getHttpServer());
    outsiderClient = request.agent(app.getHttpServer());
    const clients = [
      organizationOwnerClient,
      projectOwnerClient,
      organizationMemberClient,
      projectMemberClient,
      outsiderClient,
    ];

    for (let index = 0; index < users.length; index += 1) {
      await clients[index]
        .post('/api/auth/sign-up/email')
        .send({ name: users[index][0], email: users[index][1], password })
        .expect(200);
    }

    const storedUsers = await prisma.user.findMany({
      where: { email: { in: users.map((user) => user[1]) } },
      select: { id: true, email: true },
    });
    const idFor = (email: string): string => {
      const user = storedUsers.find((candidate) => candidate.email === email);
      if (!user) throw new Error(`Membership e2e User missing: ${email}`);
      return user.id;
    };
    organizationOwnerId = idFor(users[0][1]);
    projectOwnerId = idFor(users[1][1]);
    organizationMemberId = idFor(users[2][1]);
    projectMemberId = idFor(users[3][1]);
    outsiderId = idFor(users[4][1]);
  });

  beforeEach(async () => {
    testNumber += 1;
    const organizationResponse = await organizationOwnerClient
      .post('/api/organizations')
      .send({
        name: `Membership Workspace ${testNumber}`,
        slug: `membership-${runId}-${testNumber}`,
      })
      .expect(201);
    organizationId = (organizationResponse.body as { id: string }).id;

    await prisma.organizationMember.createMany({
      data: [projectOwnerId, organizationMemberId, projectMemberId].map(
        (userId) => ({
          organizationId,
          userId,
          role: OrganizationRole.MEMBER,
        }),
      ),
    });

    const projectResponse = await projectOwnerClient
      .post('/api/projects')
      .send({ name: `Membership Project ${testNumber}`, organizationId })
      .expect(201);
    project = projectResponse.body as ProjectResponse;
  });

  afterEach(async () => {
    await clearTestData();
  });

  afterAll(async () => {
    await clearTestData();
    const userIds = [
      organizationOwnerId,
      projectOwnerId,
      organizationMemberId,
      projectMemberId,
      outsiderId,
    ].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app.close();
  });

  async function clearTestData(): Promise<void> {
    if (!prisma || !organizationOwnerId) return;

    const organizations = await prisma.organization.findMany({
      where: { ownerId: organizationOwnerId },
      select: { id: true },
    });
    const organizationIds = organizations.map(({ id }) => id);
    if (organizationIds.length === 0) return;

    const projects = await prisma.project.findMany({
      where: { organizationId: { in: organizationIds } },
      select: { id: true },
    });
    const projectIds = projects.map(({ id }) => id);
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
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    await prisma.organizationMember.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
  }

  async function addMember(
    userId: string,
    role: ProjectRole = ProjectRole.MEMBER,
    client = organizationOwnerClient,
  ): Promise<ProjectMemberResponse> {
    const response = await client
      .post(`/api/projects/${project.id}/members`)
      .send({ userId, role })
      .expect(201);
    return response.body as ProjectMemberResponse;
  }

  it('requires authentication and limits roster visibility to Project collaborators', async () => {
    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/members`)
      .expect(401);

    const response = await organizationMemberClient
      .get(`/api/projects/${project.id}/members`)
      .expect(200);
    const members = response.body as ProjectMemberResponse[];
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      projectId: project.id,
      userId: projectOwnerId,
      role: ProjectRole.OWNER,
    });
    await outsiderClient.get(`/api/projects/${project.id}/members`).expect(403);
  });

  it('validates route IDs, roles, and strict request bodies', async () => {
    await organizationOwnerClient
      .get('/api/projects/not-a-uuid/members')
      .expect(400);
    await organizationOwnerClient
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: organizationMemberId, role: 'ADMIN' })
      .expect(400);
    await organizationOwnerClient
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: organizationMemberId, unexpected: true })
      .expect(400);
    await organizationOwnerClient
      .patch(`/api/projects/${project.id}/members/not-a-uuid`)
      .send({ role: ProjectRole.MEMBER })
      .expect(400);
  });

  it('allows both the Organization owner and Project OWNER to add eligible members', async () => {
    const first = await addMember(organizationMemberId);
    expect(first).toMatchObject({
      projectId: project.id,
      userId: organizationMemberId,
      role: ProjectRole.MEMBER,
      user: { id: organizationMemberId, email: users[2][1] },
    });

    const second = await addMember(
      projectMemberId,
      ProjectRole.MEMBER,
      projectOwnerClient,
    );
    expect(second.userId).toBe(projectMemberId);
  });

  it('rejects duplicate membership and Users outside the Organization', async () => {
    await addMember(organizationMemberId);
    await organizationOwnerClient
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: organizationMemberId })
      .expect(409);
    expect(
      await prisma.projectMember.count({
        where: { projectId: project.id, userId: organizationMemberId },
      }),
    ).toBe(1);

    await organizationOwnerClient
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: outsiderId })
      .expect(400);
  });

  it('denies roster administration to Organization MEMBER, Project MEMBER, and outsider', async () => {
    await addMember(projectMemberId);

    await organizationMemberClient
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: organizationMemberId })
      .expect(403);
    await projectMemberClient
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: organizationMemberId })
      .expect(403);
    await outsiderClient
      .post(`/api/projects/${project.id}/members`)
      .send({ userId: organizationMemberId })
      .expect(403);
  });

  it('changes roles, permits multiple owners, and keeps same-role PATCH idempotent', async () => {
    const member = await addMember(organizationMemberId);

    const promotedResponse = await organizationOwnerClient
      .patch(`/api/projects/${project.id}/members/${member.id}`)
      .send({ role: ProjectRole.OWNER })
      .expect(200);
    expect((promotedResponse.body as ProjectMemberResponse).role).toBe(
      ProjectRole.OWNER,
    );

    await organizationOwnerClient
      .patch(`/api/projects/${project.id}/members/${member.id}`)
      .send({ role: ProjectRole.OWNER })
      .expect(200);

    const creatorMembership = project.projectMembers.find(
      ({ userId }) => userId === projectOwnerId,
    );
    if (!creatorMembership) throw new Error('Creator membership missing');
    await organizationOwnerClient
      .patch(`/api/projects/${project.id}/members/${creatorMembership.id}`)
      .send({ role: ProjectRole.MEMBER })
      .expect(200);
    expect(
      await prisma.projectMember.count({
        where: { projectId: project.id, role: ProjectRole.OWNER },
      }),
    ).toBe(1);
  });

  it('protects the final OWNER from demotion and removal, including self-removal', async () => {
    const creatorMembership = project.projectMembers.find(
      ({ userId }) => userId === projectOwnerId,
    );
    if (!creatorMembership) throw new Error('Creator membership missing');

    await projectOwnerClient
      .patch(`/api/projects/${project.id}/members/${creatorMembership.id}`)
      .send({ role: ProjectRole.MEMBER })
      .expect(409);
    await projectOwnerClient
      .delete(`/api/projects/${project.id}/members/${creatorMembership.id}`)
      .expect(409);
  });

  it('allows safe self-removal without revoking inherited Organization access', async () => {
    const member = await addMember(projectMemberId);

    await projectMemberClient
      .delete(`/api/projects/${project.id}/members/${member.id}`)
      .expect(204);
    expect(
      await prisma.projectMember.findUnique({ where: { id: member.id } }),
    ).toBeNull();
    await projectMemberClient.get(`/api/projects/${project.id}`).expect(200);
  });

  it('treats a member ID from another Project as not found', async () => {
    const secondProjectResponse = await projectOwnerClient
      .post('/api/projects')
      .send({ name: 'Second Membership Project', organizationId })
      .expect(201);
    const secondProject = secondProjectResponse.body as ProjectResponse;
    const otherMembership = await prisma.projectMember.findUniqueOrThrow({
      where: {
        projectId_userId: {
          projectId: secondProject.id,
          userId: projectOwnerId,
        },
      },
    });

    await organizationOwnerClient
      .patch(`/api/projects/${project.id}/members/${otherMembership.id}`)
      .send({ role: ProjectRole.MEMBER })
      .expect(404);
    await organizationOwnerClient
      .delete(`/api/projects/${project.id}/members/${otherMembership.id}`)
      .expect(404);
  });

  it('removes another member without changing historical Task assignments', async () => {
    const member = await addMember(organizationMemberId);
    const taskResponse = await projectOwnerClient
      .post('/api/tasks')
      .send({
        title: 'Historically assigned Task',
        projectId: project.id,
        columnId: project.board.columns[0].id,
        assigneeId: organizationMemberId,
      })
      .expect(201);
    const taskId = (taskResponse.body as { id: string }).id;

    await organizationOwnerClient
      .delete(`/api/projects/${project.id}/members/${member.id}`)
      .expect(204);

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    expect(task?.assigneeId).toBe(organizationMemberId);
    await organizationMemberClient
      .get(`/api/projects/${project.id}`)
      .expect(200);
  });

  it('serializes concurrent owner mutations so at least one OWNER remains', async () => {
    const secondOwner = await addMember(
      organizationMemberId,
      ProjectRole.OWNER,
    );
    const creatorMembership = project.projectMembers.find(
      ({ userId }) => userId === projectOwnerId,
    );
    if (!creatorMembership) throw new Error('Creator membership missing');

    const [demotion, removal] = await Promise.all([
      organizationOwnerClient
        .patch(`/api/projects/${project.id}/members/${creatorMembership.id}`)
        .send({ role: ProjectRole.MEMBER }),
      organizationOwnerClient.delete(
        `/api/projects/${project.id}/members/${secondOwner.id}`,
      ),
    ]);

    expect([demotion.status, removal.status].sort()).toEqual([200, 409]);
    expect(
      await prisma.projectMember.count({
        where: { projectId: project.id, role: ProjectRole.OWNER },
      }),
    ).toBe(1);
  });
});
