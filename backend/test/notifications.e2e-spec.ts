import type { INestApplication } from '@nestjs/common';
import { jest } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { Server as HttpServer } from 'node:http';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { NotificationType } from '../src/notifications/notification.types';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';

interface ProjectFixture {
  id: string;
  organizationId: string;
  board: { columns: Array<{ id: string }> };
  projectMembers: Array<{ id: string; userId: string }>;
}

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notificationsService: NotificationsService;
  let baseUrl: string;
  let ownerCookie: string;
  let collaboratorCookie: string;
  let ownerId: string;
  let collaboratorId: string;
  let outsiderId: string;
  let project: ProjectFixture;
  const sockets: Socket[] = [];
  const runId = Date.now().toString(36);
  const password = 'NotificationsE2ePassword123!';
  const ownerEmail = `notifications-owner-${runId}@example.test`;
  const collaboratorEmail = `notifications-member-${runId}@example.test`;
  const outsiderEmail = `notifications-outsider-${runId}@example.test`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.listen(0, '127.0.0.1');
    const server: unknown = app.getHttpServer();
    if (!(server instanceof HttpServer)) throw new Error('HTTP server missing');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Port missing');
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = moduleFixture.get(PrismaService);
    notificationsService = moduleFixture.get(NotificationsService);

    ownerCookie = await signUp('Notification Owner', ownerEmail);
    collaboratorCookie = await signUp('Notification Member', collaboratorEmail);
    await signUp('Notification Outsider', outsiderEmail);
    const users = await prisma.user.findMany({
      where: { email: { in: [ownerEmail, collaboratorEmail, outsiderEmail] } },
      select: { id: true, email: true },
    });
    ownerId = users.find((user) => user.email === ownerEmail)!.id;
    collaboratorId = users.find((user) => user.email === collaboratorEmail)!.id;
    outsiderId = users.find((user) => user.email === outsiderEmail)!.id;

    const organization = await request(baseUrl)
      .post('/api/organizations')
      .set('Cookie', ownerCookie)
      .send({ name: 'Notification Org', slug: `notifications-${runId}` })
      .expect(201);
    const organizationId = (organization.body as { id: string }).id;
    const response = await request(baseUrl)
      .post('/api/projects')
      .set('Cookie', ownerCookie)
      .send({ name: 'Notification Project', organizationId })
      .expect(201);
    project = response.body as ProjectFixture;
    await prisma.organizationMember.create({
      data: { organizationId, userId: collaboratorId, role: 'MEMBER' },
    });
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    if (project) {
      await prisma.notification.deleteMany({
        where: { projectId: project.id },
      });
      await prisma.activity.deleteMany({ where: { projectId: project.id } });
      await prisma.comment.deleteMany({
        where: { task: { projectId: project.id } },
      });
      await prisma.task.deleteMany({ where: { projectId: project.id } });
      await prisma.projectMember.deleteMany({
        where: { projectId: project.id },
      });
      await prisma.column.deleteMany({ where: { projectId: project.id } });
      await prisma.board.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.organizationMember.deleteMany({
        where: { organizationId: project.organizationId },
      });
      await prisma.organization.delete({
        where: { id: project.organizationId },
      });
    }
    const userIds = [ownerId, collaboratorId, outsiderId].filter(Boolean);
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  beforeEach(async () => {
    if (project) {
      await prisma.notification.deleteMany({
        where: { projectId: project.id },
      });
    }
  });

  it('creates assignment notifications atomically, suppresses actors, and preserves history', async () => {
    const task = await createTask('Assignment Task');
    await request(baseUrl)
      .patch(`/api/tasks/${task.id}`)
      .set('Cookie', ownerCookie)
      .send({ assigneeId: collaboratorId })
      .expect(200);
    const rows = await prisma.notification.findMany({
      where: { projectId: project.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: collaboratorId,
      actorId: ownerId,
      type: NotificationType.TASK_ASSIGNED_TO_YOU,
      entityId: task.id,
    });

    const beforeRejected = await prisma.notification.count();
    await request(baseUrl)
      .patch(`/api/tasks/${task.id}`)
      .set('Cookie', ownerCookie)
      .send({ assigneeId: outsiderId })
      .expect(400);
    expect(await prisma.notification.count()).toBe(beforeRejected);

    await request(baseUrl)
      .patch(`/api/tasks/${task.id}`)
      .set('Cookie', collaboratorCookie)
      .send({ assigneeId: null })
      .expect(200);
    expect(
      await prisma.notification.count({
        where: { type: NotificationType.TASK_UNASSIGNED_FROM_YOU },
      }),
    ).toBe(0);

    await request(baseUrl)
      .delete(`/api/tasks/${task.id}`)
      .set('Cookie', ownerCookie)
      .expect(204);
    expect(
      await prisma.notification.count({ where: { entityId: task.id } }),
    ).toBe(1);
  });

  it('notifies one deduplicated recipient for a reply without storing content', async () => {
    const task = await createTask('Comment Task', collaboratorId);
    const parent = await request(baseUrl)
      .post(`/api/tasks/${task.id}/comments`)
      .set('Cookie', collaboratorCookie)
      .send({ content: 'Parent private body' })
      .expect(201);
    const parentBody = parent.body as unknown as { id: string };
    await prisma.notification.deleteMany({ where: { projectId: project.id } });
    await request(baseUrl)
      .post(`/api/tasks/${task.id}/comments`)
      .set('Cookie', ownerCookie)
      .send({
        content: 'Reply private body',
        parentId: parentBody.id,
      })
      .expect(201);
    const rows = await prisma.notification.findMany({
      where: { projectId: project.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: collaboratorId,
      type: NotificationType.COMMENT_REPLY_TO_YOU,
    });
    expect(JSON.stringify(rows[0].metadata)).not.toContain('private body');
  });

  it('rolls back the domain mutation when Notification persistence fails', async () => {
    const task = await createTask('Atomic notification');
    jest
      .spyOn(notificationsService, 'recordTaskAssignment')
      .mockRejectedValueOnce(new Error('forced Notification failure'));
    await request(baseUrl)
      .patch(`/api/tasks/${task.id}`)
      .set('Cookie', ownerCookie)
      .send({ assigneeId: collaboratorId })
      .expect(500);
    const persisted = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { assigneeId: true },
    });
    expect(persisted.assigneeId).toBeNull();
    expect(
      await prisma.notification.count({ where: { entityId: task.id } }),
    ).toBe(0);
  });

  it('notifies the target for membership add and a real role change', async () => {
    const added = await request(baseUrl)
      .post(`/api/projects/${project.id}/members`)
      .set('Cookie', ownerCookie)
      .send({ userId: collaboratorId, role: 'MEMBER' })
      .expect(201);
    const addedBody = added.body as unknown as { id: string };
    await request(baseUrl)
      .patch(`/api/projects/${project.id}/members/${addedBody.id}`)
      .set('Cookie', ownerCookie)
      .send({ role: 'OWNER' })
      .expect(200);
    const rows = await prisma.notification.findMany({
      where: { userId: collaboratorId },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((row) => row.type)).toEqual([
      NotificationType.PROJECT_MEMBER_ADDED_YOU,
      NotificationType.PROJECT_MEMBER_ROLE_CHANGED_YOU,
    ]);
  });

  it('provides private pagination, unread count, and idempotent read operations', async () => {
    await createDirectNotifications(3);
    await request(baseUrl).get('/api/notifications').expect(401);
    const first = await request(baseUrl)
      .get('/api/notifications?limit=2')
      .set('Cookie', collaboratorCookie)
      .expect(200);
    const firstBody = first.body as unknown as {
      items: Array<{ id: string }>;
      nextCursor: string;
    };
    expect(firstBody.items).toHaveLength(2);
    expect(firstBody.nextCursor).toBeTruthy();
    const second = await request(baseUrl)
      .get(`/api/notifications?limit=2&cursor=${firstBody.nextCursor}`)
      .set('Cookie', collaboratorCookie)
      .expect(200);
    const secondBody = second.body as unknown as {
      items: Array<{ id: string }>;
    };
    expect(secondBody.items).toHaveLength(1);
    expect(
      new Set([...firstBody.items, ...secondBody.items].map((item) => item.id))
        .size,
    ).toBe(3);

    await request(baseUrl)
      .get('/api/notifications/unread-count')
      .set('Cookie', collaboratorCookie)
      .expect(200, { count: 3 });
    const id = firstBody.items[0].id;
    await request(baseUrl)
      .patch(`/api/notifications/${id}/read`)
      .set('Cookie', collaboratorCookie)
      .expect(200);
    await request(baseUrl)
      .patch(`/api/notifications/${id}/read`)
      .set('Cookie', collaboratorCookie)
      .expect(200);
    await request(baseUrl)
      .patch(`/api/notifications/${id}/read`)
      .set('Cookie', ownerCookie)
      .expect(404);
    await request(baseUrl)
      .post('/api/notifications/read-all')
      .set('Cookie', collaboratorCookie)
      .expect(200, { ok: true });
    await request(baseUrl)
      .get('/api/notifications/unread-count')
      .set('Cookie', collaboratorCookie)
      .expect(200, { count: 0 });
    await request(baseUrl)
      .get('/api/notifications/unread-count')
      .set('Cookie', ownerCookie)
      .expect(200, { count: 0 });
  });

  it('delivers compact realtime events only to the target user room', async () => {
    const target = await connectSocket(collaboratorCookie);
    const nonRecipient = await connectSocket(ownerCookie);
    const received = waitForNotification(target);
    let leaked = false;
    nonRecipient.once('notification:event', () => (leaked = true));
    const task = await createTask('Realtime notification');
    await request(baseUrl)
      .patch(`/api/tasks/${task.id}`)
      .set('Cookie', ownerCookie)
      .send({ assigneeId: collaboratorId })
      .expect(200);
    const event = await received;
    expect(event).toMatchObject({ type: 'NOTIFICATION_CREATED' });
    expect(typeof event.notificationId).toBe('string');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(leaked).toBe(false);
  });

  async function signUp(name: string, email: string): Promise<string> {
    const response = await request(baseUrl)
      .post('/api/auth/sign-up/email')
      .send({ name, email, password })
      .expect(200);
    const values: unknown = response.headers['set-cookie'];
    const cookies =
      typeof values === 'string'
        ? [values]
        : Array.isArray(values)
          ? values.filter((value): value is string => typeof value === 'string')
          : [];
    return cookies.map((cookie) => cookie.split(';')[0]).join('; ');
  }

  async function createTask(title: string, assigneeId?: string) {
    const response = await request(baseUrl)
      .post('/api/tasks')
      .set('Cookie', ownerCookie)
      .send({
        title,
        projectId: project.id,
        columnId: project.board.columns[0].id,
        ...(assigneeId && { assigneeId }),
      })
      .expect(201);
    return response.body as { id: string };
  }

  async function createDirectNotifications(count: number) {
    for (let index = 0; index < count; index += 1) {
      await prisma.notification.create({
        data: {
          type: NotificationType.PROJECT_MEMBER_ADDED_YOU,
          userId: collaboratorId,
          actorId: ownerId,
          projectId: project.id,
          entityType: 'project-member',
          entityId: null,
          metadata: { projectName: 'Notification Project', role: 'MEMBER' },
          createdAt: new Date(Date.now() + index * 1_000),
        },
      });
    }
  }

  function connectSocket(cookie: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/realtime`, {
        forceNew: true,
        reconnection: false,
        transports: ['websocket'],
        extraHeaders: { Origin: 'http://localhost:3000', Cookie: cookie },
      });
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  function waitForNotification(socket: Socket): Promise<{
    type: string;
    notificationId: string;
  }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('notification timeout')),
        2_000,
      );
      socket.once('notification:event', (event) => {
        clearTimeout(timeout);
        resolve(event as { type: string; notificationId: string });
      });
    });
  }
});
