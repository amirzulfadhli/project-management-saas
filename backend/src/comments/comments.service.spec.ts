import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AccessService } from '../access/access.service';
import type { ActivitiesService } from '../activities/activities.service';
import { ActivityEvent } from '../activities/activity.types';
import type { PrismaService } from '../prisma/prisma.service';
import { CommentsService } from './comments.service';
import type { NotificationsService } from '../notifications/notifications.service';

jest.mock('../realtime/realtime.service', () => ({
  RealtimeService: class RealtimeService {},
}));

const comment = {
  id: 'c1',
  taskId: 't1',
  parentId: null,
  content: 'Hello',
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  author: { id: 'u1', name: 'Author', email: 'author@test.dev', image: null },
};

describe('CommentsService', () => {
  let database: {
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    task: { findUnique: jest.Mock };
    comment: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let access: {
    assertProjectAccess: jest.Mock;
    assertProjectMembershipAdmin: jest.Mock;
  };
  let activities: { record: jest.Mock };
  let notifications: {
    recordCommentCreated: jest.Mock;
    publishCreated: jest.Mock;
  };
  let service: CommentsService;

  beforeEach(() => {
    database = {
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ id: comment.id }]),
      task: {
        findUnique: jest.fn().mockResolvedValue({
          projectId: 'p1',
          title: 'Task',
          reporterId: 'u1',
          assigneeId: null,
          project: { name: 'Project' },
        }),
      },
      comment: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(comment),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(comment),
        update: jest.fn().mockResolvedValue({ ...comment, content: 'Changed' }),
      },
    };
    database.$transaction.mockImplementation(
      (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(database as unknown as Prisma.TransactionClient),
    );
    access = {
      assertProjectAccess: jest.fn(),
      assertProjectMembershipAdmin: jest.fn(),
    };
    activities = { record: jest.fn().mockResolvedValue({ id: 'a1' }) };
    notifications = {
      recordCommentCreated: jest.fn().mockResolvedValue([]),
      publishCreated: jest.fn(),
    };
    service = new CommentsService(
      database as unknown as PrismaService,
      access as unknown as AccessService,
      activities as unknown as ActivitiesService,
      notifications as unknown as NotificationsService,
    );
  });

  it('creates a Comment and privacy-safe Activity in one transaction', async () => {
    const result = await service.create('u1', 't1', { content: 'Hello' });
    expect(access.assertProjectAccess).toHaveBeenCalledWith(
      'u1',
      'p1',
      database,
    );
    const recordCalls = activities.record.mock.calls as unknown as Array<
      [
        unknown,
        { type: string; projectId: string; taskId: string; metadata: unknown },
      ]
    >;
    expect(recordCalls[0]?.[0]).toBe(database);
    expect(recordCalls[0]?.[1]).toMatchObject({
      type: ActivityEvent.COMMENT_CREATED,
      projectId: 'p1',
      taskId: 't1',
      metadata: { contentLength: 5 },
    });
    expect(JSON.stringify(recordCalls)).not.toContain('Hello');
    expect(result.content).toBe('Hello');
  });

  it('rejects a parent from another Task before writing', async () => {
    database.comment.findUnique.mockResolvedValue({ taskId: 'other-task' });
    await expect(
      service.create('u1', 't1', { content: 'Reply', parentId: 'parent' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.comment.create).not.toHaveBeenCalled();
    expect(activities.record).not.toHaveBeenCalled();
  });

  it('allows only the author to edit and emits nothing for a no-op', async () => {
    await expect(
      service.update('u2', 't1', 'c1', { content: 'Changed' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await service.update('u1', 't1', 'c1', { content: 'Hello' });
    expect(database.comment.update).not.toHaveBeenCalled();
    expect(activities.record).not.toHaveBeenCalled();
  });

  it('rejects edits to deleted Comments', async () => {
    database.comment.findFirst.mockResolvedValue({
      ...comment,
      content: '',
      deletedAt: new Date(),
    });
    await expect(
      service.update('u1', 't1', 'c1', { content: 'Changed' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets a moderator delete, erases content, and records one Activity', async () => {
    await service.remove('moderator', 't1', 'c1');
    expect(access.assertProjectMembershipAdmin).toHaveBeenCalledWith(
      'moderator',
      'p1',
      database,
    );
    const updateCalls = database.comment.update.mock.calls as unknown as Array<
      [{ where: { id: string }; data: { content: string; deletedAt: Date } }]
    >;
    expect(updateCalls[0]?.[0].where.id).toBe('c1');
    expect(updateCalls[0]?.[0].data.content).toBe('');
    expect(updateCalls[0]?.[0].data.deletedAt).toBeInstanceOf(Date);
    const recordCalls = activities.record.mock.calls as unknown as Array<
      [unknown, { type: string }]
    >;
    expect(recordCalls[0]?.[0]).toBe(database);
    expect(recordCalls[0]?.[1].type).toBe(ActivityEvent.COMMENT_DELETED);
  });

  it('treats repeated deletion as idempotent without another Activity', async () => {
    database.comment.findFirst.mockResolvedValue({
      ...comment,
      content: '',
      deletedAt: new Date(),
    });
    await service.remove('u1', 't1', 'c1');
    expect(database.comment.update).not.toHaveBeenCalled();
    expect(activities.record).not.toHaveBeenCalled();
  });
});
