import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { Prisma } from '../../generated/prisma/client';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityEvent } from '../activities/activity.types';

type TaskDatabaseClient = PrismaService | Prisma.TransactionClient;

const taskInclude = {
  assignee: { select: { id: true, name: true, email: true, image: true } },
  reporter: { select: { id: true, name: true, email: true, image: true } },
  column: { select: { id: true, name: true, position: true } },
  project: { select: { id: true, name: true } },
} satisfies Prisma.TaskInclude;

const accessibleProjectWhere = (userId: string): Prisma.ProjectWhereInput => ({
  OR: [
    { organization: { ownerId: userId } },
    { organization: { members: { some: { userId } } } },
    { projectMembers: { some: { userId } } },
  ],
});

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
  ) {}

  async create(userId: string, dto: CreateTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.assertProjectAccess(userId, dto.projectId, tx);
      await this.access.assertColumnInProject(dto.columnId, dto.projectId, tx);
      if (dto.assigneeId) {
        await this.assertAssigneeAccess(dto.assigneeId, dto.projectId, tx);
      }

      const task = await tx.task.create({
        data: {
          title: dto.title,
          description: dto.description ?? null,
          projectId: dto.projectId,
          columnId: dto.columnId,
          reporterId: userId,
          assigneeId: dto.assigneeId ?? null,
          priority: dto.priority ?? 1,
          status: dto.status ?? 'todo',
          dueDate: dto.dueDate ?? null,
          estimatedTime: dto.estimatedTime ?? null,
          startDate: dto.startDate ?? null,
        },
        include: taskInclude,
      });
      await this.activities.record(tx, {
        type: ActivityEvent.TASK_CREATED,
        description: `Created Task "${task.title}"`,
        projectId: task.projectId,
        taskId: task.id,
        userId,
        metadata: {
          title: task.title,
          column: { id: task.column.id, name: task.column.name },
          status: task.status,
          priority: task.priority,
          assignee: task.assignee
            ? { id: task.assignee.id, name: task.assignee.name }
            : null,
        },
      });
      return task;
    });
  }

  async findAll(userId: string, filter: ListTasksQueryDto) {
    const where: Prisma.TaskWhereInput = {};

    if (filter.projectId) {
      await this.access.assertProjectAccess(userId, filter.projectId);
      where.projectId = filter.projectId;

      if (filter.columnId) {
        await this.access.assertColumnInProject(
          filter.columnId,
          filter.projectId,
        );
      }
    } else {
      const projects = await this.prisma.project.findMany({
        where: {
          ...accessibleProjectWhere(userId),
          archivedAt: null,
        },
        select: { id: true },
      });
      where.projectId = { in: projects.map((project) => project.id) };
    }

    if (filter.columnId) where.columnId = filter.columnId;
    if (filter.assigneeId) where.assigneeId = filter.assigneeId;
    if (filter.priority !== undefined) where.priority = filter.priority;
    if (filter.status) where.status = filter.status;

    return this.prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: taskInclude,
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.access.assertProjectAccess(userId, task.projectId);
    return task;
  }

  async update(userId: string, id: string, dto: UpdateTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockTask(tx, id);
      const before = await tx.task.findUnique({
        where: { id },
        include: taskInclude,
      });
      if (!before) throw new NotFoundException('Task not found');

      await this.access.assertProjectAccess(userId, before.projectId, tx);
      if (dto.columnId) {
        await this.access.assertColumnInProject(
          dto.columnId,
          before.projectId,
          tx,
        );
      }
      if (dto.assigneeId) {
        await this.assertAssigneeAccess(dto.assigneeId, before.projectId, tx);
      }

      const updated = await tx.task.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.columnId !== undefined && { columnId: dto.columnId }),
          ...(dto.assigneeId !== undefined && { assigneeId: dto.assigneeId }),
          ...(dto.priority !== undefined && { priority: dto.priority }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.dueDate !== undefined && { dueDate: dto.dueDate }),
          ...(dto.estimatedTime !== undefined && {
            estimatedTime: dto.estimatedTime,
          }),
          ...(dto.actualTime !== undefined && { actualTime: dto.actualTime }),
          ...(dto.startDate !== undefined && { startDate: dto.startDate }),
          ...(dto.completedAt !== undefined && {
            completedAt: dto.completedAt,
          }),
        },
        include: taskInclude,
      });

      await this.recordTaskChanges(tx, userId, before, updated, dto);
      return updated;
    });
  }

  async remove(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockTask(tx, id);
      const task = await tx.task.findUnique({
        where: { id },
        include: taskInclude,
      });
      if (!task) throw new NotFoundException('Task not found');
      await this.access.assertProjectAccess(userId, task.projectId, tx);

      await this.activities.record(tx, {
        type: ActivityEvent.TASK_DELETED,
        description: `Deleted Task "${task.title}"`,
        projectId: task.projectId,
        taskId: task.id,
        userId,
        metadata: {
          taskId: task.id,
          title: task.title,
          column: { id: task.column.id, name: task.column.name },
          status: task.status,
          priority: task.priority,
          assignee: task.assignee
            ? { id: task.assignee.id, name: task.assignee.name }
            : null,
        },
      });
      await tx.task.delete({ where: { id } });
    });
  }

  private async assertAssigneeAccess(
    assigneeId: string,
    projectId: string,
    database: TaskDatabaseClient = this.prisma,
  ): Promise<void> {
    const accessibleProject = await database.project.findFirst({
      where: {
        id: projectId,
        ...accessibleProjectWhere(assigneeId),
      },
      select: { id: true },
    });

    if (!accessibleProject) {
      throw new BadRequestException(
        'Assignee does not have access to this project',
      );
    }
  }

  private async lockTask(
    tx: Prisma.TransactionClient,
    taskId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "Task" WHERE "id" = ${taskId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new NotFoundException('Task not found');
  }

  private async recordTaskChanges(
    tx: Prisma.TransactionClient,
    userId: string,
    before: Prisma.TaskGetPayload<{ include: typeof taskInclude }>,
    after: Prisma.TaskGetPayload<{ include: typeof taskInclude }>,
    dto: UpdateTaskDto,
  ): Promise<void> {
    const base = { projectId: after.projectId, taskId: after.id, userId };
    if (dto.title !== undefined && before.title !== after.title) {
      await this.activities.record(tx, {
        ...base,
        type: ActivityEvent.TASK_RENAMED,
        description: `Renamed Task "${before.title}" to "${after.title}"`,
        metadata: { before: before.title, after: after.title },
      });
    }
    if (dto.columnId !== undefined && before.columnId !== after.columnId) {
      await this.activities.record(tx, {
        ...base,
        type: ActivityEvent.TASK_MOVED,
        description: `Moved Task "${after.title}" to "${after.column.name}"`,
        metadata: {
          before: { id: before.column.id, name: before.column.name },
          after: { id: after.column.id, name: after.column.name },
        },
      });
    }
    if (dto.status !== undefined && before.status !== after.status) {
      await this.activities.record(tx, {
        ...base,
        type: ActivityEvent.TASK_STATUS_CHANGED,
        description: `Changed status for Task "${after.title}"`,
        metadata: { before: before.status, after: after.status },
      });
    }
    if (
      dto.assigneeId !== undefined &&
      before.assigneeId !== after.assigneeId
    ) {
      await this.activities.record(tx, {
        ...base,
        type: ActivityEvent.TASK_ASSIGNEE_CHANGED,
        description: `Changed assignee for Task "${after.title}"`,
        metadata: {
          before: before.assignee
            ? { id: before.assignee.id, name: before.assignee.name }
            : null,
          after: after.assignee
            ? { id: after.assignee.id, name: after.assignee.name }
            : null,
        },
      });
    }
    if (dto.priority !== undefined && before.priority !== after.priority) {
      await this.activities.record(tx, {
        ...base,
        type: ActivityEvent.TASK_PRIORITY_CHANGED,
        description: `Changed priority for Task "${after.title}"`,
        metadata: { before: before.priority, after: after.priority },
      });
    }

    const genericChanges: Record<
      string,
      { before: string | number | null; after: string | number | null }
    > = {};
    if (
      dto.description !== undefined &&
      before.description !== after.description
    ) {
      genericChanges.description = {
        before: before.description?.length ?? null,
        after: after.description?.length ?? null,
      };
    }
    this.addGenericChange(
      genericChanges,
      'dueDate',
      dto.dueDate,
      before.dueDate,
      after.dueDate,
    );
    this.addGenericChange(
      genericChanges,
      'estimatedTime',
      dto.estimatedTime,
      before.estimatedTime,
      after.estimatedTime,
    );
    this.addGenericChange(
      genericChanges,
      'actualTime',
      dto.actualTime,
      before.actualTime,
      after.actualTime,
    );
    this.addGenericChange(
      genericChanges,
      'startDate',
      dto.startDate,
      before.startDate,
      after.startDate,
    );
    this.addGenericChange(
      genericChanges,
      'completedAt',
      dto.completedAt,
      before.completedAt,
      after.completedAt,
    );
    if (Object.keys(genericChanges).length > 0) {
      await this.activities.record(tx, {
        ...base,
        type: ActivityEvent.TASK_UPDATED,
        description: `Updated Task "${after.title}"`,
        metadata: { changes: genericChanges },
      });
    }
  }

  private addGenericChange(
    changes: Record<
      string,
      { before: string | number | null; after: string | number | null }
    >,
    field: string,
    supplied: unknown,
    before: string | number | Date | null,
    after: string | number | Date | null,
  ): void {
    if (supplied === undefined) return;
    const beforeValue = before instanceof Date ? before.toISOString() : before;
    const afterValue = after instanceof Date ? after.toISOString() : after;
    if (beforeValue !== afterValue) {
      changes[field] = { before: beforeValue, after: afterValue };
    }
  }
}
