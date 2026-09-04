import { ProjectsService, DEFAULT_COLUMNS } from './projects.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AccessService } from '../access/access.service';
import { ProjectRole } from '../../generated/prisma/client';
import type { ActivitiesService } from '../activities/activities.service';

interface ProjectCreateArgs {
  data: {
    board: { create: { name: string } };
    projectMembers: {
      create: { userId: string; role: ProjectRole };
    };
  };
}

interface ColumnCreateManyArgs {
  data: Array<{
    name: string;
    position: number;
    projectId: string;
    boardId: string;
  }>;
}

interface ProjectFindManyArgs {
  where: {
    organizationId?: string;
    archivedAt: null | { not: null };
    [key: string]: unknown;
  };
}

interface ProjectUpdateArgs {
  data: {
    name?: string;
    archivedAt?: Date;
  };
  include?: {
    organization?: boolean;
    projectMembers?: unknown;
  };
}

interface TransactionMock {
  $queryRaw: jest.Mock;
  project: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    update: jest.Mock;
  };
  column: {
    createMany: jest.MockedFunction<
      (args: ColumnCreateManyArgs) => Promise<{ count: number }>
    >;
  };
}

describe('ProjectsService', () => {
  let service: ProjectsService;
  let tx: TransactionMock;
  let prisma: {
    $transaction: jest.MockedFunction<
      (
        callback: (transaction: TransactionMock) => Promise<unknown>,
      ) => Promise<unknown>
    >;
    project: {
      findMany: jest.MockedFunction<
        (args: ProjectFindManyArgs) => Promise<unknown[]>
      >;
      findUnique: jest.MockedFunction<(args: unknown) => Promise<unknown>>;
      update: jest.MockedFunction<
        (args: ProjectUpdateArgs) => Promise<{ id: string }>
      >;
    };
  };
  let access: {
    assertOrganizationMember: jest.MockedFunction<
      (userId: string, organizationId: string) => Promise<void>
    >;
    assertProjectAccess: jest.MockedFunction<
      (userId: string, projectId: string) => Promise<void>
    >;
  };

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'p1' }]),
      project: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      column: { createMany: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      project: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    access = {
      assertOrganizationMember: jest.fn(),
      assertProjectAccess: jest.fn(),
    };
    service = new ProjectsService(
      prisma as unknown as PrismaService,
      access as unknown as AccessService,
      { record: jest.fn() } as unknown as ActivitiesService,
    );
  });

  it('creates a project with an OWNER membership, board, and 6 columns', async () => {
    tx.project.create.mockResolvedValue({
      id: 'p1',
      name: 'Website',
      board: { id: 'b1' },
    });
    tx.project.findUniqueOrThrow.mockResolvedValue({ id: 'p1' });
    tx.column.createMany.mockResolvedValue({ count: 6 });

    await service.create('u1', { name: 'Website', organizationId: 'org1' });

    expect(access.assertOrganizationMember).toHaveBeenCalledWith('u1', 'org1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    const createCalls = tx.project.create.mock.calls as unknown as Array<
      [ProjectCreateArgs]
    >;
    const createArgs = createCalls[0]?.[0];
    expect(createArgs?.data.board.create.name).toBe('Main Board');
    expect(createArgs?.data.projectMembers.create).toEqual({
      userId: 'u1',
      role: ProjectRole.OWNER,
    });

    const columnArgs = tx.column.createMany.mock.calls[0]?.[0];
    expect(columnArgs?.data).toHaveLength(6);
    expect(columnArgs?.data.map((column) => column.name)).toEqual(
      DEFAULT_COLUMNS,
    );
    expect(columnArgs?.data.map((column) => column.position)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    expect(
      columnArgs?.data.every(
        (column) => column.projectId === 'p1' && column.boardId === 'b1',
      ),
    ).toBe(true);
  });

  it('requires organization membership before creating', async () => {
    access.assertOrganizationMember.mockRejectedValue(new Error('forbidden'));

    await expect(
      service.create('u1', { name: 'Website', organizationId: 'org1' }),
    ).rejects.toThrow('forbidden');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lists active projects by default and archived projects explicitly', async () => {
    prisma.project.findMany.mockResolvedValue([]);

    await service.findAll('u1', 'org1');
    await service.findAll('u1', 'org1', true);

    const activeCall = prisma.project.findMany.mock.calls[0]?.[0];
    expect(activeCall?.where.organizationId).toBe('org1');
    expect(activeCall?.where.archivedAt).toBeNull();

    const archivedCall = prisma.project.findMany.mock.calls[1]?.[0];
    expect(archivedCall?.where.organizationId).toBe('org1');
    expect(archivedCall?.where.archivedAt).toEqual({ not: null });
  });

  it('enforces project access on update and archive', async () => {
    tx.project.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 'p1',
        name: 'Before',
        description: null,
        archivedAt: null,
      })
      .mockResolvedValueOnce({
        id: 'p1',
        name: 'Renamed',
        description: null,
        archivedAt: null,
      });
    tx.project.update
      .mockResolvedValueOnce({
        id: 'p1',
        name: 'Renamed',
        description: null,
      })
      .mockResolvedValueOnce({
        id: 'p1',
        name: 'Renamed',
        archivedAt: new Date(),
      });

    await service.update('u1', 'p1', { name: 'Renamed' });
    await service.archive('u1', 'p1');

    expect(access.assertProjectAccess).toHaveBeenCalledTimes(2);

    const updateCalls = tx.project.update.mock.calls as unknown as Array<
      [ProjectUpdateArgs]
    >;
    const updateCall = updateCalls[0]?.[0];
    expect(updateCall?.data).toEqual({ name: 'Renamed' });
    expect(updateCall?.include?.organization).toBe(true);
    expect(updateCall?.include?.projectMembers).toBeDefined();

    const archiveCall = updateCalls[1]?.[0];
    expect(archiveCall?.data.archivedAt).toBeInstanceOf(Date);
  });
});
