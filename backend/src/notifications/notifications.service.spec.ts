import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { RealtimeService } from '../realtime/realtime.service';
import { NotificationType } from './notification.types';
import { NotificationsService } from './notifications.service';

jest.mock('../realtime/realtime.service', () => ({
  RealtimeService: class RealtimeService {},
}));

describe('NotificationsService', () => {
  let database: {
    notification: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
    project: { findFirst: jest.Mock };
  };
  let realtime: { publishNotification: jest.Mock };
  let service: NotificationsService;

  beforeEach(() => {
    database = {
      notification: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(2),
        update: jest.fn(),
        updateMany: jest.fn(),
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: { userId: string } }) =>
            Promise.resolve({ id: `n-${data.userId}`, userId: data.userId }),
          ),
      },
      project: { findFirst: jest.fn().mockResolvedValue({ id: 'p1' }) },
    };
    realtime = { publishNotification: jest.fn() };
    service = new NotificationsService(
      database as unknown as PrismaService,
      realtime as unknown as RealtimeService,
    );
  });

  it('lists only the current user with deterministic cursor pagination', async () => {
    database.notification.findFirst.mockResolvedValue({ id: 'n1' });
    database.notification.findMany.mockResolvedValue([
      { id: 'n1' },
      { id: 'n2' },
      { id: 'n3' },
    ]);
    const result = await service.findAll('u1', { cursor: 'n1', limit: 2 });
    expect(database.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        cursor: { id: 'n1' },
        skip: 1,
        take: 3,
      }),
    );
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe('n2');
  });

  it('rejects a cursor outside the current inbox', async () => {
    database.notification.findFirst.mockResolvedValue(null);
    await expect(
      service.findAll('u1', { cursor: 'other', limit: 30 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('counts and marks only the current user notifications', async () => {
    expect(await service.unreadCount('u1')).toEqual({ count: 2 });
    expect(database.notification.count).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: null },
    });
    database.notification.findFirst.mockResolvedValue({
      id: 'n1',
      readAt: null,
    });
    database.notification.update.mockResolvedValue({
      id: 'n1',
      readAt: new Date(),
    });
    await service.markRead('u1', 'n1');
    expect(database.notification.findFirst).toHaveBeenCalledWith({
      where: { id: 'n1', userId: 'u1' },
      select: { id: true, readAt: true },
    });
    await service.markAllRead('u1');
    expect(database.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: null },
      data: { readAt: expect.any(Date) as Date },
    });
  });

  it('makes read idempotent and hides cross-user IDs as not found', async () => {
    const readAt = new Date();
    database.notification.findFirst.mockResolvedValueOnce({ id: 'n1', readAt });
    await expect(service.markRead('u1', 'n1')).resolves.toEqual({
      id: 'n1',
      readAt,
    });
    expect(database.notification.update).not.toHaveBeenCalled();
    database.notification.findFirst.mockResolvedValueOnce(null);
    await expect(service.markRead('u1', 'n2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('records assignment and unassignment recipients while suppressing the actor', async () => {
    const tx = database as unknown as Prisma.TransactionClient;
    const deliveries = await service.recordTaskAssignment(tx, {
      actorId: 'actor',
      projectId: 'p1',
      projectName: 'Project',
      taskId: 't1',
      taskTitle: 'Task',
      beforeAssigneeId: 'old',
      afterAssigneeId: 'actor',
    });
    expect(deliveries).toEqual([{ notificationId: 'n-old', userId: 'old' }]);
    expect(database.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'old',
          type: NotificationType.TASK_UNASSIGNED_FROM_YOU,
        }) as object,
      }),
    );
  });

  it('deduplicates reply and Task-owner recipients and stores no Comment body', async () => {
    const tx = database as unknown as Prisma.TransactionClient;
    await service.recordCommentCreated(tx, {
      actorId: 'actor',
      projectId: 'p1',
      projectName: 'Project',
      taskId: 't1',
      taskTitle: 'Task',
      commentId: 'c1',
      parentAuthorId: 'recipient',
      reporterId: 'recipient',
      assigneeId: 'recipient',
    });
    expect(database.notification.create).toHaveBeenCalledTimes(1);
    const calls = database.notification.create.mock.calls as unknown as Array<
      [{ data: { type: string; metadata: unknown } }]
    >;
    expect(calls[0]?.[0].data.type).toBe(NotificationType.COMMENT_REPLY_TO_YOU);
    expect(JSON.stringify(calls)).not.toContain('comment content');
  });

  it('does not notify candidates who no longer have Project access', async () => {
    database.project.findFirst.mockResolvedValue(null);
    const deliveries = await service.recordTaskAssignment(
      database as unknown as Prisma.TransactionClient,
      {
        actorId: 'actor',
        projectId: 'p1',
        projectName: 'Project',
        taskId: 't1',
        taskTitle: 'Task',
        beforeAssigneeId: null,
        afterAssigneeId: 'recipient',
      },
    );
    expect(deliveries).toEqual([]);
    expect(database.notification.create).not.toHaveBeenCalled();
  });

  it('records membership notifications and publishes only to target user rooms', async () => {
    const deliveries = await service.recordMembershipChange(
      database as unknown as Prisma.TransactionClient,
      {
        actorId: 'actor',
        targetUserId: 'target',
        projectId: 'p1',
        projectName: 'Project',
        memberId: 'm1',
        role: 'MEMBER',
        type: NotificationType.PROJECT_MEMBER_ADDED_YOU,
      },
    );
    await service.publishCreated(deliveries);
    expect(realtime.publishNotification).toHaveBeenCalledWith('target', {
      notificationId: 'n-target',
    });
  });
});
