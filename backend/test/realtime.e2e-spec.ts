import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import { Server as HttpServer } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RealtimeService } from '../src/realtime/realtime.service';
import type { RealtimeEventEnvelope } from '../src/realtime/realtime.types';

interface ProjectFixture {
  id: string;
  organizationId: string;
  board: { columns: Array<{ id: string }> };
}

describe('Realtime collaboration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let realtime: RealtimeService;
  let baseUrl: string;
  let ownerCookie: string;
  let collaboratorCookie: string;
  let outsiderCookie: string;
  let collaboratorId: string;
  let projectA: ProjectFixture;
  let projectB: ProjectFixture;
  const sockets: Socket[] = [];
  const runId = Date.now().toString(36);
  const password = 'RealtimeE2ePassword123!';
  const ownerEmail = `realtime-owner-${runId}@example.test`;
  const collaboratorEmail = `realtime-member-${runId}@example.test`;
  const outsiderEmail = `realtime-outsider-${runId}@example.test`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.listen(0, '127.0.0.1');
    const httpServer: unknown = app.getHttpServer();
    if (!(httpServer instanceof HttpServer)) {
      throw new Error('Realtime e2e HTTP server was not created');
    }
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Realtime e2e HTTP server address is unavailable');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = moduleFixture.get(PrismaService);
    realtime = moduleFixture.get(RealtimeService);

    ownerCookie = await signUp('Realtime Owner', ownerEmail);
    collaboratorCookie = await signUp(
      'Realtime Collaborator',
      collaboratorEmail,
    );
    outsiderCookie = await signUp('Realtime Outsider', outsiderEmail);
    collaboratorId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: collaboratorEmail },
        select: { id: true },
      })
    ).id;
    projectA = await createProject('Realtime Project A', 'realtime-a');
    projectB = await createProject('Realtime Project B', 'realtime-b');

    await prisma.organizationMember.create({
      data: {
        organizationId: projectA.organizationId,
        userId: collaboratorId,
        role: 'MEMBER',
      },
    });
    await prisma.projectMember.create({
      data: {
        projectId: projectA.id,
        userId: collaboratorId,
        role: 'MEMBER',
      },
    });
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    const projectIds = [projectA?.id, projectB?.id].filter(Boolean);
    const organizationIds = [
      projectA?.organizationId,
      projectB?.organizationId,
    ].filter(Boolean);
    if (projectIds.length) {
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
      await prisma.column.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.board.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    if (organizationIds.length) {
      await prisma.organizationMember.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }
    const users = await prisma.user.findMany({
      where: { email: { in: [ownerEmail, collaboratorEmail, outsiderEmail] } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('rejects unauthenticated sockets and accepts authenticated sessions', async () => {
    await expect(connectSocket()).rejects.toThrow('Authentication required');
    const socket = await connectSocket(ownerCookie);
    expect(socket.connected).toBe(true);
  });

  it('authorizes valid Project subscriptions and rejects outsiders', async () => {
    const ownerSocket = await connectSocket(ownerCookie);
    await expect(subscribe(ownerSocket, projectA.id)).resolves.toMatchObject({
      ok: true,
      projectId: projectA.id,
    });
    const outsiderSocket = await connectSocket(outsiderCookie);
    await expect(subscribe(outsiderSocket, projectA.id)).resolves.toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });

  it('delivers Task mutations after commit, including same-Column reorder', async () => {
    const socket = await connectSocket(collaboratorCookie);
    const observer = await connectSocket(ownerCookie);
    await subscribe(socket, projectA.id);
    await subscribe(observer, projectA.id);

    const firstEvent = waitForEvent(socket, 'TASK_CREATED');
    const first = await request(baseUrl)
      .post('/api/tasks')
      .set('Cookie', collaboratorCookie)
      .send({
        title: 'Realtime first',
        projectId: projectA.id,
        columnId: projectA.board.columns[0].id,
      })
      .expect(201);
    const firstBody = first.body as unknown as { id: string };
    expect((await firstEvent).entityId).toBe(firstBody.id);

    const secondEvent = waitForEvent(socket, 'TASK_CREATED');
    const second = await request(baseUrl)
      .post('/api/tasks')
      .set('Cookie', collaboratorCookie)
      .send({
        title: 'Realtime second',
        projectId: projectA.id,
        columnId: projectA.board.columns[0].id,
      })
      .expect(201);
    await secondEvent;

    const reorderEvent = waitForEvent(socket, 'TASK_MOVED');
    await request(baseUrl)
      .patch(`/api/tasks/${(second.body as unknown as { id: string }).id}/move`)
      .set('Cookie', collaboratorCookie)
      .send({ columnId: projectA.board.columns[0].id, targetIndex: 0 })
      .expect(200);
    expect((await reorderEvent).entityId).toBe(
      (second.body as unknown as { id: string }).id,
    );

    const deletedTaskId = (second.body as unknown as { id: string }).id;
    const deletedEvent = waitForEvent(observer, 'TASK_DELETED');
    await request(baseUrl)
      .delete(`/api/tasks/${deletedTaskId}`)
      .set('Cookie', collaboratorCookie)
      .expect(204);
    await expect(deletedEvent).resolves.toMatchObject({
      entityId: deletedTaskId,
      taskId: deletedTaskId,
    });
    await request(baseUrl)
      .get(`/api/tasks/${deletedTaskId}`)
      .set('Cookie', ownerCookie)
      .expect(404);
  });

  it('isolates Projects and emits nothing for rejected cross-Project movement', async () => {
    const socket = await connectSocket(ownerCookie);
    await subscribe(socket, projectA.id);
    const received: RealtimeEventEnvelope[] = [];
    socket.on('project:event', (event: RealtimeEventEnvelope) =>
      received.push(event),
    );

    await request(baseUrl)
      .post('/api/tasks')
      .set('Cookie', ownerCookie)
      .send({
        title: 'Other Project Task',
        projectId: projectB.id,
        columnId: projectB.board.columns[0].id,
      })
      .expect(201);
    await delay(150);
    expect(received).toHaveLength(0);

    const task = await prisma.task.findFirstOrThrow({
      where: { projectId: projectA.id },
      select: { id: true },
    });
    await request(baseUrl)
      .patch(`/api/tasks/${task.id}/move`)
      .set('Cookie', ownerCookie)
      .send({ columnId: projectB.board.columns[0].id, targetIndex: 0 })
      .expect(400);
    await delay(150);
    expect(received).toHaveLength(0);
  });

  it('delivers Column, Comment, Membership, and Project events', async () => {
    const socket = await connectSocket(ownerCookie);
    const secondSocket = await connectSocket(collaboratorCookie);
    await subscribe(socket, projectA.id);
    await subscribe(secondSocket, projectA.id);

    const columnEvent = waitForEvent(socket, 'COLUMN_CREATED');
    await request(baseUrl)
      .post(`/api/projects/${projectA.id}/columns`)
      .set('Cookie', ownerCookie)
      .send({ name: 'Realtime Column' })
      .expect(201);
    await columnEvent;

    const task = await prisma.task.findFirstOrThrow({
      where: { projectId: projectA.id },
      select: { id: true },
    });
    const commentEvent = waitForEvent(socket, 'COMMENT_CREATED');
    await request(baseUrl)
      .post(`/api/tasks/${task.id}/comments`)
      .set('Cookie', ownerCookie)
      .send({ content: 'Realtime comment' })
      .expect(201);
    expect((await commentEvent).taskId).toBe(task.id);

    const member = await prisma.projectMember.findFirstOrThrow({
      where: { projectId: projectA.id, userId: collaboratorId },
      select: { id: true },
    });
    const ownerMemberEvent = waitForEvent(
      socket,
      'PROJECT_MEMBER_ROLE_CHANGED',
    );
    const collaboratorMemberEvent = waitForEvent(
      secondSocket,
      'PROJECT_MEMBER_ROLE_CHANGED',
    );
    await request(baseUrl)
      .patch(`/api/projects/${projectA.id}/members/${member.id}`)
      .set('Cookie', ownerCookie)
      .send({ role: 'OWNER' })
      .expect(200);
    await Promise.all([ownerMemberEvent, collaboratorMemberEvent]);

    const removedEvent = waitForEvent(secondSocket, 'PROJECT_MEMBER_REMOVED');
    await request(baseUrl)
      .delete(`/api/projects/${projectA.id}/members/${member.id}`)
      .set('Cookie', ownerCookie)
      .expect(204);
    await expect(removedEvent).resolves.toMatchObject({ entityId: member.id });

    const addedEvent = waitForEvent(secondSocket, 'PROJECT_MEMBER_ADDED');
    const added = await request(baseUrl)
      .post(`/api/projects/${projectA.id}/members`)
      .set('Cookie', ownerCookie)
      .send({ userId: collaboratorId, role: 'MEMBER' })
      .expect(201);
    await expect(addedEvent).resolves.toMatchObject({
      entityId: (added.body as unknown as { id: string }).id,
    });

    const projectEvent = waitForEvent(socket, 'PROJECT_UPDATED');
    await request(baseUrl)
      .patch(`/api/projects/${projectA.id}`)
      .set('Cookie', ownerCookie)
      .send({ name: 'Realtime Project A updated' })
      .expect(200);
    await projectEvent;

    const archivedEvent = waitForEvent(socket, 'PROJECT_ARCHIVED');
    await request(baseUrl)
      .delete(`/api/projects/${projectA.id}`)
      .set('Cookie', ownerCookie)
      .expect(204);
    await archivedEvent;

    const restoredEvent = waitForEvent(socket, 'PROJECT_RESTORED');
    await request(baseUrl)
      .post(`/api/projects/${projectA.id}/restore`)
      .set('Cookie', ownerCookie)
      .expect(200);
    await restoredEvent;
  });

  it('converges two authorized clients viewing the same Project', async () => {
    const ownerSocket = await connectSocket(ownerCookie);
    const collaboratorSocket = await connectSocket(collaboratorCookie);
    await Promise.all([
      subscribe(ownerSocket, projectA.id),
      subscribe(collaboratorSocket, projectA.id),
    ]);
    const ownerEvent = waitForEvent(ownerSocket, 'TASK_UPDATED');
    const collaboratorEvent = waitForEvent(collaboratorSocket, 'TASK_UPDATED');
    const task = await prisma.task.findFirstOrThrow({
      where: { projectId: projectA.id },
      select: { id: true },
    });

    await request(baseUrl)
      .patch(`/api/tasks/${task.id}`)
      .set('Cookie', ownerCookie)
      .send({ title: 'Updated for both realtime clients' })
      .expect(200);

    const [first, second] = await Promise.all([ownerEvent, collaboratorEvent]);
    expect(first.entityId).toBe(task.id);
    expect(second.entityId).toBe(task.id);
    expect(first.id).toBe(second.id);
  });

  it('evicts a socket once authoritative Project access is gone', async () => {
    const socket = await connectSocket(collaboratorCookie);
    await subscribe(socket, projectA.id);
    const revoked = new Promise<{ projectId: string }>((resolve) =>
      socket.once('project:access-revoked', resolve),
    );

    await prisma.projectMember.deleteMany({
      where: { projectId: projectA.id, userId: collaboratorId },
    });
    await prisma.organizationMember.deleteMany({
      where: {
        organizationId: projectA.organizationId,
        userId: collaboratorId,
      },
    });
    await realtime.reauthorizeProject(projectA.id);
    await expect(revoked).resolves.toEqual({ projectId: projectA.id });
    await expect(subscribe(socket, projectA.id)).resolves.toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });

  async function signUp(name: string, email: string): Promise<string> {
    const response = await request(baseUrl)
      .post('/api/auth/sign-up/email')
      .send({ name, email, password })
      .expect(200);
    const values: unknown = response.headers['set-cookie'];
    const cookies: string[] =
      typeof values === 'string'
        ? [values]
        : Array.isArray(values)
          ? values.filter(
              (value: unknown): value is string => typeof value === 'string',
            )
          : [];
    return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
  }

  async function createProject(
    name: string,
    slugPrefix: string,
  ): Promise<ProjectFixture> {
    const organization = await request(baseUrl)
      .post('/api/organizations')
      .set('Cookie', ownerCookie)
      .send({ name: `${name} Org`, slug: `${slugPrefix}-${runId}` })
      .expect(201);
    const organizationId = (organization.body as unknown as { id: string }).id;
    const project = await request(baseUrl)
      .post('/api/projects')
      .set('Cookie', ownerCookie)
      .send({ name, organizationId: organizationId })
      .expect(201);
    const body: unknown = project.body;
    return body as ProjectFixture;
  }

  function connectSocket(cookie?: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/realtime`, {
        forceNew: true,
        reconnection: false,
        transports: ['websocket'],
        extraHeaders: {
          Origin: 'http://localhost:3000',
          ...(cookie ? { Cookie: cookie } : {}),
        },
      });
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  function subscribe(socket: Socket, projectId: string): Promise<unknown> {
    return new Promise((resolve) => {
      socket
        .timeout(2_000)
        .emit(
          'project:subscribe',
          { projectId },
          (error: Error | null, response: unknown) =>
            resolve(error ? { ok: false, error: 'TIMEOUT' } : response),
        );
    });
  }

  function waitForEvent(
    socket: Socket,
    type: RealtimeEventEnvelope['type'],
  ): Promise<RealtimeEventEnvelope> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timed out waiting for ${type}`)),
        3_000,
      );
      const listener = (event: RealtimeEventEnvelope) => {
        if (event.type !== type) return;
        clearTimeout(timeout);
        socket.off('project:event', listener);
        resolve(event);
      };
      socket.on('project:event', listener);
    });
  }

  function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
});
