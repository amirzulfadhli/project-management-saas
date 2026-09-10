import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { AccessService } from '../access/access.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  createManualTimeEntrySchema,
  startTimerSchema,
} from './dto/time-tracking.dto';
import { TimeTrackingService } from './time-tracking.service';

const task = { id: 'task-1', projectId: 'project-1', title: 'Task' };
const entry = {
  id: 'entry-1',
  projectId: task.projectId,
  taskId: task.id,
  userId: 'user-1',
  startedAt: new Date('2026-09-10T00:00:00.000Z'),
  endedAt: null,
  durationSeconds: null,
  note: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  task,
};

describe('TimeTrackingService', () => {
  let db: {
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    task: { findUnique: jest.Mock };
    timeEntry: {
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      aggregate: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let access: { assertProjectAccess: jest.Mock };
  let service: TimeTrackingService;

  beforeEach(() => {
    db = {
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'user-1' }]),
      task: { findUnique: jest.fn().mockResolvedValue(task) },
      timeEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(entry),
        create: jest.fn().mockResolvedValue(entry),
        update: jest.fn().mockResolvedValue({
          ...entry,
          endedAt: new Date(),
          durationSeconds: 1,
        }),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { durationSeconds: 0 } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    db.$transaction.mockImplementation(
      (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(db as unknown as Prisma.TransactionClient),
    );
    access = { assertProjectAccess: jest.fn() };
    service = new TimeTrackingService(
      db as unknown as PrismaService,
      access as unknown as AccessService,
    );
  });

  it('starts a user-owned timer after locking the user', async () => {
    await service.start('user-1', task.id, { note: null });
    expect(access.assertProjectAccess).toHaveBeenCalledWith(
      'user-1',
      task.projectId,
      db,
    );
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          taskId: task.id,
          activeMarker: true,
        }) as object,
      }),
    );
  });

  it('rejects a second active timer', async () => {
    db.timeEntry.findFirst.mockResolvedValueOnce({
      id: 'active',
      taskId: 'other-task',
    });
    await expect(
      service.start('user-1', task.id, { note: null }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.timeEntry.create).not.toHaveBeenCalled();
  });

  it('derives manual duration in integer seconds', async () => {
    await service.createManual('user-1', task.id, {
      startedAt: new Date('2026-09-10T00:00:00.000Z'),
      endedAt: new Date('2026-09-10T00:01:30.900Z'),
      note: 'Review',
    });
    expect(db.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ durationSeconds: 90 }) as object,
      }),
    );
  });

  it('keeps start and manual DTOs strict and bounded', () => {
    expect(startTimerSchema.safeParse({ unknown: true }).success).toBe(false);
    expect(
      createManualTimeEntrySchema.safeParse({
        startedAt: '2026-09-10T02:00:00.000Z',
        endedAt: '2026-09-10T01:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      createManualTimeEntrySchema.safeParse({
        startedAt: '2026-09-08T00:00:00.000Z',
        endedAt: '2026-09-10T00:00:01.000Z',
      }).success,
    ).toBe(false);
  });
});
