import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AccessDatabaseClient = PrismaService | Prisma.TransactionClient;

/**
 * Centralizes organization/project access checks used across the domain
 * modules. A user may act on a project if they are the owning organization's
 * owner/member, or an explicit project member.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertOrganizationMember(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { members: { where: { userId } } },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (organization.ownerId !== userId && organization.members.length === 0) {
      throw new ForbiddenException(
        'You do not have access to this organization',
      );
    }
  }

  async assertProjectAccess(
    userId: string,
    projectId: string,
    database: AccessDatabaseClient = this.prisma,
  ): Promise<void> {
    const project = await database.project.findUnique({
      where: { id: projectId },
      include: {
        organization: { include: { members: { where: { userId } } } },
        projectMembers: { where: { userId } },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const hasOrgAccess =
      project.organization.ownerId === userId ||
      project.organization.members.length > 0;
    const isProjectMember = project.projectMembers.length > 0;

    if (!hasOrgAccess && !isProjectMember) {
      throw new ForbiddenException('You do not have access to this project');
    }
  }

  /**
   * Membership administration is intentionally narrower than normal Project
   * access: only the owning Organization's owner or an explicit Project OWNER
   * may administer the roster.
   *
   * A transaction client may be supplied so a future membership mutation can
   * keep this authorization check inside its active Prisma transaction.
   */
  async assertProjectMembershipAdmin(
    userId: string,
    projectId: string,
    database: AccessDatabaseClient = this.prisma,
  ): Promise<void> {
    const project = await database.project.findUnique({
      where: { id: projectId },
      select: {
        organization: { select: { ownerId: true } },
        projectMembers: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const isOrganizationOwner = project.organization.ownerId === userId;
    const isProjectOwner = project.projectMembers.some(
      (member) => member.role === ProjectRole.OWNER,
    );

    if (!isOrganizationOwner && !isProjectOwner) {
      throw new ForbiddenException(
        'You cannot administer this project membership',
      );
    }
  }

  /** Ensures a prospective Project member already belongs to the Organization. */
  async assertProspectiveProjectMember(
    userId: string,
    organizationId: string,
    database: AccessDatabaseClient = this.prisma,
  ): Promise<void> {
    const user = await database.user.findUnique({
      where: { id: userId },
      select: {
        ownedOrganizations: {
          where: { id: organizationId },
          select: { id: true },
        },
        organizationMembers: {
          where: { organizationId },
          select: { id: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (
      user.ownedOrganizations.length === 0 &&
      user.organizationMembers.length === 0
    ) {
      throw new BadRequestException(
        'User must belong to the project organization',
      );
    }
  }

  async assertColumnInProject(
    columnId: string,
    projectId: string,
    database: AccessDatabaseClient = this.prisma,
  ): Promise<void> {
    const column = await database.column.findUnique({
      where: { id: columnId },
      select: {
        projectId: true,
        board: { select: { projectId: true } },
      },
    });

    if (!column) {
      throw new NotFoundException('Column not found');
    }

    if (
      column.projectId !== projectId ||
      column.board?.projectId !== projectId
    ) {
      throw new BadRequestException('Column does not belong to this project');
    }
  }
}
