import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrganizationRole } from '../generated/prisma/client';

interface OrganizationResponse {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  members: Array<{
    userId: string;
    role: OrganizationRole;
  }>;
}

describe('Organization onboarding (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerClient: ReturnType<typeof request.agent>;
  let outsiderClient: ReturnType<typeof request.agent>;
  let ownerId: string;
  let outsiderId: string;

  const runId = Date.now().toString(36);
  const ownerEmail = `org-owner-${runId}@example.test`;
  const outsiderEmail = `org-outsider-${runId}@example.test`;
  const password = 'OrganizationE2ePassword123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    ownerClient = request.agent(app.getHttpServer());
    outsiderClient = request.agent(app.getHttpServer());

    await ownerClient
      .post('/api/auth/sign-up/email')
      .send({ name: 'Organization Owner', email: ownerEmail, password })
      .expect(200);
    await outsiderClient
      .post('/api/auth/sign-up/email')
      .send({ name: 'Organization Outsider', email: outsiderEmail, password })
      .expect(200);

    const users = await prisma.user.findMany({
      where: { email: { in: [ownerEmail, outsiderEmail] } },
      select: { id: true, email: true },
    });
    const owner = users.find((user) => user.email === ownerEmail);
    const outsider = users.find((user) => user.email === outsiderEmail);
    if (!owner || !outsider) {
      throw new Error('Organization e2e users were not created');
    }
    ownerId = owner.id;
    outsiderId = outsider.id;
  });

  afterEach(async () => {
    await clearTestOrganizations();
  });

  afterAll(async () => {
    await clearTestOrganizations();
    const userIds = [ownerId, outsiderId].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app.close();
  });

  async function clearTestOrganizations(): Promise<void> {
    if (!prisma || !ownerId || !outsiderId) return;

    const organizations = await prisma.organization.findMany({
      where: { ownerId: { in: [ownerId, outsiderId] } },
      select: { id: true },
    });
    const organizationIds = organizations.map(
      (organization) => organization.id,
    );
    if (organizationIds.length === 0) return;

    await prisma.organizationMember.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
  }

  it('creates an organization for the authenticated user', async () => {
    const response = await ownerClient
      .post('/api/organizations')
      .send({ name: 'Acme Workspace', slug: `acme-${runId}` })
      .expect(201);

    const organization = response.body as OrganizationResponse;
    expect(organization).toMatchObject({
      name: 'Acme Workspace',
      slug: `acme-${runId}`,
      ownerId,
    });
  });

  it('creates an OWNER membership for the creator', async () => {
    const response = await ownerClient
      .post('/api/organizations')
      .send({ name: 'Owner Workspace', slug: `owner-${runId}` })
      .expect(201);
    const organization = response.body as OrganizationResponse;

    expect(organization.members).toContainEqual(
      expect.objectContaining({
        userId: ownerId,
        role: OrganizationRole.OWNER,
      }),
    );
    await expect(
      prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: ownerId,
          },
        },
      }),
    ).resolves.toMatchObject({ role: OrganizationRole.OWNER });
  });

  it('lists only organizations belonging to the current user', async () => {
    await ownerClient
      .post('/api/organizations')
      .send({ name: 'Owner List', slug: `owner-list-${runId}` })
      .expect(201);
    await outsiderClient
      .post('/api/organizations')
      .send({ name: 'Outsider List', slug: `outsider-list-${runId}` })
      .expect(201);

    const response = await ownerClient.get('/api/organizations').expect(200);
    const organizations = response.body as OrganizationResponse[];

    expect(organizations.map((organization) => organization.slug)).toContain(
      `owner-list-${runId}`,
    );
    expect(
      organizations.map((organization) => organization.slug),
    ).not.toContain(`outsider-list-${runId}`);
  });

  it('retrieves a selected organization and rejects a non-member', async () => {
    const created = await ownerClient
      .post('/api/organizations')
      .send({ name: 'Private Workspace', slug: `private-${runId}` })
      .expect(201);
    const organization = created.body as OrganizationResponse;

    await ownerClient.get(`/api/organizations/${organization.id}`).expect(200);
    await outsiderClient
      .get(`/api/organizations/${organization.id}`)
      .expect(403);
  });

  it('rejects unauthenticated organization access', async () => {
    const unauthenticated = request(app.getHttpServer());

    await unauthenticated.get('/api/organizations').expect(401);
    await unauthenticated
      .post('/api/organizations')
      .send({ name: 'No Session', slug: `no-session-${runId}` })
      .expect(401);
  });

  it('rejects duplicate and invalid explicit slugs', async () => {
    const slug = `duplicate-${runId}`;
    await ownerClient
      .post('/api/organizations')
      .send({ name: 'First Workspace', slug })
      .expect(201);
    await ownerClient
      .post('/api/organizations')
      .send({ name: 'Duplicate Workspace', slug })
      .expect(409);
    await ownerClient
      .post('/api/organizations')
      .send({ name: 'Invalid Workspace', slug: 'Invalid--Slug' })
      .expect(400);
  });
});
