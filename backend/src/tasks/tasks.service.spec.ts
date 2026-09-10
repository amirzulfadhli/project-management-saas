import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AccessService } from '../access/access.service';
import type { ActivitiesService } from '../activities/activities.service';
import { ActivityEvent } from '../activities/activity.types';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { TasksService } from './tasks.service';

jest.mock('../realtime/realtime.service', () => ({
  RealtimeService: class RealtimeService {},
}));

const task = {
  id: 't1',
  title: 'Ship it',
  description: null,
  columnId: 'c1',
  projectId: 'p1',
  assigneeId: null,
  reporterId: 'u1',
  priority: 1,
  status: 'todo',
  position: 0,
  dueDate: null,
  estimatedTime: null,
  actualTime: null,
  startDate: null,
  completedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  githubIssueId: null,
  githubIssueNumber: null,
  githubBranch: null,
  githubPrNumbers: [],
  deploymentStatus: null,
  assignee: null,
  reporter: { id: 'u1', name: 'Reporter', email: 'r@test', image: null },
  column: { id: 'c1', name: 'Backlog', position: 0 },
  project: { id: 'p1', name: 'Project' },
};

describe('TasksService', () => {
  let service: TasksService;
  let database: {
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    task: {
      create: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    project: { findMany: jest.Mock; findFirst: jest.Mock };
    issue: { deleteMany: jest.Mock };
  };
  let access: {
    assertProjectAccess: jest.Mock;
    assertColumnInProject: jest.Mock;
  };
  let activities: { record: jest.Mock };
  let notifications: {
    recordTaskAssignment: jest.Mock;
    publishCreated: jest.Mock;
  };

  beforeEach(() => {
    database = {
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 't1' }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      task: {
        create: jest.fn().mockResolvedValue(task),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(task),
        findUniqueOrThrow: jest.fn().mockResolvedValue(task),
        update: jest.fn().mockResolvedValue(task),
        delete: jest.fn().mockResolvedValue(task),
      },
      project: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'p1' }),
      },
      issue: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    database.$transaction.mockImplementation(
      (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(database as unknown as Prisma.TransactionClient),
    );
    access = {
      assertProjectAccess: jest.fn(),
      assertColumnInProject: jest.fn(),
    };
    activities = { record: jest.fn().mockResolvedValue({ id: 'a1' }) };
    notifications = {
      recordTaskAssignment: jest.fn().mockResolvedValue([]),
      publishCreated: jest.fn(),
    };
    service = new TasksService(
      database as unknown as PrismaService,
      access as unknown as AccessService,
      activities as unknown as ActivitiesService,
      notifications as unknown as NotificationsService,
    );
  });

  it('creates a Task and Activity inside one transaction', async () => {
    await service.create('u1', {
      title: 'Ship it',
      projectId: 'p1',
      columnId: 'c1',
    });
    expect(access.assertProjectAccess).toHaveBeenCalledWith(
      'u1',
      'p1',
      database,
    );
    expect(access.assertColumnInProject).toHaveBeenCalledWith(
      'c1',
      'p1',
      database,
    );
    expect(activities.record).toHaveBeenCalledWith(
      database,
      expect.objectContaining({ type: ActivityEvent.TASK_CREATED }),
    );
  });

  it('rejects a cross-Project Column without writing Task or Activity', async () => {
    access.assertColumnInProject.mockRejectedValue(new Error('bad column'));
    await expect(
      service.create('u1', {
        title: 'Ship it',
        projectId: 'p1',
        columnId: 'c99',
      }),
    ).rejects.toThrow('bad column');
    expect(database.task.create).not.toHaveBeenCalled();
    expect(activities.record).not.toHaveBeenCalled();
  });

  it('rejects an assignee who cannot access the Project', async () => {
    database.project.findFirst.mockResolvedValue(null);
    await expect(
      service.create('u1', {
        title: 'Assigned',
        projectId: 'p1',
        columnId: 'c1',
        assigneeId: 'outsider',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates a Column filter against an explicitly scoped Project', async () => {
    await service.findAll('u1', { projectId: 'p1', columnId: 'c1' });
    expect(access.assertColumnInProject).toHaveBeenCalledWith('c1', 'p1');
  });

  it('excludes archived Projects from an unscoped list', async () => {
    database.project.findMany.mockResolvedValue([{ id: 'p1' }]);
    await service.findAll('u1', {});
    const findManyCalls = database.project.findMany.mock
      .calls as unknown as Array<[{ where: { archivedAt: null } }]>;
    expect(findManyCalls[0]?.[0].where).toMatchObject({
      archivedAt: null,
    });
  });

  it('emits distinct semantic and generic update events', async () => {
    const movedTask = {
      ...task,
      title: 'Shipped',
      columnId: 'c2',
      position: 0,
      column: { id: 'c2', name: 'Done', position: 5 },
      priority: 2,
      description: 'Complete',
    };
    database.task.findMany
      .mockResolvedValueOnce([{ id: 't1', position: 0, projectId: 'p1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ position: 0 }]);
    database.task.update.mockResolvedValue(movedTask);
    await service.update('u1', 't1', {
      title: 'Shipped',
      columnId: 'c2',
      priority: 2,
      description: 'Complete',
    });
    const recordCalls = activities.record.mock.calls as unknown as Array<
      [unknown, { type: string }]
    >;
    expect(recordCalls.map((call) => call[1].type)).toEqual([
      ActivityEvent.TASK_RENAMED,
      ActivityEvent.TASK_MOVED,
      ActivityEvent.TASK_PRIORITY_CHANGED,
      ActivityEvent.TASK_UPDATED,
    ]);
  });

  it('emits no Activity for a no-op update', async () => {
    await service.update('u1', 't1', { title: task.title, priority: 1 });
    expect(activities.record).not.toHaveBeenCalled();
  });

  it('throws when the locked Task does not exist', async () => {
    database.$queryRaw.mockResolvedValue([]);
    await expect(
      service.update('u1', 't1', { title: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records deletion before permanently deleting the Task', async () => {
    await service.remove('u1', 't1');
    expect(activities.record).toHaveBeenCalledWith(
      database,
      expect.objectContaining({
        type: ActivityEvent.TASK_DELETED,
        taskId: 't1',
      }),
    );
    expect(database.task.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    expect(activities.record.mock.invocationCallOrder[0]).toBeLessThan(
      database.task.delete.mock.invocationCallOrder[0],
    );
  });

  it('reorders inside a Column without emitting Activity', async () => {
    const secondTask = { ...task, id: 't2', position: 1 };
    database.task.findMany
      .mockResolvedValueOnce([
        { id: 't1', position: 0, projectId: 'p1' },
        { id: 't2', position: 1, projectId: 'p1' },
      ])
      .mockResolvedValueOnce([{ position: 0 }, { position: 1 }]);
    database.task.findUniqueOrThrow
      .mockResolvedValueOnce(task)
      .mockResolvedValueOnce({ ...task, position: 1 });
    database.task.update.mockResolvedValue(secondTask);

    const result = await service.move('u1', 't1', {
      columnId: 'c1',
      targetIndex: 1,
    });

    expect(result.position).toBe(1);
    expect(database.$executeRaw).toHaveBeenCalled();
    expect(activities.record).not.toHaveBeenCalled();
  });

  it('records one TASK_MOVED event for a cross-Column move', async () => {
    const movedTask = {
      ...task,
      columnId: 'c2',
      column: { id: 'c2', name: 'Done', position: 5 },
    };
    database.task.findMany
      .mockResolvedValueOnce([{ id: 't1', position: 0, projectId: 'p1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ position: 0 }]);
    database.task.findUniqueOrThrow
      .mockResolvedValueOnce(task)
      .mockResolvedValueOnce(movedTask);

    await service.move('u1', 't1', { columnId: 'c2', targetIndex: 0 });

    expect(activities.record).toHaveBeenCalledWith(
      database,
      expect.objectContaining({ type: ActivityEvent.TASK_MOVED }),
    );
  });
});
