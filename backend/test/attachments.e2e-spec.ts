/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unnecessary-type-assertion */
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { Server as HttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { FILE_STORAGE } from '../src/attachments/file-storage';
import { LocalFileStorage } from '../src/attachments/local-file-storage';
import { ActivitiesService } from '../src/activities/activities.service';
import { ActivityEvent } from '../src/activities/activity.types';
import { environment } from '../src/config/environment';
import { PrismaService } from '../src/prisma/prisma.service';
import type { RealtimeEventEnvelope } from '../src/realtime/realtime.types';
import { RealtimeService } from '../src/realtime/realtime.service';

interface ProjectFixture {
  id: string;
  organizationId: string;
  board: { columns: Array<{ id: string }> };
}

interface AttachmentBody {
  id: string;
  projectId: string;
  taskId: string | null;
  uploaderId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey?: string;
}

describe('Files and attachments core (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let activities: ActivitiesService;
  let realtime: RealtimeService;
  let storage: LocalFileStorage;
  let storageRoot = '';
  let baseUrl = '';
  let ownerClient: ReturnType<typeof request.agent>;
  let memberClient: ReturnType<typeof request.agent>;
  let projectOwnerClient: ReturnType<typeof request.agent>;
  let outsiderClient: ReturnType<typeof request.agent>;
  let memberCookie = '';
  let outsiderCookie = '';
  let ownerId = '';
  let memberId = '';
  let projectOwnerId = '';
  let outsiderId = '';
  let projectA: ProjectFixture;
  let projectB: ProjectFixture;
  let taskA = '';
  const sockets: Socket[] = [];
  const runId = Date.now().toString(36);
  const password = 'AttachmentsE2ePassword123!';

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'flowplan-attachments-e2e-'));
    storage = new LocalFileStorage(storageRoot);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FILE_STORAGE)
      .useValue(storage)
      .compile();
    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.listen(0, '127.0.0.1');
    prisma = moduleFixture.get(PrismaService);
    activities = moduleFixture.get(ActivitiesService);
    realtime = moduleFixture.get(RealtimeService);

    const server: unknown = app.getHttpServer();
    if (!(server instanceof HttpServer))
      throw new Error('HTTP server unavailable');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('HTTP address unavailable');
    baseUrl = `http://127.0.0.1:${address.port}`;

    ownerClient = request.agent(server);
    memberClient = request.agent(server);
    projectOwnerClient = request.agent(server);
    outsiderClient = request.agent(server);
    const signups = [
      ['Owner', `attachment-owner-${runId}@test.dev`, ownerClient],
      ['Member', `attachment-member-${runId}@test.dev`, memberClient],
      [
        'Project Owner',
        `attachment-project-owner-${runId}@test.dev`,
        projectOwnerClient,
      ],
      ['Outsider', `attachment-outsider-${runId}@test.dev`, outsiderClient],
    ] as const;
    const cookies: string[] = [];
    for (const [name, email, client] of signups) {
      const response = await client
        .post('/api/auth/sign-up/email')
        .send({ name, email, password })
        .expect(200);
      cookies.push(readCookie(response.headers['set-cookie']));
    }
    memberCookie = cookies[1]!;
    outsiderCookie = cookies[3]!;

    const users = await prisma.user.findMany({
      where: { email: { in: signups.map(([, email]) => email) } },
      select: { id: true, email: true },
    });
    const userId = (email: string) =>
      users.find((user) => user.email === email)!.id;
    ownerId = userId(signups[0][1]);
    memberId = userId(signups[1][1]);
    projectOwnerId = userId(signups[2][1]);
    outsiderId = userId(signups[3][1]);

    projectA = await createProject('Attachment A', `attachment-a-${runId}`);
    projectB = await createProject('Attachment B', `attachment-b-${runId}`);
    await prisma.organizationMember.create({
      data: { organizationId: projectA.organizationId, userId: memberId },
    });
    await prisma.projectMember.create({
      data: { projectId: projectA.id, userId: projectOwnerId, role: 'OWNER' },
    });
    taskA = (
      await ownerClient
        .post('/api/tasks')
        .send({
          title: 'Attachment Task',
          projectId: projectA.id,
          columnId: projectA.board.columns[0]!.id,
        })
        .expect(201)
    ).body.id as string;
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    if (prisma) {
      const userIds = [ownerId, memberId, projectOwnerId, outsiderId];
      const projectIds = [projectA?.id, projectB?.id].filter(Boolean);
      const organizationIds = [
        projectA?.organizationId,
        projectB?.organizationId,
      ].filter(Boolean);
      await prisma.file.deleteMany({
        where: { projectId: { in: projectIds } },
      });
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
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });

  async function createProject(
    name: string,
    slug: string,
  ): Promise<ProjectFixture> {
    const organization = await ownerClient
      .post('/api/organizations')
      .send({ name: `${name} Org`, slug })
      .expect(201);
    const response = await ownerClient
      .post('/api/projects')
      .send({ name, organizationId: organization.body.id as string })
      .expect(201);
    return response.body as ProjectFixture;
  }

  it('uploads, persists, lists, paginates, and downloads a Project attachment', async () => {
    await request(app.getHttpServer())
      .get(`/api/projects/${projectA.id}/attachments`)
      .expect(401);
    const uploaded = await memberClient
      .post(`/api/projects/${projectA.id}/attachments`)
      .attach('file', Buffer.from('first file'), {
        filename: '../../first.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    const body = uploaded.body as AttachmentBody;
    expect(body).toMatchObject({
      projectId: projectA.id,
      taskId: null,
      uploaderId: memberId,
      originalName: 'first.txt',
      mimeType: 'text/plain',
      sizeBytes: 10,
    });
    expect(body).not.toHaveProperty('storageKey');
    const stored = await prisma.file.findUniqueOrThrow({
      where: { id: body.id },
    });
    expect(await storage.exists(stored.storageKey)).toBe(true);

    await memberClient
      .post(`/api/projects/${projectA.id}/attachments`)
      .attach('file', Buffer.from('second file'), {
        filename: 'second.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    const pageOne = await memberClient
      .get(`/api/projects/${projectA.id}/attachments?limit=1`)
      .expect(200);
    expect(pageOne.body.items).toHaveLength(1);
    expect(pageOne.body.nextCursor).toEqual(expect.any(String));
    const pageTwo = await memberClient
      .get(
        `/api/projects/${projectA.id}/attachments?limit=1&cursor=${pageOne.body.nextCursor as string}`,
      )
      .expect(200);
    expect(pageTwo.body.items).toHaveLength(1);
    expect(pageTwo.body.items[0].id).not.toBe(pageOne.body.items[0].id);

    const download = await memberClient
      .get(`/api/projects/${projectA.id}/attachments/${body.id}/download`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(download.body).toEqual(Buffer.from('first file'));
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['content-disposition']).toContain('first.txt');
  });

  it('enforces Project/Task isolation and strict upload policy without residue', async () => {
    const taskUpload = await memberClient
      .post(`/api/tasks/${taskA}/attachments`)
      .attach('file', Buffer.from('task file'), {
        filename: 'task.csv',
        contentType: 'text/csv',
      })
      .expect(201);
    const taskAttachmentId = taskUpload.body.id as string;
    expect(taskUpload.body).toMatchObject({
      projectId: projectA.id,
      taskId: taskA,
    });

    await outsiderClient.get(`/api/tasks/${taskA}/attachments`).expect(403);
    await outsiderClient
      .get(
        `/api/tasks/${taskA}/attachments/${taskUpload.body.id as string}/download`,
      )
      .expect(403);
    await memberClient
      .get(
        `/api/projects/${projectA.id}/attachments/${taskUpload.body.id as string}/download`,
      )
      .expect(404);
    await memberClient
      .get(
        `/api/tasks/${randomUUID()}/attachments/${taskUpload.body.id as string}/download`,
      )
      .expect(404);

    const beforeRows = await prisma.file.count({
      where: { projectId: projectA.id },
    });
    const beforeObjects = (await readdir(storageRoot)).length;
    await memberClient
      .post(`/api/projects/${projectA.id}/attachments`)
      .attach('file', Buffer.from('MZ'), {
        filename: 'malware.exe',
        contentType: 'application/octet-stream',
      })
      .expect(400);
    await memberClient
      .post(`/api/projects/${projectA.id}/attachments`)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1, 65), {
        filename: 'huge.txt',
        contentType: 'text/plain',
      })
      .expect(413);
    expect(await prisma.file.count({ where: { projectId: projectA.id } })).toBe(
      beforeRows,
    );
    expect((await readdir(storageRoot)).length).toBe(beforeObjects);

    const taskStorageKey = (
      await prisma.file.findUniqueOrThrow({
        where: { id: taskAttachmentId },
        select: { storageKey: true },
      })
    ).storageKey;
    await ownerClient.delete(`/api/tasks/${taskA}`).expect(204);
    expect(
      await prisma.file.findUniqueOrThrow({ where: { id: taskAttachmentId } }),
    ).toMatchObject({ projectId: projectA.id, taskId: null });
    expect(await storage.exists(taskStorageKey)).toBe(true);
  });

  it('applies uploader/Project-owner deletion and keeps Activity compact', async () => {
    const ordinaryTarget = await ownerClient
      .post(`/api/projects/${projectA.id}/attachments`)
      .attach('file', Buffer.from('owner file'), {
        filename: 'owner.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    await memberClient
      .delete(
        `/api/projects/${projectA.id}/attachments/${ordinaryTarget.body.id as string}`,
      )
      .expect(403);
    await projectOwnerClient
      .delete(
        `/api/projects/${projectA.id}/attachments/${ordinaryTarget.body.id as string}`,
      )
      .expect(204);
    expect(
      await prisma.file.findUnique({
        where: { id: ordinaryTarget.body.id as string },
      }),
    ).toBeNull();

    const own = await memberClient
      .post(`/api/projects/${projectA.id}/attachments`)
      .attach('file', Buffer.from('member file'), {
        filename: 'member.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    const key = (
      await prisma.file.findUniqueOrThrow({
        where: { id: own.body.id as string },
      })
    ).storageKey;
    await memberClient
      .delete(
        `/api/projects/${projectA.id}/attachments/${own.body.id as string}`,
      )
      .expect(204);
    expect(await storage.exists(key)).toBe(false);
    const records = await prisma.activity.findMany({
      where: {
        projectId: projectA.id,
        type: {
          in: [
            ActivityEvent.ATTACHMENT_UPLOADED,
            ActivityEvent.ATTACHMENT_DELETED,
          ],
        },
      },
    });
    expect(records.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(records)).not.toContain('member file');
    expect(JSON.stringify(records)).not.toContain(key);
  });

  it('compensates stored objects when the database/Activity transaction fails', async () => {
    const beforeRows = await prisma.file.count({
      where: { projectId: projectA.id },
    });
    const beforeObjects = (await readdir(storageRoot)).length;
    jest
      .spyOn(activities, 'record')
      .mockRejectedValueOnce(new Error('forced rollback'));
    const publish = jest.spyOn(realtime, 'publish');
    await ownerClient
      .post(`/api/projects/${projectA.id}/attachments`)
      .attach('file', Buffer.from('rollback'), {
        filename: 'rollback.txt',
        contentType: 'text/plain',
      })
      .expect(500);
    expect(await prisma.file.count({ where: { projectId: projectA.id } })).toBe(
      beforeRows,
    );
    expect((await readdir(storageRoot)).length).toBe(beforeObjects);
    expect(publish).not.toHaveBeenCalled();
    publish.mockRestore();
  });

  it('publishes compact Project-scoped realtime events only to authorized subscribers', async () => {
    const memberSocket = await connectSocket(memberCookie);
    const outsiderSocket = await connectSocket(outsiderCookie);
    expect(await subscribe(memberSocket, projectA.id)).toMatchObject({
      ok: true,
    });
    expect(await subscribe(outsiderSocket, projectA.id)).toMatchObject({
      ok: false,
      error: 'FORBIDDEN',
    });

    const eventPromise = waitForProjectEvent(
      memberSocket,
      'ATTACHMENT_CREATED',
    );
    const response = await ownerClient
      .post(`/api/projects/${projectA.id}/attachments`)
      .attach('file', Buffer.from('realtime'), {
        filename: 'realtime.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    await expect(eventPromise).resolves.toMatchObject({
      projectId: projectA.id,
      entity: 'attachment',
      entityId: response.body.id as string,
    });
  });

  async function connectSocket(cookie: string): Promise<Socket> {
    const socket = io(`${baseUrl}/realtime`, {
      transports: ['websocket'],
      extraHeaders: { Origin: environment.frontendUrl, Cookie: cookie },
      forceNew: true,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }
});

function readCookie(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw.map((entry) => entry.split(';')[0]).join('; ');
}

function subscribe(
  socket: Socket,
  projectId: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) =>
    socket.emit('project:subscribe', { projectId }, resolve),
  );
}

function waitForProjectEvent(
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
