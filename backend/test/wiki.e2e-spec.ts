/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server as HttpServer } from 'node:http';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ActivityEvent } from '../src/activities/activity.types';
import { environment } from '../src/config/environment';
import { PrismaService } from '../src/prisma/prisma.service';
import { RealtimeEventEnvelope } from '../src/realtime/realtime.types';
import { WIKI_CONTENT_MAX_LENGTH } from '../src/wiki/dto/wiki.dto';

describe('Project Wiki core (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let member: ReturnType<typeof request.agent>;
  let secondMember: ReturnType<typeof request.agent>;
  let outsider: ReturnType<typeof request.agent>;
  let memberCookie = '';
  let outsiderCookie = '';
  let ownerId = '';
  let memberId = '';
  let secondMemberId = '';
  let outsiderId = '';
  let projectA = '';
  let projectB = '';
  let organizationA = '';
  let organizationB = '';
  let baseUrl = '';
  const sockets: Socket[] = [];
  const runId = Date.now().toString(36);
  const password = 'WikiE2ePassword123!';

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
    secondMember = request.agent(server);
    outsider = request.agent(server);
    const accounts = [
      ['Owner', `wiki-owner-${runId}@test.dev`, owner],
      ['Member', `wiki-member-${runId}@test.dev`, member],
      ['Second Member', `wiki-second-${runId}@test.dev`, secondMember],
      ['Outsider', `wiki-outsider-${runId}@test.dev`, outsider],
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
    outsiderCookie = cookies[3]!;
    const users = await prisma.user.findMany({
      where: { email: { in: accounts.map(([, email]) => email) } },
      select: { id: true, email: true },
    });
    const idFor = (email: string) =>
      users.find((user) => user.email === email)!.id;
    ownerId = idFor(accounts[0][1]);
    memberId = idFor(accounts[1][1]);
    secondMemberId = idFor(accounts[2][1]);
    outsiderId = idFor(accounts[3][1]);

    const orgA = await owner
      .post('/api/organizations')
      .send({ name: 'Wiki A', slug: `wiki-a-${runId}` })
      .expect(201);
    organizationA = orgA.body.id as string;
    projectA = (
      await owner
        .post('/api/projects')
        .send({ name: 'Wiki Project A', organizationId: organizationA })
        .expect(201)
    ).body.id as string;
    await prisma.organizationMember.createMany({
      data: [
        { organizationId: organizationA, userId: memberId },
        { organizationId: organizationA, userId: secondMemberId },
      ],
    });

    const orgB = await outsider
      .post('/api/organizations')
      .send({ name: 'Wiki B', slug: `wiki-b-${runId}` })
      .expect(201);
    organizationB = orgB.body.id as string;
    projectB = (
      await outsider
        .post('/api/projects')
        .send({ name: 'Wiki Project B', organizationId: organizationB })
        .expect(201)
    ).body.id as string;
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    const projectIds = [projectA, projectB].filter(Boolean);
    const organizationIds = [organizationA, organizationB].filter(Boolean);
    const userIds = [ownerId, memberId, secondMemberId, outsiderId].filter(
      Boolean,
    );
    await prisma.wikiPage.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await prisma.notification.deleteMany({
      where: { projectId: { in: projectIds } },
    });
    await prisma.activity.deleteMany({
      where: { projectId: { in: projectIds } },
    });
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

  it('enforces authentication/Project isolation and supports create/list/read/update', async () => {
    await request(app.getHttpServer())
      .get(`/api/projects/${projectA}/wiki`)
      .expect(401);
    await outsider.get(`/api/projects/${projectA}/wiki`).expect(403);
    const created = await member
      .post(`/api/projects/${projectA}/wiki`)
      .send({
        title: '  Architecture  ',
        content: '# Safe\n<script>alert(1)</script>',
      })
      .expect(201);
    expect(created.body).toMatchObject({
      projectId: projectA,
      title: 'Architecture',
      content: '# Safe\n<script>alert(1)</script>',
      position: 0,
      createdById: memberId,
    });
    const pageId = created.body.id as string;
    await outsider.get(`/api/projects/${projectA}/wiki/${pageId}`).expect(403);
    await member.get(`/api/projects/${projectB}/wiki/${pageId}`).expect(403);
    const listed = await member
      .get(`/api/projects/${projectA}/wiki`)
      .expect(200);
    expect(listed.body[0]).not.toHaveProperty('content');
    expect(listed.body[0]).toMatchObject({ id: pageId, title: 'Architecture' });
    await member
      .patch(`/api/projects/${projectA}/wiki/${pageId}`)
      .send({ content: '# Updated' })
      .expect(200)
      .expect(({ body }) => expect(body.content).toBe('# Updated'));
  });

  it('builds bounded same-Project hierarchy and rejects cross-parent/self/cycles', async () => {
    const root = await createPage(member, 'Root');
    const child = await createPage(member, 'Child', root.id);
    await member
      .post(`/api/projects/${projectA}/wiki`)
      .send({ title: 'Cross', parentId: await createForeignPage() })
      .expect(404);
    await member
      .patch(`/api/projects/${projectA}/wiki/${root.id}/move`)
      .send({ parentId: root.id, targetIndex: 0 })
      .expect(400);
    await member
      .patch(`/api/projects/${projectA}/wiki/${root.id}/move`)
      .send({ parentId: child.id, targetIndex: 0 })
      .expect(400);

    let parentId = child.id;
    for (const title of ['Depth 3', 'Depth 4', 'Depth 5'])
      parentId = (await createPage(member, title, parentId)).id;
    await member
      .post(`/api/projects/${projectA}/wiki`)
      .send({ title: 'Too deep', parentId })
      .expect(400);
    await member
      .delete(`/api/projects/${projectA}/wiki/${root.id}`)
      .expect(409);
  });

  it('keeps deterministic sibling positions and applies creator/owner deletion policy', async () => {
    const first = await createPage(member, 'First');
    const second = await createPage(member, 'Second');
    const third = await createPage(member, 'Third');
    await Promise.all([
      createPage(member, 'Concurrent member append'),
      createPage(owner, 'Concurrent owner append'),
    ]);
    await member
      .patch(`/api/projects/${projectA}/wiki/${third.id}/move`)
      .send({ parentId: null, targetIndex: 0 })
      .expect(200);
    const pages = (
      await member.get(`/api/projects/${projectA}/wiki`).expect(200)
    ).body as Array<{ id: string; parentId: string | null; position: number }>;
    const roots = pages
      .filter((page) => page.parentId === null)
      .sort((a, b) => a.position - b.position);
    expect(roots.findIndex((page) => page.id === third.id)).toBeLessThan(
      roots.findIndex((page) => page.id === first.id),
    );
    expect(new Set(roots.map((page) => page.position)).size).toBe(roots.length);
    await secondMember
      .delete(`/api/projects/${projectA}/wiki/${second.id}`)
      .expect(403);
    await owner
      .delete(`/api/projects/${projectA}/wiki/${second.id}`)
      .expect(204);
  });

  it('validates content strictly and records compact Activity only for successful changes', async () => {
    await member
      .post(`/api/projects/${projectA}/wiki`)
      .send({ title: 'Unknown', extra: true })
      .expect(400);
    await member
      .post(`/api/projects/${projectA}/wiki`)
      .send({
        title: 'Large',
        content: 'x'.repeat(WIKI_CONTENT_MAX_LENGTH + 1),
      })
      .expect(400);
    const page = await createPage(
      member,
      'Activity',
      null,
      'secret markdown body',
    );
    const before = await prisma.activity.count({
      where: { projectId: projectA, type: ActivityEvent.WIKI_PAGE_UPDATED },
    });
    await member
      .patch(`/api/projects/${projectA}/wiki/${page.id}`)
      .send({ title: 'Activity', content: 'secret markdown body' })
      .expect(200);
    expect(
      await prisma.activity.count({
        where: { projectId: projectA, type: ActivityEvent.WIKI_PAGE_UPDATED },
      }),
    ).toBe(before);
    await member
      .patch(`/api/projects/${projectA}/wiki/${page.id}`)
      .send({ title: 'Activity updated' })
      .expect(200);
    const activity = await prisma.activity.findFirstOrThrow({
      where: { projectId: projectA, type: ActivityEvent.WIKI_PAGE_UPDATED },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(activity.metadata)).not.toContain(
      'secret markdown body',
    );
  });

  it('publishes only committed Wiki events to the subscribed Project room', async () => {
    const projectSocket = await connect(memberCookie);
    const otherSocket = await connect(outsiderCookie);
    await subscribe(projectSocket, projectA);
    await subscribe(otherSocket, projectB);
    const received = nextEvent(projectSocket, 'WIKI_PAGE_CREATED');
    const unrelated = noEvent(otherSocket, projectA);
    const page = await createPage(member, 'Realtime');
    expect((await received).entityId).toBe(page.id);
    await unrelated;

    const before = await prisma.activity.count({
      where: { projectId: projectA },
    });
    const silent = noEvent(projectSocket, projectA);
    await member
      .post(`/api/projects/${projectA}/wiki`)
      .send({ title: 'Broken', parentId: page.id, unexpected: true })
      .expect(400);
    await silent;
    expect(
      await prisma.activity.count({ where: { projectId: projectA } }),
    ).toBe(before);
  });

  async function createPage(
    agent: ReturnType<typeof request.agent>,
    title: string,
    parentId: string | null = null,
    content = '',
  ) {
    return (
      await agent
        .post(`/api/projects/${projectA}/wiki`)
        .send({ title, parentId, content })
        .expect(201)
    ).body as { id: string };
  }

  async function createForeignPage(): Promise<string> {
    return (
      await outsider
        .post(`/api/projects/${projectB}/wiki`)
        .send({ title: 'Foreign' })
        .expect(201)
    ).body.id as string;
  }

  async function connect(cookie: string): Promise<Socket> {
    const socket = io(`${baseUrl}/realtime`, {
      autoConnect: false,
      withCredentials: true,
      extraHeaders: { cookie, origin: environment.frontendUrl },
    });
    sockets.push(socket);
    socket.connect();
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }
});

function readCookie(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value : [value ?? ''])
    .map((entry) => entry.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

function subscribe(socket: Socket, projectId: string): Promise<void> {
  return new Promise((resolve, reject) =>
    socket.emit(
      'project:subscribe',
      { projectId },
      (result: { ok: boolean }) =>
        result.ok ? resolve() : reject(new Error('Subscription rejected')),
    ),
  );
}

function nextEvent(
  socket: Socket,
  type: string,
): Promise<RealtimeEventEnvelope> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Missing ${type}`)), 1500);
    socket.on('project:event', function handler(event: RealtimeEventEnvelope) {
      if (event.type !== type) return;
      clearTimeout(timer);
      socket.off('project:event', handler);
      resolve(event);
    });
  });
}

function noEvent(socket: Socket, projectId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = (event: RealtimeEventEnvelope) => {
      if (event.projectId === projectId)
        reject(new Error('Cross-Project event leaked'));
    };
    socket.on('project:event', handler);
    setTimeout(() => {
      socket.off('project:event', handler);
      resolve();
    }, 250);
  });
}
