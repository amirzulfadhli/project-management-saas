import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProjectColumnDto,
  UpdateProjectColumnDto,
} from './dto/project-column.dto';

const projectColumnSelect = {
  id: true,
  name: true,
  projectId: true,
  boardId: true,
  position: true,
} satisfies Prisma.ColumnSelect;

@Injectable()
export class ProjectColumnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async findAll(userId: string, projectId: string) {
    await this.access.assertProjectAccess(userId, projectId);
    const board = await this.prisma.board.findUnique({
      where: { projectId },
      select: { id: true },
    });

    if (!board) {
      throw new ConflictException('Project does not have a board');
    }

    return this.prisma.column.findMany({
      where: { projectId, boardId: board.id },
      select: projectColumnSelect,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
  }

  async create(userId: string, projectId: string, dto: CreateProjectColumnDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.assertProjectOwnerAuthority(userId, projectId, tx);
      const boards = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Board" WHERE "projectId" = ${projectId} FOR UPDATE`,
      );
      const board = boards[0];
      if (!board) {
        throw new ConflictException('Project does not have a board');
      }

      const lastPosition = await tx.column.aggregate({
        where: { projectId },
        _max: { position: true },
      });
      const position = (lastPosition._max.position ?? -1) + 1;

      try {
        return await tx.column.create({
          data: {
            name: dto.name,
            position,
            projectId,
            boardId: board.id,
          },
          select: projectColumnSelect,
        });
      } catch (error: unknown) {
        if (this.hasPrismaCode(error, 'P2002')) {
          throw new ConflictException(
            'Column position changed; retry the request',
          );
        }
        throw error;
      }
    });
  }

  async update(
    userId: string,
    projectId: string,
    columnId: string,
    dto: UpdateProjectColumnDto,
  ) {
    return this.withLockedColumn(userId, projectId, columnId, async (tx) =>
      tx.column.update({
        where: { id: columnId },
        data: { name: dto.name },
        select: projectColumnSelect,
      }),
    );
  }

  async remove(userId: string, projectId: string, columnId: string) {
    await this.withLockedColumn(userId, projectId, columnId, async (tx) => {
      const taskCount = await tx.task.count({ where: { columnId } });
      if (taskCount > 0) {
        throw new ConflictException(
          'Column cannot be deleted while it contains tasks',
        );
      }

      try {
        await tx.column.delete({ where: { id: columnId } });
      } catch (error: unknown) {
        if (this.hasPrismaCode(error, 'P2003')) {
          throw new ConflictException(
            'Column cannot be deleted while it contains tasks',
          );
        }
        throw error;
      }
    });
  }

  private async withLockedColumn<T>(
    userId: string,
    projectId: string,
    columnId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await this.access.assertProjectOwnerAuthority(userId, projectId, tx);
      const columns = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT c."id"
          FROM "Column" c
          INNER JOIN "Board" b ON b."id" = c."boardId"
          WHERE c."id" = ${columnId}
            AND c."projectId" = ${projectId}
            AND b."projectId" = ${projectId}
          FOR UPDATE OF c
        `,
      );

      if (columns.length === 0) {
        throw new NotFoundException('Column not found');
      }

      return operation(tx);
    });
  }

  private hasPrismaCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === code
    );
  }
}
