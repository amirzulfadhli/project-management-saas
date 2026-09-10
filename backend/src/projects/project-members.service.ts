import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddProjectMemberDto,
  UpdateProjectMemberRoleDto,
} from './dto/project-member.dto';
import { Prisma, ProjectRole } from '../../generated/prisma/client';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityEvent } from '../activities/activity.types';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotificationType,
  type NotificationDelivery,
} from '../notifications/notification.types';

const projectMemberSelect = {
  id: true,
  projectId: true,
  userId: true,
  role: true,
  user: {
    select: { id: true, name: true, email: true, image: true },
  },
} satisfies Prisma.ProjectMemberSelect;

@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(userId: string, projectId: string) {
    await this.access.assertProjectAccess(userId, projectId);

    return this.prisma.projectMember.findMany({
      where: { projectId },
      select: projectMemberSelect,
      orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }, { id: 'asc' }],
    });
  }

  async add(userId: string, projectId: string, dto: AddProjectMemberDto) {
    let notificationDeliveries: NotificationDelivery[] = [];
    const member = await this.withLockedProject(projectId, async (tx) => {
      await this.access.assertProjectMembershipAdmin(userId, projectId, tx);

      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { organizationId: true, name: true },
      });
      if (!project) {
        throw new NotFoundException('Project not found');
      }

      await this.access.assertProspectiveProjectMember(
        dto.userId,
        project.organizationId,
        tx,
      );

      try {
        const member = await tx.projectMember.create({
          data: {
            projectId,
            userId: dto.userId,
            role: dto.role,
          },
          select: projectMemberSelect,
        });
        await this.activities.record(tx, {
          type: ActivityEvent.PROJECT_MEMBER_ADDED,
          description: `Added ${member.user.name} to the Project`,
          projectId,
          userId,
          metadata: {
            memberId: member.id,
            targetUserId: member.userId,
            targetName: member.user.name,
            role: member.role,
          },
        });
        notificationDeliveries =
          await this.notifications.recordMembershipChange(tx, {
            actorId: userId,
            targetUserId: member.userId,
            projectId,
            projectName: project.name,
            memberId: member.id,
            role: member.role,
            type: NotificationType.PROJECT_MEMBER_ADDED_YOU,
          });
        return member;
      } catch (error: unknown) {
        if (this.isUniqueConstraintViolation(error)) {
          throw new ConflictException('User is already a project member');
        }
        throw error;
      }
    });
    await this.notifications.publishCreated(notificationDeliveries);
    return member;
  }

  async updateRole(
    userId: string,
    projectId: string,
    memberId: string,
    dto: UpdateProjectMemberRoleDto,
  ) {
    let notificationDeliveries: NotificationDelivery[] = [];
    const member = await this.withLockedProject(projectId, async (tx) => {
      await this.access.assertProjectMembershipAdmin(userId, projectId, tx);
      const member = await this.findMember(tx, projectId, memberId);

      if (member.role === dto.role) {
        return tx.projectMember.findUniqueOrThrow({
          where: { id: memberId },
          select: projectMemberSelect,
        });
      }

      if (member.role === ProjectRole.OWNER) {
        await this.assertAnotherOwnerExists(tx, projectId);
      }

      const updated = await tx.projectMember.update({
        where: { id: memberId },
        data: { role: dto.role },
        select: projectMemberSelect,
      });
      await this.activities.record(tx, {
        type: ActivityEvent.PROJECT_MEMBER_ROLE_CHANGED,
        description: `Changed ${updated.user.name}'s Project role`,
        projectId,
        userId,
        metadata: {
          memberId: updated.id,
          targetUserId: updated.userId,
          targetName: updated.user.name,
          before: member.role,
          after: updated.role,
        },
      });
      const project = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { name: true },
      });
      notificationDeliveries = await this.notifications.recordMembershipChange(
        tx,
        {
          actorId: userId,
          targetUserId: updated.userId,
          projectId,
          projectName: project.name,
          memberId: updated.id,
          role: updated.role,
          type: NotificationType.PROJECT_MEMBER_ROLE_CHANGED_YOU,
        },
      );
      return updated;
    });
    await this.notifications.publishCreated(notificationDeliveries);
    return member;
  }

  async remove(userId: string, projectId: string, memberId: string) {
    await this.withLockedProject(projectId, async (tx) => {
      const member = await this.findMember(tx, projectId, memberId);

      if (member.userId !== userId) {
        await this.access.assertProjectMembershipAdmin(userId, projectId, tx);
      }

      if (member.role === ProjectRole.OWNER) {
        await this.assertAnotherOwnerExists(tx, projectId);
      }

      await tx.projectMember.delete({ where: { id: memberId } });
      await this.activities.record(tx, {
        type: ActivityEvent.PROJECT_MEMBER_REMOVED,
        description: `Removed ${member.user.name} from the Project`,
        projectId,
        userId,
        metadata: {
          memberId: member.id,
          targetUserId: member.userId,
          targetName: member.user.name,
          role: member.role,
        },
      });
    });
  }

  private async withLockedProject<T>(
    projectId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const lockedProjects = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`,
      );

      if (lockedProjects.length === 0) {
        throw new NotFoundException('Project not found');
      }

      return operation(tx);
    });
  }

  private async findMember(
    tx: Prisma.TransactionClient,
    projectId: string,
    memberId: string,
  ) {
    const member = await tx.projectMember.findFirst({
      where: { id: memberId, projectId },
      select: {
        id: true,
        userId: true,
        role: true,
        user: { select: { name: true } },
      },
    });

    if (!member) {
      throw new NotFoundException('Project member not found');
    }

    return member;
  }

  private async assertAnotherOwnerExists(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<void> {
    const ownerCount = await tx.projectMember.count({
      where: { projectId, role: ProjectRole.OWNER },
    });

    if (ownerCount <= 1) {
      throw new ConflictException(
        'The final project owner cannot be removed or demoted',
      );
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
