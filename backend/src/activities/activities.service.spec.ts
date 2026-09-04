import { NotFoundException } from '@nestjs/common';
import type { AccessService } from '../access/access.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ActivitiesService } from './activities.service';
import { ActivityEvent } from './activity.types';

describe('ActivitiesService', () => {
  const projectId = '10000000-0000-4000-8000-000000000001';
  const cursorId = '20000000-0000-4000-8000-000000000001';
  let prisma: {
    activity: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
  };
  let access: { assertProjectAccess: jest.Mock };
  let service: ActivitiesService;

  beforeEach(() => {
    prisma = {
      activity: {
        create: jest.fn().mockResolvedValue({ id: 'activity-1' }),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    access = { assertProjectAccess: jest.fn() };
    service = new ActivitiesService(
      prisma as unknown as PrismaService,
      access as unknown as AccessService,
    );
  });

  it('records through the supplied database client', async () => {
    const transaction = { activity: { create: jest.fn() } };
    await service.record(transaction as unknown as PrismaService, {
      type: ActivityEvent.PROJECT_CREATED,
      description: 'Created Project',
      projectId,
      userId: 'actor',
      metadata: { name: 'Roadmap' },
    });
    const createCalls = transaction.activity.create.mock
      .calls as unknown as Array<
      [
        {
          data: { type: string; projectId: string; taskId: string | null };
        },
      ]
    >;
    const createCall = createCalls[0]?.[0];
    expect(createCall?.data).toMatchObject({
      type: ActivityEvent.PROJECT_CREATED,
      projectId,
      taskId: null,
    });
    expect(prisma.activity.create).not.toHaveBeenCalled();
  });

  it('authorizes, paginates, and maps user to actor', async () => {
    prisma.activity.findFirst.mockResolvedValue({ id: cursorId });
    prisma.activity.findMany.mockResolvedValue([
      {
        id: 'a2',
        type: ActivityEvent.PROJECT_UPDATED,
        description: 'Updated',
        metadata: null,
        taskId: null,
        projectId,
        createdAt: new Date(),
        user: { id: 'u1', name: 'User', email: 'u@test', image: null },
        task: null,
      },
      {
        id: 'a1',
        type: ActivityEvent.PROJECT_CREATED,
        description: 'Created',
        metadata: null,
        taskId: null,
        projectId,
        createdAt: new Date(),
        user: { id: 'u1', name: 'User', email: 'u@test', image: null },
        task: null,
      },
    ]);
    const result = await service.findAll('u1', projectId, {
      cursor: cursorId,
      limit: 1,
    });
    expect(access.assertProjectAccess).toHaveBeenCalledWith('u1', projectId);
    expect(result.items[0]?.id).toBe('a2');
    expect(result.items[0]?.actor.id).toBe('u1');
    expect(result.nextCursor).toBe('a2');
  });

  it('rejects a cursor from another Project', async () => {
    prisma.activity.findFirst.mockResolvedValue(null);
    await expect(
      service.findAll('u1', projectId, { cursor: cursorId, limit: 30 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.activity.findMany).not.toHaveBeenCalled();
  });
});
