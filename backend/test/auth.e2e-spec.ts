import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableCors({
      origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
      credentials: true,
    });
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('signs up, reads and protects a session, signs out, and signs in again', async () => {
    const frontendOrigin = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const email = `auth-e2e-${Date.now()}@example.test`;
    const password = 'AuthE2ePassword123!';
    const client = request.agent(app.getHttpServer());

    try {
      await client.get('/api/projects').expect(401);

      const signUp = await client
        .post('/api/auth/sign-up/email')
        .set('Origin', frontendOrigin)
        .send({ name: 'Auth E2E User', email, password })
        .expect(200)
        .expect('access-control-allow-origin', frontendOrigin);

      const rawSetCookies = signUp.headers['set-cookie'] as
        string | string[] | undefined;
      const setCookies = Array.isArray(rawSetCookies)
        ? rawSetCookies
        : rawSetCookies
          ? [rawSetCookies]
          : [];
      expect(setCookies.length).toBeGreaterThan(0);
      const sessionCookie = setCookies.find((cookie) =>
        cookie.startsWith('better-auth.session_token='),
      );
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toMatch(/HttpOnly/i);
      expect(sessionCookie).toMatch(/SameSite=Lax/i);
      expect(sessionCookie).toMatch(/Path=\//i);

      const user = await prisma.user.findUnique({ where: { email } });
      expect(user).toMatchObject({
        email,
        emailVerified: false,
        role: 'member',
      });
      expect(await prisma.account.count({ where: { userId: user?.id } })).toBe(
        1,
      );
      expect(await prisma.session.count({ where: { userId: user?.id } })).toBe(
        1,
      );

      const signedUpSession = await client
        .get('/api/auth/get-session')
        .set('Origin', frontendOrigin)
        .expect(200);
      const signedUpSessionBody = signedUpSession.body as {
        user: { email: string };
      };
      expect(signedUpSessionBody.user).toMatchObject({ email });

      await client.get('/api/projects').expect(200);

      await client
        .post('/api/auth/sign-out')
        .set('Origin', frontendOrigin)
        .expect(200);
      expect(await prisma.session.count({ where: { userId: user?.id } })).toBe(
        0,
      );

      const signedOutSession = await client
        .get('/api/auth/get-session')
        .set('Origin', frontendOrigin)
        .expect(200);
      expect(signedOutSession.body as unknown).toBeNull();
      await client.get('/api/projects').expect(401);

      await client
        .post('/api/auth/sign-in/email')
        .set('Origin', frontendOrigin)
        .send({ email, password })
        .expect(200);

      const signedInSession = await client
        .get('/api/auth/get-session')
        .set('Origin', frontendOrigin)
        .expect(200);
      const signedInSessionBody = signedInSession.body as {
        user: { email: string };
      };
      expect(signedInSessionBody.user).toMatchObject({ email });
      await client.get('/api/projects').expect(200);

      await client
        .post('/api/auth/sign-out')
        .set('Origin', frontendOrigin)
        .expect(200);
      await client.get('/api/projects').expect(401);
    } finally {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        await prisma.session.deleteMany({ where: { userId: user.id } });
        await prisma.account.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    }
  }, 30_000);
});
