/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AccessService } from '../access/access.service';
import { OrganizationRole } from '../../generated/prisma/client';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: {
    organization: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let access: { assertOrganizationMember: jest.Mock };

  beforeEach(() => {
    prisma = {
      organization: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    access = { assertOrganizationMember: jest.fn() };
    service = new OrganizationsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessService,
    );
  });

  it('creates an organization with a slugified slug and owner membership', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    prisma.organization.create.mockResolvedValue({
      id: 'o1',
      name: 'Acme Inc',
      slug: 'acme-inc',
    });

    const result = await service.create('u1', { name: 'Acme Inc' });

    expect(prisma.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'acme-inc',
          ownerId: 'u1',
          members: {
            create: { userId: 'u1', role: OrganizationRole.OWNER },
          },
        }),
      }),
    );
    expect(result.slug).toBe('acme-inc');
  });

  it('throws ConflictException when an explicit slug is already taken', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.create('u1', { name: 'Acme', slug: 'acme' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  it('deduplicates an auto-generated slug by appending a suffix', async () => {
    prisma.organization.findUnique
      .mockResolvedValueOnce({ id: 'existing' }) // base slug taken
      .mockResolvedValueOnce(null); // suffixed slug free
    prisma.organization.create.mockResolvedValue({ id: 'o1', slug: 'acme-1' });

    await service.create('u1', { name: 'Acme' });

    expect(prisma.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'acme-1' }),
      }),
    );
  });

  it('maps a database slug race to ConflictException', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    prisma.organization.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create('u1', { name: 'Acme', slug: 'acme' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('OrganizationsService membership administration', () => {
  const organizationId = '11111111-1111-4111-8111-111111111111';
  const memberId = '22222222-2222-4222-8222-222222222222';

  function setup(txOverrides: Record<string, unknown> = {}) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: organizationId }]),
      user: { findUnique: jest.fn() },
      organization: { updateMany: jest.fn() },
      organizationMember: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      ...txOverrides,
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (database: typeof tx) => Promise<unknown>) => operation(tx),
      ),
      organizationMember: { findMany: jest.fn() },
    };
    const access = {
      assertOrganizationMember: jest.fn(),
      assertOrganizationOwner: jest.fn(),
    };
    const service = new OrganizationsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessService,
    );
    return { service, prisma, access, tx };
  }

  it('lists a scoped compact roster after an Organization access check', async () => {
    const { service, prisma, access } = setup();
    prisma.organizationMember.findMany.mockResolvedValue([{ id: memberId }]);

    await expect(
      service.findMembers('user-1', organizationId),
    ).resolves.toEqual([{ id: memberId }]);
    expect(access.assertOrganizationMember).toHaveBeenCalledWith(
      'user-1',
      organizationId,
    );
  });

  it('adds an existing user as MEMBER inside the locked transaction', async () => {
    const { service, access, tx } = setup();
    tx.user.findUnique.mockResolvedValue({ id: 'target-1' });
    tx.organizationMember.create.mockResolvedValue({
      id: memberId,
      role: OrganizationRole.MEMBER,
    });

    await expect(
      service.addMember('owner-1', organizationId, {
        email: 'target@example.test',
      }),
    ).resolves.toMatchObject({ id: memberId, role: OrganizationRole.MEMBER });
    expect(access.assertOrganizationOwner).toHaveBeenCalled();
    expect(tx.organizationMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organizationId,
          userId: 'target-1',
          role: OrganizationRole.MEMBER,
        },
      }),
    );
  });

  it('rejects missing and duplicate add targets cleanly', async () => {
    const missing = setup();
    missing.tx.user.findUnique.mockResolvedValue(null);
    await expect(
      missing.service.addMember('owner-1', organizationId, {
        email: 'missing@example.test',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const duplicate = setup();
    duplicate.tx.user.findUnique.mockResolvedValue({ id: 'target-1' });
    duplicate.tx.organizationMember.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      duplicate.service.addMember('owner-1', organizationId, {
        email: 'target@example.test',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns a same-role request without writing', async () => {
    const { service, tx } = setup();
    tx.organizationMember.findFirst.mockResolvedValue({
      id: memberId,
      userId: 'member-1',
      role: OrganizationRole.MEMBER,
    });
    tx.organizationMember.findUniqueOrThrow.mockResolvedValue({
      id: memberId,
      role: OrganizationRole.MEMBER,
    });

    await service.updateMemberRole('owner-1', organizationId, memberId, {
      role: OrganizationRole.MEMBER,
    });
    expect(tx.organizationMember.update).not.toHaveBeenCalled();
  });

  it('protects the final OWNER from demotion', async () => {
    const { service, tx } = setup();
    tx.organizationMember.findFirst
      .mockResolvedValueOnce({
        id: memberId,
        userId: 'owner-1',
        role: OrganizationRole.OWNER,
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.updateMemberRole('owner-1', organizationId, memberId, {
        role: OrganizationRole.MEMBER,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.organizationMember.update).not.toHaveBeenCalled();
  });

  it('reassigns the primary owner and returns affected Projects on removal', async () => {
    const { service, tx } = setup();
    tx.organizationMember.findFirst
      .mockResolvedValueOnce({
        id: memberId,
        userId: 'owner-1',
        role: OrganizationRole.OWNER,
      })
      .mockResolvedValueOnce({ userId: 'owner-2' });
    tx.project.findMany.mockResolvedValue([{ id: 'project-1' }]);

    await expect(
      service.removeMember('owner-1', organizationId, memberId),
    ).resolves.toEqual(['project-1']);
    expect(tx.organization.updateMany).toHaveBeenCalledWith({
      where: { id: organizationId, ownerId: 'owner-1' },
      data: { ownerId: 'owner-2' },
    });
    expect(tx.organizationMember.delete).toHaveBeenCalledWith({
      where: { id: memberId },
    });
  });
});
