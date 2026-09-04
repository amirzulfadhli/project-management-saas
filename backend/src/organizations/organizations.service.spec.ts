/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ConflictException } from '@nestjs/common';
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
