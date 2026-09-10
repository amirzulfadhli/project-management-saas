import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  NotificationDelivery,
  NotificationEntityType,
  NotificationType,
} from './notification.types';
import type { ListNotificationsQueryDto } from './dto/notification.dto';

const notificationSelect = {
  id: true,
  type: true,
  projectId: true,
  entityType: true,
  entityId: true,
  metadata: true,
  readAt: true,
  createdAt: true,
  actor: { select: { id: true, name: true, email: true, image: true } },
  project: { select: { id: true, name: true } },
} satisfies Prisma.NotificationSelect;

interface Candidate {
  userId: string;
  type: NotificationType;
}

interface NotificationContext {
  actorId: string;
  projectId: string;
  entityType: NotificationEntityType;
  entityId?: string;
  metadata: Prisma.InputJsonValue;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async findAll(userId: string, query: ListNotificationsQueryDto) {
    if (query.cursor) {
      const cursor = await this.prisma.notification.findFirst({
        where: { id: query.cursor, userId },
        select: { id: true },
      });
      if (!cursor) throw new NotFoundException('Notification cursor not found');
    }

    const rows = await this.prisma.notification.findMany({
      where: { userId },
      select: notificationSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async unreadCount(userId: string) {
    return {
      count: await this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    };
  }

  async markRead(userId: string, notificationId: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true, readAt: true },
    });
    if (!existing) throw new NotFoundException('Notification not found');
    if (existing.readAt) return existing;
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
      select: { id: true, readAt: true },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async recordTaskAssignment(
    tx: Prisma.TransactionClient,
    input: {
      actorId: string;
      projectId: string;
      projectName: string;
      taskId: string;
      taskTitle: string;
      beforeAssigneeId: string | null;
      afterAssigneeId: string | null;
    },
  ): Promise<NotificationDelivery[]> {
    if (input.beforeAssigneeId === input.afterAssigneeId) return [];
    const candidates: Candidate[] = [];
    if (input.beforeAssigneeId) {
      candidates.push({
        userId: input.beforeAssigneeId,
        type: NotificationType.TASK_UNASSIGNED_FROM_YOU,
      });
    }
    if (input.afterAssigneeId) {
      candidates.push({
        userId: input.afterAssigneeId,
        type: NotificationType.TASK_ASSIGNED_TO_YOU,
      });
    }
    return this.createForCandidates(tx, candidates, {
      actorId: input.actorId,
      projectId: input.projectId,
      entityType: 'task',
      entityId: input.taskId,
      metadata: {
        taskTitle: input.taskTitle,
        projectName: input.projectName,
      },
    });
  }

  async recordCommentCreated(
    tx: Prisma.TransactionClient,
    input: {
      actorId: string;
      projectId: string;
      projectName: string;
      taskId: string;
      taskTitle: string;
      commentId: string;
      parentAuthorId: string | null;
      reporterId: string;
      assigneeId: string | null;
    },
  ): Promise<NotificationDelivery[]> {
    const candidates = new Map<string, Candidate>();
    if (input.parentAuthorId) {
      candidates.set(input.parentAuthorId, {
        userId: input.parentAuthorId,
        type: NotificationType.COMMENT_REPLY_TO_YOU,
      });
    }
    for (const userId of [input.reporterId, input.assigneeId]) {
      if (userId && !candidates.has(userId)) {
        candidates.set(userId, {
          userId,
          type: NotificationType.COMMENT_ON_YOUR_TASK,
        });
      }
    }
    return this.createForCandidates(tx, [...candidates.values()], {
      actorId: input.actorId,
      projectId: input.projectId,
      entityType: 'comment',
      entityId: input.commentId,
      metadata: {
        taskId: input.taskId,
        taskTitle: input.taskTitle,
        projectName: input.projectName,
      },
    });
  }

  async recordMembershipChange(
    tx: Prisma.TransactionClient,
    input: {
      actorId: string;
      targetUserId: string;
      projectId: string;
      projectName: string;
      memberId: string;
      role: string;
      type:
        | typeof NotificationType.PROJECT_MEMBER_ADDED_YOU
        | typeof NotificationType.PROJECT_MEMBER_ROLE_CHANGED_YOU;
    },
  ): Promise<NotificationDelivery[]> {
    return this.createForCandidates(
      tx,
      [{ userId: input.targetUserId, type: input.type }],
      {
        actorId: input.actorId,
        projectId: input.projectId,
        entityType: 'project-member',
        entityId: input.memberId,
        metadata: { projectName: input.projectName, role: input.role },
      },
    );
  }

  async publishCreated(deliveries: NotificationDelivery[]): Promise<void> {
    await Promise.all(
      deliveries.map((delivery) =>
        this.realtime.publishNotification(delivery.userId, {
          notificationId: delivery.notificationId,
        }),
      ),
    );
  }

  private async createForCandidates(
    tx: Prisma.TransactionClient,
    candidates: Candidate[],
    context: NotificationContext,
  ): Promise<NotificationDelivery[]> {
    const unique = new Map(candidates.map((item) => [item.userId, item]));
    unique.delete(context.actorId);
    const deliveries: NotificationDelivery[] = [];
    for (const candidate of unique.values()) {
      if (
        !(await this.hasProjectAccess(tx, candidate.userId, context.projectId))
      ) {
        continue;
      }
      const notification = await tx.notification.create({
        data: {
          userId: candidate.userId,
          actorId: context.actorId,
          projectId: context.projectId,
          type: candidate.type,
          entityType: context.entityType,
          entityId: context.entityId ?? null,
          metadata: context.metadata,
        },
        select: { id: true, userId: true },
      });
      deliveries.push({
        notificationId: notification.id,
        userId: notification.userId,
      });
    }
    return deliveries;
  }

  private async hasProjectAccess(
    tx: Prisma.TransactionClient,
    userId: string,
    projectId: string,
  ): Promise<boolean> {
    const project = await tx.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { organization: { members: { some: { userId } } } },
          { projectMembers: { some: { userId } } },
        ],
      },
      select: { id: true },
    });
    return Boolean(project);
  }
}
