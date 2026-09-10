import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Server as HttpServer } from 'node:http';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface OrganizationFixture {
  id: string;
  members: Array<{ id: string; userId: string; role: 'OWNER' | 'MEMBER' }>;
}

interface ProjectFixture {
  id: string;
  organizationId: string;
}

describe('Organization membership administration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let ownerCookie: string;
  let secondOwnerCookie: string;
  let memberCookie: string;
  let outsiderCookie: string;
  let ownerId: string;
  let secondOwnerId: string;
  let memberId: string;
  const sockets: Socket[] = [];
  const organizationIds = new Set<string>();
  const runId = Date.now().toString(36);
  const password = 'OrganizationAdminE2e123!';
  const ownerEmail = `org-admin-owner-${runId}@example.test`;
  const secondOwnerEmail = `org-admin-second-${runId}@example.test`;
  const memberEmail = `org-admin-member-${runId}@example.test`;
  const outsiderEmail = `org-admin-outsider-${runId}@example.test`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.listen(0, '127.0.0.1');
    const server: unknown = app.getHttpServer();
    if (!(server instanceof HttpServer)) {
      throw new Error('Organization admin e2e HTTP server was not created');
    }
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Organization admin e2e address is unavailable');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = moduleFixture.get(PrismaService);

    ownerCookie = await signUp('Organization Owner', ownerEmail);
    secondOwnerCookie = await signUp('Second Owner', secondOwnerEmail);
    memberCookie = await signUp('Organization Member', memberEmail);
    outsiderCookie = await signUp('Organization Outsider', outsiderEmail);
    const users = await prisma.user.findMany({
      where: {
        email: {
          in: [ownerEmail, secondOwnerEmail, memberEmail, outsiderEmail],
        },
      },
      select: { id: true, email: true },
    });
    ownerId = users.find((user) => user.email === ownerEmail)!.id;
    secondOwnerId = users.find((user) => user.email === secondOwnerEmail)!.id;
    memberId = users.find((user) => user.email === memberEmail)!.id;
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) socket.disconnect();
    await clearOrganizations();
  });

  afterAll(async () => {
    await clearOrganizations();
    const users = await prisma.user.findMany({
      where: {
        email: {
          in: [ownerEmail, secondOwnerEmail, memberEmail, outsiderEmail],
        },
      },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await prisma.notification.deleteMany({
      where: {
        OR: [{ userId: { in: userIds } }, { actorId: { in: userIds } }],
      },
    });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('lists safely and lets only an OWNER add an existing account', async () => {
    const organization = await createOrganization('List and add');
    const added = await request(baseUrl)
      .post(`/api/organizations/${organization.id}/members`)
      .set('Cookie', ownerCookie)
      .send({ email: memberEmail.toUpperCase() })
      .expect(201);
    expect(added.body).toMatchObject({
      userId: memberId,
      role: 'MEMBER',
      user: { email: memberEmail },
    });

    const list = await request(baseUrl)
      .get(`/api/organizations/${organization.id}/members`)
      .set('Cookie', memberCookie)
      .expect(200);
    expect(list.body).toHaveLength(2);
    expect(JSON.stringify(list.body)).not.toContain('password');

    await request(baseUrl)
      .get(`/api/organizations/${organization.id}/members`)
      .set('Cookie', outsiderCookie)
      .expect(403);
    await request(baseUrl)
      .post(`/api/organizations/${organization.id}/members`)
      .set('Cookie', memberCookie)
      .send({ email: outsiderEmail })
      .expect(403);
    await request(baseUrl)
      .post(`/api/organizations/${organization.id}/members`)
      .set('Cookie', ownerCookie)
      .send({ email: memberEmail })
      .expect(409);
    await request(baseUrl)
      .post(`/api/organizations/${organization.id}/members`)
      .set('Cookie', ownerCookie)
      .send({ email: outsiderEmail, role: 'OWNER' })
      .expect(400);
    await request(baseUrl)
      .post(`/api/organizations/${organization.id}/members`)
      .set('Cookie', ownerCookie)
      .send({ email: `missing-${runId}@example.test` })
      .expect(404);
  });

  it('supports idempotent promotion/demotion and protects the final OWNER', async () => {
    const organization = await createOrganization('Role changes');
    const second = await addMember(organization.id, secondOwnerEmail);
    const ordinary = await addMember(organization.id, memberEmail);

    const promoted = await request(baseUrl)
      .patch(`/api/organizations/${organization.id}/members/${second.id}`)
      .set('Cookie', ownerCookie)
      .send({ role: 'OWNER' })
      .expect(200);
    expect((promoted.body as { role: string }).role).toBe('OWNER');

    await request(baseUrl)
      .patch(`/api/organizations/${organization.id}/members/${ordinary.id}`)
      .set('Cookie', memberCookie)
      .send({ role: 'OWNER' })
      .expect(403);

    await request(baseUrl)
      .patch(`/api/organizations/${organization.id}/members/${second.id}`)
      .set('Cookie', ownerCookie)
      .send({ role: 'OWNER' })
      .expect(200);
    await request(baseUrl)
      .patch(`/api/organizations/${organization.id}/members/${second.id}`)
      .set('Cookie', ownerCookie)
      .send({ role: 'MEMBER' })
      .expect(200);

    const creator = await prisma.organizationMember.findUniqueOrThrow({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: ownerId,
        },
      },
      select: { id: true },
    });
    await request(baseUrl)
      .patch(`/api/organizations/${organization.id}/members/${creator.id}`)
      .set('Cookie', ownerCookie)
      .send({ role: 'MEMBER' })
      .expect(409);
  });

  it('allows owner self-removal only when another OWNER remains', async () => {
    const organization = await createOrganization('Self removal');
    const second = await addMember(organization.id, secondOwnerEmail);
    await request(baseUrl)
      .patch(`/api/organizations/${organization.id}/members/${second.id}`)
      .set('Cookie', ownerCookie)
      .send({ role: 'OWNER' })
      .expect(200);
    const creator = await prisma.organizationMember.findUniqueOrThrow({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: ownerId,
        },
      },
      select: { id: true },
    });

    await request(baseUrl)
      .delete(`/api/organizations/${organization.id}/members/${creator.id}`)
      .set('Cookie', ownerCookie)
      .expect(204);
    await request(baseUrl)
      .get(`/api/organizations/${organization.id}`)
      .set('Cookie', ownerCookie)
      .expect(403);
    expect(
      await prisma.organization.findUniqueOrThrow({
        where: { id: organization.id },
        select: { ownerId: true },
      }),
    ).toEqual({ ownerId: secondOwnerId });

    await request(baseUrl)
      .delete(`/api/organizations/${organization.id}/members/${second.id}`)
      .set('Cookie', secondOwnerCookie)
      .expect(409);
  });

  it('removes inherited Project access while preserving an explicit path', async () => {
    const organization = await createOrganization('Access paths');
    let membership = await addMember(organization.id, memberEmail);
    const project = await createProject(organization.id, 'Access Project');
    await request(baseUrl)
      .get(`/api/projects/${project.id}`)
      .set('Cookie', memberCookie)
      .expect(200);

    await request(baseUrl)
      .delete(`/api/organizations/${organization.id}/members/${membership.id}`)
      .set('Cookie', ownerCookie)
      .expect(204);
    await request(baseUrl)
      .get(`/api/projects/${project.id}`)
      .set('Cookie', memberCookie)
      .expect(403);

    membership = await addMember(organization.id, memberEmail);
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: memberId, role: 'MEMBER' },
    });
    await request(baseUrl)
      .delete(`/api/organizations/${organization.id}/members/${membership.id}`)
      .set('Cookie', ownerCookie)
      .expect(204);
    await request(baseUrl)
      .get(`/api/projects/${project.id}`)
      .set('Cookie', memberCookie)
      .expect(200);
  });

  it('serializes concurrent self-demotion and leaves exactly one OWNER', async () => {
    const organization = await createOrganization('Concurrent owners');
    const second = await addMember(organization.id, secondOwnerEmail);
    await request(baseUrl)
      .patch(`/api/organizations/${organization.id}/members/${second.id}`)
      .set('Cookie', ownerCookie)
      .send({ role: 'OWNER' })
      .expect(200);
    const creator = await prisma.organizationMember.findUniqueOrThrow({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: ownerId,
        },
      },
      select: { id: true },
    });

    const responses = await Promise.all([
      request(baseUrl)
        .patch(`/api/organizations/${organization.id}/members/${creator.id}`)
        .set('Cookie', ownerCookie)
        .send({ role: 'MEMBER' }),
      request(baseUrl)
        .patch(`/api/organizations/${organization.id}/members/${second.id}`)
        .set('Cookie', secondOwnerCookie)
        .send({ role: 'MEMBER' }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    await expect(
      prisma.organizationMember.count({
        where: { organizationId: organization.id, role: 'OWNER' },
      }),
    ).resolves.toBe(1);
  });

  it('evicts lost realtime access and retains an explicit Project path', async () => {
    const organization = await createOrganization('Realtime access');
    let membership = await addMember(organization.id, memberEmail);
    const project = await createProject(organization.id, 'Realtime access');
    let socket = await connectSocket(memberCookie);
    await subscribe(socket, project.id);
    const revoked = waitForSocketEvent<{ projectId: string }>(
      socket,
      'project:access-revoked',
    );
    await request(baseUrl)
      .delete(`/api/organizations/${organization.id}/members/${membership.id}`)
      .set('Cookie', ownerCookie)
      .expect(204);
    await expect(revoked).resolves.toEqual({ projectId: project.id });
    await request(baseUrl)
      .get(`/api/projects/${project.id}`)
      .set('Cookie', memberCookie)
      .expect(403);

    membership = await addMember(organization.id, memberEmail);
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: memberId, role: 'MEMBER' },
    });
    socket.disconnect();
    socket = await connectSocket(memberCookie);
    await subscribe(socket, project.id);
    let wasRevoked = false;
    socket.once('project:access-revoked', () => (wasRevoked = true));
    await request(baseUrl)
      .delete(`/api/organizations/${organization.id}/members/${membership.id}`)
      .set('Cookie', ownerCookie)
      .expect(204);
    const updated = waitForSocketEvent(socket, 'project:event');
    await request(baseUrl)
      .patch(`/api/projects/${project.id}`)
      .set('Cookie', ownerCookie)
      .send({ name: 'Realtime access retained' })
      .expect(200);
    await updated;
    expect(wasRevoked).toBe(false);
  });

  async function signUp(name: string, email: string): Promise<string> {
    const response = await request(baseUrl)
      .post('/api/auth/sign-up/email')
      .send({ name, email, password })
      .expect(200);
    const values: unknown = response.headers['set-cookie'];
    const cookies = Array.isArray(values)
      ? values.filter((value): value is string => typeof value === 'string')
      : typeof values === 'string'
        ? [values]
        : [];
    return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
  }

  async function createOrganization(
    name: string,
  ): Promise<OrganizationFixture> {
    const response = await request(baseUrl)
      .post('/api/organizations')
      .set('Cookie', ownerCookie)
      .send({
        name,
        slug: `org-admin-${runId}-${organizationIds.size + 1}`,
      })
      .expect(201);
    const organization = response.body as OrganizationFixture;
    organizationIds.add(organization.id);
    return organization;
  }

  async function addMember(organizationId: string, email: string) {
    const response = await request(baseUrl)
      .post(`/api/organizations/${organizationId}/members`)
      .set('Cookie', ownerCookie)
      .send({ email })
      .expect(201);
    return response.body as { id: string; userId: string; role: string };
  }

  async function createProject(
    organizationId: string,
    name: string,
  ): Promise<ProjectFixture> {
    const response = await request(baseUrl)
      .post('/api/projects')
      .set('Cookie', ownerCookie)
      .send({ organizationId, name })
      .expect(201);
    return response.body as ProjectFixture;
  }

  function connectSocket(cookie: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/realtime`, {
        forceNew: true,
        reconnection: false,
        transports: ['websocket'],
        extraHeaders: {
          Origin: 'http://localhost:3000',
          Cookie: cookie,
        },
      });
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  function subscribe(socket: Socket, projectId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      socket
        .timeout(2_000)
        .emit(
          'project:subscribe',
          { projectId },
          (error: Error | null, response: { ok: boolean }) => {
            if (error || !response.ok) reject(error ?? new Error('Forbidden'));
            else resolve();
          },
        );
    });
  }

  function waitForSocketEvent<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timed out waiting for ${event}`)),
        3_000,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timeout);
        resolve(payload);
      });
    });
  }

  async function clearOrganizations(): Promise<void> {
    const ids = [...organizationIds];
    organizationIds.clear();
    if (!prisma || ids.length === 0) return;
    const projects = await prisma.project.findMany({
      where: { organizationId: { in: ids } },
      select: { id: true },
    });
    const projectIds = projects.map((project) => project.id);
    if (projectIds.length > 0) {
      await prisma.githubWebhookDelivery.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.notification.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.activity.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.comment.deleteMany({
        where: { task: { projectId: { in: projectIds } } },
      });
      await prisma.task.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.projectMember.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.repository.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.column.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.board.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    await prisma.organizationMember.deleteMany({
      where: { organizationId: { in: ids } },
    });
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  }
});
