/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server as HttpServer } from 'node:http';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { environment } from '../src/config/environment';
import { PrismaService } from '../src/prisma/prisma.service';
import type { RealtimeEventEnvelope } from '../src/realtime/realtime.types';

describe('Time tracking core (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let member: ReturnType<typeof request.agent>;
  let outsider: ReturnType<typeof request.agent>;
  let memberCookie = '';
  let ownerId = '';
  let memberId = '';
  let outsiderId = '';
  let organizationA = '';
  let organizationB = '';
  let projectA = '';
  let projectB = '';
  let taskA = '';
  let taskA2 = '';
  let taskB = '';
  let baseUrl = '';
  const sockets: Socket[] = [];
  const runId = Date.now().toString(36);
  const password = 'TimeTrackingE2e123!';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ rawBody: true });
    await app.listen(0, '127.0.0.1');
    prisma = module.get(PrismaService);
    const server: unknown = app.getHttpServer();
    if (!(server instanceof HttpServer))
      throw new Error('HTTP server unavailable');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('HTTP address unavailable');
    baseUrl = `http://127.0.0.1:${address.port}`;
    owner = request.agent(server);
    member = request.agent(server);
    outsider = request.agent(server);

    const accounts = [
      ['Owner', `time-owner-${runId}@test.dev`, owner],
      ['Member', `time-member-${runId}@test.dev`, member],
      ['Outsider', `time-outsider-${runId}@test.dev`, outsider],
    ] as const;
    const cookies: string[] = [];
    for (const [name, email, agent] of accounts) {
      const response = await agent
        .post('/api/auth/sign-up/email')
        .send({ name, email, password })
        .expect(200);
      cookies.push(readCookie(response.headers['set-cookie']));
    }
    memberCookie = cookies[1]!;
    const users = await prisma.user.findMany({
      where: { email: { in: accounts.map(([, email]) => email) } },
      select: { id: true, email: true },
    });
    const idFor = (email: string) =>
      users.find((user) => user.email === email)!.id;
    ownerId = idFor(accounts[0][1]);
    memberId = idFor(accounts[1][1]);
    outsiderId = idFor(accounts[2][1]);

    organizationA = (
      await owner
        .post('/api/organizations')
        .send({ name: 'Time A', slug: `time-a-${runId}` })
        .expect(201)
    ).body.id as string;
    projectA = (
      await owner
        .post('/api/projects')
        .send({ name: 'Time Project A', organizationId: organizationA })
        .expect(201)
    ).body.id as string;
    await prisma.organizationMember.create({
      data: { organizationId: organizationA, userId: memberId },
    });
    const columnA = (
      await prisma.column.findFirstOrThrow({
        where: { projectId: projectA },
        orderBy: { position: 'asc' },
      })
    ).id;
    taskA = (
      await prisma.task.create({
        data: {
          title: 'Timed task',
          projectId: projectA,
          columnId: columnA,
          position: 0,
          reporterId: ownerId,
        },
      })
    ).id;
    taskA2 = (
      await prisma.task.create({
        data: {
          title: 'Second task',
          projectId: projectA,
          columnId: columnA,
          position: 1,
          reporterId: ownerId,
        },
      })
    ).id;

    organizationB = (
      await outsider
        .post('/api/organizations')
        .send({ name: 'Time B', slug: `time-b-${runId}` })
        .expect(201)
    ).body.id as string;
    projectB = (
      await outsider
        .post('/api/projects')
        .send({ name: 'Time Project B', organizationId: organizationB })
        .expect(201)
    ).body.id as string;
    const columnB = (
      await prisma.column.findFirstOrThrow({
        where: { projectId: projectB },
        orderBy: { position: 'asc' },
      })
    ).id;
    taskB = (
      await prisma.task.create({
        data: {
          title: 'Foreign task',
          projectId: projectB,
          columnId: columnB,
          position: 0,
          reporterId: outsiderId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    const projectIds = [projectA, projectB].filter(Boolean);
    const organizationIds = [organizationA, organizationB].filter(Boolean);
    const userIds = [ownerId, memberId, outsiderId].filter(Boolean);
    await prisma.timeEntry.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await prisma.notification.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await prisma.activity.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await prisma.task.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.column.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await prisma.board.deleteMany({ where: { projectId: { in: projectIds } } });
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
    await app.close();
  });

  it('enforces authentication, Project access, strict validation and manual duration bounds', async () => {
    await request(app.getHttpServer())
      .get(`/api/tasks/${taskA}/time`)
      .expect(401);
    await outsider.get(`/api/tasks/${taskA}/time`).expect(403);
    await member
      .post(`/api/tasks/${taskB}/time`)
      .send(pastInterval(600))
      .expect(403);
    await member
      .post(`/api/tasks/${taskA}/time`)
      .send({
        startedAt: '2026-09-10T01:00:00.000Z',
        endedAt: '2026-09-10T00:00:00.000Z',
      })
      .expect(400);
    await member
      .post(`/api/tasks/${taskA}/time`)
      .send({
        startedAt: '2026-09-08T00:00:00.000Z',
        endedAt: '2026-09-10T00:00:01.000Z',
      })
      .expect(400);
    await member
      .post(`/api/tasks/${taskA}/time`)
      .send({
        startedAt: '2026-09-10T00:00:00.000Z',
        endedAt: '2026-09-10T00:01:30.900Z',
        extra: true,
      })
      .expect(400);

    const manual = await member
      .post(`/api/tasks/${taskA}/time`)
      .send({ ...pastInterval(90), note: ' Review ' })
      .expect(201);
    expect(manual.body).toMatchObject({
      projectId: projectA,
      taskId: taskA,
      userId: memberId,
      durationSeconds: 90,
      note: 'Review',
    });
  });

  it('enforces the one-active-timer invariant under sequential and concurrent starts', async () => {
    const responses = await Promise.all([
      member.post(`/api/tasks/${taskA}/time/start`).send({}),
      member.post(`/api/tasks/${taskA2}/time/start`).send({}),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const active = await member.get('/api/time/active').expect(200);
    expect(active.body.activeTimer.userId).toBe(memberId);
    const activeTaskId = active.body.activeTimer.taskId as string;
    await member
      .post(`/api/tasks/${activeTaskId}/time/start`)
      .send({})
      .expect(409);
    const stopped = await member
      .post(`/api/tasks/${activeTaskId}/time/stop`)
      .send({})
      .expect(201);
    expect(stopped.body.durationSeconds).toBeGreaterThanOrEqual(1);
    expect(stopped.body.endedAt).toBeTruthy();
    await member
      .get('/api/time/active')
      .expect(200)
      .expect(({ body }) => expect(body.activeTimer).toBeNull());
    await member
      .post(`/api/tasks/${activeTaskId}/time/stop`)
      .send({})
      .expect(404);
    expect(
      await prisma.timeEntry.count({
        where: { userId: memberId, activeMarker: true },
      }),
    ).toBe(0);
  });

  it('returns deterministic own history, collaborator aggregates, and owner-only user breakdown', async () => {
    await owner
      .post(`/api/tasks/${taskA}/time`)
      .send(pastInterval(120, 300))
      .expect(201);
    const taskTime = await member
      .get(`/api/tasks/${taskA}/time?limit=1`)
      .expect(200);
    expect(taskTime.body.totalSeconds).toBeGreaterThanOrEqual(210);
    expect(taskTime.body.items).toHaveLength(1);
    expect(taskTime.body.items[0].userId).toBe(memberId);
    if (taskTime.body.nextCursor) {
      const next = await member
        .get(
          `/api/tasks/${taskA}/time?limit=1&cursor=${taskTime.body.nextCursor}`,
        )
        .expect(200);
      const nextBody = next.body as { items: Array<{ userId: string }> };
      expect(nextBody.items.every((item) => item.userId === memberId)).toBe(
        true,
      );
    }
    const memberSummary = await member
      .get(`/api/projects/${projectA}/time`)
      .expect(200);
    expect(memberSummary.body.totalSeconds).toBeGreaterThanOrEqual(210);
    expect(memberSummary.body.currentUserSeconds).toBeGreaterThanOrEqual(90);
    expect(memberSummary.body.users).toBeNull();
    const ownerSummary = await owner
      .get(`/api/projects/${projectA}/time`)
      .expect(200);
    expect(ownerSummary.body.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: memberId }),
        expect.objectContaining({ userId: ownerId }),
      ]),
    );
    expect(JSON.stringify(memberSummary.body)).not.toContain(
      `time-owner-${runId}@test.dev`,
    );
  });

  it('publishes compact Project-scoped realtime invalidation without Activity or Notification spam', async () => {
    const socket = await connectSocket(baseUrl, memberCookie);
    sockets.push(socket);
    await subscribe(socket, projectA);
    const beforeActivities = await prisma.activity.count({
      where: { projectId: projectA },
    });
    const beforeNotifications = await prisma.notification.count({
      where: { projectId: projectA },
    });
    const eventPromise = waitForEvent(socket, 'TIME_ENTRY_CREATED');
    const created = await member
      .post(`/api/tasks/${taskA}/time`)
      .send(pastInterval(45, 600))
      .expect(201);
    const event = await eventPromise;
    const createdId = (created.body as { id: string }).id;
    expect(event).toMatchObject({
      projectId: projectA,
      entity: 'time-entry',
      entityId: createdId,
      taskId: taskA,
      actorId: memberId,
    });
    expect(event).not.toHaveProperty('durationSeconds');
    expect(
      await prisma.activity.count({ where: { projectId: projectA } }),
    ).toBe(beforeActivities);
    expect(
      await prisma.notification.count({ where: { projectId: projectA } }),
    ).toBe(beforeNotifications);
  });
});

function readCookie(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) throw new Error('Authentication cookie unavailable');
  const cookie = raw.split(';')[0];
  if (!cookie) throw new Error('Authentication cookie unavailable');
  return cookie;
}

function connectSocket(baseUrl: string, cookie: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`${baseUrl}/realtime`, {
      transports: ['websocket'],
      extraHeaders: { cookie, origin: environment.frontendUrl },
    });
    const timeout = setTimeout(
      () => reject(new Error('Socket connection timed out')),
      5000,
    );
    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function pastInterval(durationSeconds: number, endedAgoSeconds = 60) {
  const endedAt = new Date(Date.now() - endedAgoSeconds * 1000);
  const startedAt = new Date(endedAt.getTime() - durationSeconds * 1000);
  return { startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString() };
}

function subscribe(socket: Socket, projectId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.emit(
      'project:subscribe',
      { projectId },
      (response: { ok: boolean }) =>
        response.ok ? resolve() : reject(new Error('Subscription rejected')),
    );
  });
}

function waitForEvent(
  socket: Socket,
  type: string,
): Promise<RealtimeEventEnvelope> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${type}`)),
      5000,
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
