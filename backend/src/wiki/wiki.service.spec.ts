import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { AccessService } from '../access/access.service';
import type { ActivitiesService } from '../activities/activities.service';
import { ActivityEvent } from '../activities/activity.types';
import type { PrismaService } from '../prisma/prisma.service';
import { WikiService } from './wiki.service';

const page = {
  id: 'page-1',
  projectId: 'project-1',
  parentId: null,
  title: 'Architecture',
  content: '# Architecture',
  position: 0,
  createdById: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  creator: { id: 'user-1', name: 'User', email: 'user@test.dev', image: null },
};

describe('WikiService', () => {
  let db: {
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    wikiPage: {
      aggregate: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
      delete: jest.Mock;
    };
  };
  let access: {
    assertProjectAccess: jest.Mock;
    assertProjectOwnerAuthority: jest.Mock;
  };
  let activities: { record: jest.Mock };
  let service: WikiService;

  beforeEach(() => {
    db = {
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
      wikiPage: {
        aggregate: jest.fn().mockResolvedValue({ _max: { position: null } }),
        create: jest.fn().mockResolvedValue(page),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue(page),
        update: jest.fn().mockResolvedValue(page),
        updateMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        delete: jest.fn(),
      },
    };
    db.$transaction.mockImplementation(
      (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(db as unknown as Prisma.TransactionClient),
    );
    db.$queryRaw
      .mockResolvedValueOnce([{ id: 'project-1' }])
      .mockResolvedValue([{ ...page, creator: undefined }]);
    access = {
      assertProjectAccess: jest.fn(),
      assertProjectOwnerAuthority: jest.fn(),
    };
    activities = { record: jest.fn() };
    service = new WikiService(
      db as unknown as PrismaService,
      access as unknown as AccessService,
      activities as unknown as ActivitiesService,
    );
  });

  it('appends a root page and records compact Activity atomically', async () => {
    await service.create('user-1', 'project-1', {
      title: 'Architecture',
      content: '# Architecture',
      parentId: null,
    });
    expect(db.wikiPage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          position: 0,
          createdById: 'user-1',
        }) as object,
      }),
    );
    expect(activities.record).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        type: ActivityEvent.WIKI_PAGE_CREATED,
      }),
    );
    expect(JSON.stringify(activities.record.mock.calls)).not.toContain(
      '# Architecture',
    );
  });

  it('does not create Activity for a no-op update', async () => {
    const result = await service.update('user-1', 'project-1', 'page-1', {
      title: page.title,
      content: page.content,
    });
    expect(result.changed).toBe(false);
    expect(db.wikiPage.update).not.toHaveBeenCalled();
    expect(activities.record).not.toHaveBeenCalled();
  });

  it('rejects self-parenting before changing sibling positions', async () => {
    await expect(
      service.move('user-1', 'project-1', 'page-1', {
        parentId: 'page-1',
        targetIndex: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.wikiPage.updateMany).not.toHaveBeenCalled();
  });

  it('rejects deletion while children remain', async () => {
    db.wikiPage.count.mockResolvedValueOnce(1);
    await expect(
      service.remove('user-1', 'project-1', 'page-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.wikiPage.delete).not.toHaveBeenCalled();
  });

  it('requires owner authority when a collaborator deletes another creator page', async () => {
    await service.remove('other-user', 'project-1', 'page-1');
    expect(access.assertProjectOwnerAuthority).toHaveBeenCalledWith(
      'other-user',
      'project-1',
      db,
    );
    expect(activities.record).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: ActivityEvent.WIKI_PAGE_DELETED }),
    );
  });
});
