import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole } from '../../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';

interface ProjectAdminRecord {
  organization: { ownerId: string };
  projectMembers: Array<{ role: ProjectRole }>;
}

describe('AccessService.assertProjectMembershipAdmin', () => {
  let service: AccessService;
  let projectFindUnique: jest.Mock<
    Promise<ProjectAdminRecord | null>,
    [Prisma.ProjectFindUniqueArgs]
  >;

  beforeEach(() => {
    projectFindUnique = jest.fn<
      Promise<ProjectAdminRecord | null>,
      [Prisma.ProjectFindUniqueArgs]
    >();
    service = new AccessService({
      project: { findUnique: projectFindUnique },
    } as unknown as PrismaService);
  });

  it('allows the Organization owner', async () => {
    projectFindUnique.mockResolvedValue({
      organization: { ownerId: 'organization-owner' },
      projectMembers: [],
    });

    await expect(
      service.assertProjectMembershipAdmin('organization-owner', 'project-1'),
    ).resolves.toBeUndefined();
  });

  it('allows a Project OWNER using an active transaction client', async () => {
    const transactionFindUnique = jest.fn<
      Promise<ProjectAdminRecord | null>,
      [Prisma.ProjectFindUniqueArgs]
    >();
    transactionFindUnique.mockResolvedValue({
      organization: { ownerId: 'organization-owner' },
      projectMembers: [{ role: ProjectRole.OWNER }],
    });
    const transaction = {
      project: { findUnique: transactionFindUnique },
    } as unknown as Prisma.TransactionClient;

    await expect(
      service.assertProjectMembershipAdmin(
        'project-owner',
        'project-1',
        transaction,
      ),
    ).resolves.toBeUndefined();
    expect(transactionFindUnique).toHaveBeenCalledTimes(1);
    expect(projectFindUnique).not.toHaveBeenCalled();
  });

  it('denies an ordinary Organization MEMBER', async () => {
    projectFindUnique.mockResolvedValue({
      organization: { ownerId: 'organization-owner' },
      projectMembers: [],
    });

    await expect(
      service.assertProjectMembershipAdmin('organization-member', 'project-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a Project MEMBER', async () => {
    projectFindUnique.mockResolvedValue({
      organization: { ownerId: 'organization-owner' },
      projectMembers: [{ role: ProjectRole.MEMBER }],
    });

    await expect(
      service.assertProjectMembershipAdmin('project-member', 'project-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies an outsider', async () => {
    projectFindUnique.mockResolvedValue({
      organization: { ownerId: 'organization-owner' },
      projectMembers: [],
    });

    await expect(
      service.assertProjectMembershipAdmin('outsider', 'project-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AccessService.assertProspectiveProjectMember', () => {
  interface ProspectiveMemberRecord {
    ownedOrganizations: Array<{ id: string }>;
    organizationMembers: Array<{ id: string }>;
  }

  let service: AccessService;
  let userFindUnique: jest.Mock<
    Promise<ProspectiveMemberRecord | null>,
    [Prisma.UserFindUniqueArgs]
  >;

  beforeEach(() => {
    userFindUnique = jest.fn<
      Promise<ProspectiveMemberRecord | null>,
      [Prisma.UserFindUniqueArgs]
    >();
    service = new AccessService({
      user: { findUnique: userFindUnique },
    } as unknown as PrismaService);
  });

  it('allows the Organization owner', async () => {
    userFindUnique.mockResolvedValue({
      ownedOrganizations: [{ id: 'organization-1' }],
      organizationMembers: [],
    });

    await expect(
      service.assertProspectiveProjectMember('user-1', 'organization-1'),
    ).resolves.toBeUndefined();
  });

  it('allows an Organization member using an active transaction client', async () => {
    const transactionFindUnique = jest.fn<
      Promise<ProspectiveMemberRecord | null>,
      [Prisma.UserFindUniqueArgs]
    >();
    transactionFindUnique.mockResolvedValue({
      ownedOrganizations: [],
      organizationMembers: [{ id: 'organization-member-1' }],
    });
    const transaction = {
      user: { findUnique: transactionFindUnique },
    } as unknown as Prisma.TransactionClient;

    await expect(
      service.assertProspectiveProjectMember(
        'user-1',
        'organization-1',
        transaction,
      ),
    ).resolves.toBeUndefined();
    expect(transactionFindUnique).toHaveBeenCalledTimes(1);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it('reports a missing User as not found', async () => {
    userFindUnique.mockResolvedValue(null);

    await expect(
      service.assertProspectiveProjectMember('missing', 'organization-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an existing User outside the Organization', async () => {
    userFindUnique.mockResolvedValue({
      ownedOrganizations: [],
      organizationMembers: [],
    });

    await expect(
      service.assertProspectiveProjectMember('outsider', 'organization-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
