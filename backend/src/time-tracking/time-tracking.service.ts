import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrganizationRole,
  Prisma,
  ProjectRole,
} from '../../generated/prisma/client';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateManualTimeEntryDto,
  StartTimerDto,
  TimeEntryListQuery,
} from './dto/time-tracking.dto';

const entrySelect = {
  id: true,
  projectId: true,
  taskId: true,
  userId: true,
  startedAt: true,
  endedAt: true,
  durationSeconds: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  task: { select: { id: true, title: true, projectId: true } },
} satisfies Prisma.TimeEntrySelect;

type TimeTransaction = Prisma.TransactionClient;

@Injectable()
export class TimeTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async start(userId: string, taskId: string, dto: StartTimerDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const task = await this.resolveTask(userId, taskId, tx);
        await this.lockUser(tx, userId);
        const active = await tx.timeEntry.findFirst({
          where: { userId, activeMarker: true },
          select: { id: true, taskId: true },
        });
        if (active) {
          throw new ConflictException(
            active.taskId === taskId
              ? 'A timer is already running on this Task'
              : 'Stop your active timer before starting another one',
          );
        }
        return tx.timeEntry.create({
          data: {
            projectId: task.projectId,
            taskId,
            userId,
            startedAt: new Date(),
            activeMarker: true,
            note: dto.note,
          },
          select: entrySelect,
        });
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Stop your active timer before starting another one',
        );
      }
      throw error;
    }
  }

  stop(userId: string, taskId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "TimeLog"
        WHERE "userId" = ${userId} AND "activeMarker" = TRUE
        FOR UPDATE
      `);
      const id = rows[0]?.id;
      if (!id) throw new NotFoundException('No active timer was found');
      const active = await tx.timeEntry.findUniqueOrThrow({
        where: { id },
        select: { taskId: true, startedAt: true },
      });
      if (active.taskId !== taskId) {
        throw new ConflictException(
          'Your active timer belongs to another Task',
        );
      }
      let endedAt = new Date();
      if (endedAt <= active.startedAt) {
        endedAt = new Date(active.startedAt.getTime() + 1);
      }
      const durationSeconds = Math.max(
        1,
        Math.ceil((endedAt.getTime() - active.startedAt.getTime()) / 1000),
      );
      return tx.timeEntry.update({
        where: { id },
        data: { endedAt, durationSeconds, activeMarker: null },
        select: entrySelect,
      });
    });
  }

  createManual(userId: string, taskId: string, dto: CreateManualTimeEntryDto) {
    return this.prisma.$transaction(async (tx) => {
      const task = await this.resolveTask(userId, taskId, tx);
      const durationSeconds = Math.floor(
        (dto.endedAt.getTime() - dto.startedAt.getTime()) / 1000,
      );
      return tx.timeEntry.create({
        data: {
          projectId: task.projectId,
          taskId,
          userId,
          startedAt: dto.startedAt,
          endedAt: dto.endedAt,
          durationSeconds,
          activeMarker: null,
          note: dto.note,
        },
        select: entrySelect,
      });
    });
  }

  async listTask(userId: string, taskId: string, query: TimeEntryListQuery) {
    const task = await this.resolveTask(userId, taskId, this.prisma);
    let cursor: { createdAt: Date; id: string } | null = null;
    if (query.cursor) {
      cursor = await this.prisma.timeEntry.findFirst({
        where: { id: query.cursor, taskId, userId },
        select: { createdAt: true, id: true },
      });
      if (!cursor) throw new NotFoundException('Time entry cursor not found');
    }
    const items = await this.prisma.timeEntry.findMany({
      where: {
        taskId,
        userId,
        ...(cursor && {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }),
      },
      select: entrySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const total = await this.prisma.timeEntry.aggregate({
      where: { taskId, endedAt: { not: null } },
      _sum: { durationSeconds: true },
    });
    const hasMore = items.length > query.limit;
    if (hasMore) items.pop();
    return {
      taskId: task.id,
      totalSeconds: total._sum.durationSeconds ?? 0,
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async projectSummary(userId: string, projectId: string) {
    await this.access.assertProjectAccess(userId, projectId);
    const [taskGroups, userTotal, project, userGroups] = await Promise.all([
      this.prisma.timeEntry.groupBy({
        by: ['taskId'],
        where: { projectId, endedAt: { not: null } },
        _sum: { durationSeconds: true },
      }),
      this.prisma.timeEntry.aggregate({
        where: { projectId, userId, endedAt: { not: null } },
        _sum: { durationSeconds: true },
      }),
      this.prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: {
          tasks: { select: { id: true, title: true } },
          organization: {
            select: {
              members: {
                where: { userId, role: OrganizationRole.OWNER },
                select: { id: true },
              },
            },
          },
          projectMembers: {
            where: { userId, role: ProjectRole.OWNER },
            select: { id: true },
          },
        },
      }),
      this.prisma.timeEntry.groupBy({
        by: ['userId'],
        where: { projectId, endedAt: { not: null } },
        _sum: { durationSeconds: true },
      }),
    ]);
    const taskById = new Map(project.tasks.map((task) => [task.id, task]));
    const tasks = taskGroups
      .map((group) => ({
        taskId: group.taskId,
        title: taskById.get(group.taskId)?.title ?? 'Deleted Task',
        totalSeconds: group._sum.durationSeconds ?? 0,
      }))
      .sort(
        (left, right) =>
          left.title.localeCompare(right.title) ||
          left.taskId.localeCompare(right.taskId),
      );
    const totalSeconds = tasks.reduce(
      (sum, task) => sum + task.totalSeconds,
      0,
    );
    const canViewUsers =
      project.organization.members.length > 0 ||
      project.projectMembers.length > 0;
    let users: Array<{
      userId: string;
      name: string;
      email: string;
      image: string | null;
      totalSeconds: number;
    }> | null = null;
    if (canViewUsers) {
      const identities = await this.prisma.user.findMany({
        where: { id: { in: userGroups.map((group) => group.userId) } },
        select: { id: true, name: true, email: true, image: true },
      });
      const identityById = new Map(identities.map((item) => [item.id, item]));
      users = userGroups
        .map((group) => {
          const identity = identityById.get(group.userId);
          return {
            userId: group.userId,
            name: identity?.name ?? 'Former user',
            email: identity?.email ?? '',
            image: identity?.image ?? null,
            totalSeconds: group._sum.durationSeconds ?? 0,
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name));
    }
    return {
      projectId,
      totalSeconds,
      currentUserSeconds: userTotal._sum.durationSeconds ?? 0,
      tasks,
      users,
    };
  }

  async active(userId: string) {
    const activeTimer = await this.prisma.timeEntry.findFirst({
      where: { userId, activeMarker: true },
      select: entrySelect,
    });
    return { activeTimer };
  }

  private async resolveTask(
    userId: string,
    taskId: string,
    database: PrismaService | TimeTransaction,
  ) {
    const task = await database.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true, title: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.access.assertProjectAccess(userId, task.projectId, database);
    return task;
  }

  private async lockUser(tx: TimeTransaction, userId: string): Promise<void> {
    const users = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE
    `);
    if (users.length === 0) throw new NotFoundException('User not found');
  }
}
