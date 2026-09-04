import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AccessService } from '../access/access.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ProjectColumnsService } from './project-columns.service';

describe('ProjectColumnsService', () => {
  const projectId = '10000000-0000-4000-8000-000000000001';
  const boardId = '20000000-0000-4000-8000-000000000001';
  const columnId = '30000000-0000-4000-8000-000000000001';
  const userId = 'user-1';

  let transaction: {
    $queryRaw: jest.Mock<Promise<Array<{ id: string }>>, [Prisma.Sql]>;
    column: {
      aggregate: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    task: { count: jest.Mock };
  };
  let prisma: PrismaService;
  let boardFindUnique: jest.Mock;
  let columnFindMany: jest.Mock;
  let access: { assertProjectAccess: jest.Mock };
  let service: ProjectColumnsService;

  beforeEach(() => {
    transaction = {
      $queryRaw: jest
        .fn<Promise<Array<{ id: string }>>, [Prisma.Sql]>()
        .mockResolvedValue([{ id: boardId }]),
      column: {
        aggregate: jest.fn().mockResolvedValue({ _max: { position: 5 } }),
        create: jest.fn().mockResolvedValue({ id: columnId }),
        update: jest.fn().mockResolvedValue({ id: columnId }),
        delete: jest.fn().mockResolvedValue({ id: columnId }),
      },
      task: { count: jest.fn().mockResolvedValue(0) },
    };
    boardFindUnique = jest.fn().mockResolvedValue({ id: boardId });
    columnFindMany = jest.fn().mockResolvedValue([]);
    prisma = {
      $transaction: jest.fn(
        async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          operation(transaction as unknown as Prisma.TransactionClient),
      ),
      board: { findUnique: boardFindUnique },
      column: { findMany: columnFindMany },
    } as unknown as PrismaService;
    access = { assertProjectAccess: jest.fn() };
    service = new ProjectColumnsService(
      prisma,
      access as unknown as AccessService,
    );
  });

  it('lists only the Project Board columns in deterministic order', async () => {
    await service.findAll(userId, projectId);

    expect(access.assertProjectAccess).toHaveBeenCalledWith(userId, projectId);
    expect(columnFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId, boardId },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('reports a Project without its runtime Board as a conflict', async () => {
    boardFindUnique.mockResolvedValue(null);

    await expect(service.findAll(userId, projectId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(columnFindMany).not.toHaveBeenCalled();
  });

  it('locks the Board and appends after the highest Project position', async () => {
    await service.create(userId, projectId, { name: 'Blocked' });

    expect(access.assertProjectAccess).toHaveBeenCalledWith(
      userId,
      projectId,
      transaction,
    );
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.column.aggregate).toHaveBeenCalledWith({
      where: { projectId },
      _max: { position: true },
    });
    expect(transaction.column.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: 'Blocked',
          position: 6,
          projectId,
          boardId,
        },
      }),
    );
  });

  it('maps an unexpected position collision to ConflictException', async () => {
    transaction.column.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.create(userId, projectId, { name: 'Blocked' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('renames a Column only after locking the nested Project/Board match', async () => {
    await service.update(userId, projectId, columnId, { name: 'Ready' });

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.column.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: columnId },
        data: { name: 'Ready' },
      }),
    );
  });

  it('reports a cross-Project Column as not found', async () => {
    transaction.$queryRaw.mockResolvedValue([]);

    await expect(
      service.update(userId, projectId, columnId, { name: 'Ready' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.column.update).not.toHaveBeenCalled();
  });

  it('returns Conflict without deleting a non-empty Column', async () => {
    transaction.task.count.mockResolvedValue(1);

    await expect(
      service.remove(userId, projectId, columnId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.column.delete).not.toHaveBeenCalled();
  });

  it('deletes an empty scoped Column', async () => {
    await service.remove(userId, projectId, columnId);

    expect(transaction.column.delete).toHaveBeenCalledWith({
      where: { id: columnId },
    });
  });
});
