import { ConflictException } from '@nestjs/common';
import { Prisma, ProjectRole } from '../../generated/prisma/client';
import type { AccessService } from '../access/access.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ProjectMembersService } from './project-members.service';
import type { ActivitiesService } from '../activities/activities.service';

describe('ProjectMembersService', () => {
  const projectId = '10000000-0000-4000-8000-000000000001';
  const memberId = '20000000-0000-4000-8000-000000000001';
  const actorId = 'actor';
  const targetUserId = 'target';

  let transaction: {
    $queryRaw: jest.Mock<Promise<Array<{ id: string }>>, [Prisma.Sql]>;
    project: { findUnique: jest.Mock };
    projectMember: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
  };
  let prisma: PrismaService;
  let access: {
    assertProjectAccess: jest.Mock;
    assertProjectMembershipAdmin: jest.Mock;
    assertProspectiveProjectMember: jest.Mock;
  };
  let service: ProjectMembersService;

  beforeEach(() => {
    transaction = {
      $queryRaw: jest
        .fn<Promise<Array<{ id: string }>>, [Prisma.Sql]>()
        .mockResolvedValue([{ id: projectId }]),
      project: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ organizationId: 'organization-1' }),
      },
      projectMember: {
        create: jest.fn().mockResolvedValue({
          id: memberId,
          projectId,
          userId: targetUserId,
          role: ProjectRole.MEMBER,
          user: { name: 'Target' },
        }),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: memberId,
          projectId,
          userId: targetUserId,
          role: ProjectRole.MEMBER,
          user: { name: 'Target' },
        }),
        update: jest.fn().mockResolvedValue({
          id: memberId,
          projectId,
          userId: targetUserId,
          role: ProjectRole.OWNER,
          user: { name: 'Target' },
        }),
        delete: jest.fn().mockResolvedValue({ id: memberId }),
        count: jest.fn(),
      },
    };

    prisma = {
      $transaction: jest.fn(
        async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          operation(transaction as unknown as Prisma.TransactionClient),
      ),
      projectMember: { findMany: jest.fn() },
    } as unknown as PrismaService;
    access = {
      assertProjectAccess: jest.fn(),
      assertProjectMembershipAdmin: jest.fn(),
      assertProspectiveProjectMember: jest.fn(),
    };
    service = new ProjectMembersService(
      prisma,
      access as unknown as AccessService,
      { record: jest.fn() } as unknown as ActivitiesService,
    );
  });

  it('adds an eligible Organization member after locking and authorizing in the transaction', async () => {
    await service.add(actorId, projectId, {
      userId: targetUserId,
      role: ProjectRole.MEMBER,
    });

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(access.assertProjectMembershipAdmin).toHaveBeenCalledWith(
      actorId,
      projectId,
      transaction,
    );
    expect(access.assertProspectiveProjectMember).toHaveBeenCalledWith(
      targetUserId,
      'organization-1',
      transaction,
    );
    expect(transaction.projectMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { projectId, userId: targetUserId, role: ProjectRole.MEMBER },
      }),
    );
  });

  it('maps a concurrent duplicate membership to ConflictException', async () => {
    transaction.projectMember.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.add(actorId, projectId, {
        userId: targetUserId,
        role: ProjectRole.MEMBER,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('treats a same-role update as idempotent', async () => {
    transaction.projectMember.findFirst.mockResolvedValue({
      id: memberId,
      userId: targetUserId,
      role: ProjectRole.MEMBER,
    });

    await service.updateRole(actorId, projectId, memberId, {
      role: ProjectRole.MEMBER,
    });

    expect(transaction.projectMember.findUniqueOrThrow).toHaveBeenCalled();
    expect(transaction.projectMember.count).not.toHaveBeenCalled();
    expect(transaction.projectMember.update).not.toHaveBeenCalled();
  });

  it('prevents demotion of the final Project OWNER', async () => {
    transaction.projectMember.findFirst.mockResolvedValue({
      id: memberId,
      userId: targetUserId,
      role: ProjectRole.OWNER,
      user: { name: 'Target' },
    });
    transaction.projectMember.count.mockResolvedValue(1);

    await expect(
      service.updateRole(actorId, projectId, memberId, {
        role: ProjectRole.MEMBER,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.projectMember.update).not.toHaveBeenCalled();
  });

  it('allows a MEMBER to remove their own explicit membership', async () => {
    transaction.projectMember.findFirst.mockResolvedValue({
      id: memberId,
      userId: actorId,
      role: ProjectRole.MEMBER,
      user: { name: 'Actor' },
    });

    await service.remove(actorId, projectId, memberId);

    expect(access.assertProjectMembershipAdmin).not.toHaveBeenCalled();
    expect(transaction.projectMember.delete).toHaveBeenCalledWith({
      where: { id: memberId },
    });
  });

  it('requires administration permission when removing another member', async () => {
    transaction.projectMember.findFirst.mockResolvedValue({
      id: memberId,
      userId: targetUserId,
      role: ProjectRole.MEMBER,
      user: { name: 'Target' },
    });

    await service.remove(actorId, projectId, memberId);

    expect(access.assertProjectMembershipAdmin).toHaveBeenCalledWith(
      actorId,
      projectId,
      transaction,
    );
  });
});
