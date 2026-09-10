import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { AccessService } from '../access/access.service';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityEvent } from '../activities/activity.types';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { NotificationDelivery } from '../notifications/notification.types';
import {
  CreateTaskDto,
  ListTasksQueryDto,
  MoveTaskDto,
  UpdateTaskDto,
} from './dto/task.dto';

type TaskDatabaseClient = PrismaService | Prisma.TransactionClient;

const taskInclude = {
  assignee: { select: { id: true, name: true, email: true, image: true } },
  reporter: { select: { id: true, name: true, email: true, image: true } },
  column: { select: { id: true, name: true, position: true } },
  project: { select: { id: true, name: true } },
} satisfies Prisma.TaskInclude;

type TaskDetail = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

const accessibleProjectWhere = (userId: string): Prisma.ProjectWhereInput => ({
  OR: [
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
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateTaskDto) {
    let notificationDeliveries: NotificationDelivery[] = [];
    try {
      const task = await this.prisma.$transaction(async (tx) => {
        await this.lockProject(tx, dto.projectId);
        await this.access.assertProjectAccess(userId, dto.projectId, tx);
        await this.access.assertColumnInProject(
          dto.columnId,
          dto.projectId,
          tx,
        );
        if (dto.assigneeId) {
          await this.assertAssigneeAccess(dto.assigneeId, dto.projectId, tx);
        }

        const lastTask = await tx.task.findFirst({
          where: { columnId: dto.columnId },
          orderBy: [{ position: 'desc' }, { id: 'desc' }],
          select: { position: true },
        });
        const task = await tx.task.create({
          data: {
            title: dto.title,
            description: dto.description ?? null,
            projectId: dto.projectId,
            columnId: dto.columnId,
            position: (lastTask?.position ?? -1) + 1,
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
        notificationDeliveries = await this.notifications.recordTaskAssignment(
          tx,
          {
            actorId: userId,
            projectId: task.projectId,
            projectName: task.project.name,
            taskId: task.id,
            taskTitle: task.title,
            beforeAssigneeId: null,
            afterAssigneeId: task.assigneeId,
          },
        );
        return task;
      });
      await this.notifications.publishCreated(notificationDeliveries);
      return task;
    } catch (error) {
      this.rethrowPositionConflict(error);
    }
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
        where: { ...accessibleProjectWhere(userId), archivedAt: null },
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
      orderBy: [
        { projectId: 'asc' },
        { column: { position: 'asc' } },
        { position: 'asc' },
        { id: 'asc' },
      ],
    });
  }

  async findOne(userId: string, id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: taskInclude,
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.access.assertProjectAccess(userId, task.projectId);
    return task;
  }

  async update(userId: string, id: string, dto: UpdateTaskDto) {
    let notificationDeliveries: NotificationDelivery[] = [];
    try {
      const task = await this.prisma.$transaction(async (tx) => {
        const before = await this.lockTaskForOrdering(tx, id);
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

        if (dto.columnId && dto.columnId !== before.columnId) {
          const targetCount = await tx.task.count({
            where: { columnId: dto.columnId },
          });
          await this.repositionTask(tx, before, dto.columnId, targetCount);
        }

        const data: Prisma.TaskUpdateInput = {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.assigneeId !== undefined && {
            assignee: dto.assigneeId
              ? { connect: { id: dto.assigneeId } }
              : { disconnect: true },
          }),
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
        };
        const updated = await tx.task.update({
          where: { id },
          data,
          include: taskInclude,
        });
        await this.recordTaskChanges(tx, userId, before, updated, dto);
        notificationDeliveries = await this.notifications.recordTaskAssignment(
          tx,
          {
            actorId: userId,
            projectId: updated.projectId,
            projectName: updated.project.name,
            taskId: updated.id,
            taskTitle: updated.title,
            beforeAssigneeId: before.assigneeId,
            afterAssigneeId: updated.assigneeId,
          },
        );
        return updated;
      });
      await this.notifications.publishCreated(notificationDeliveries);
      return task;
    } catch (error) {
      this.rethrowPositionConflict(error);
    }
  }

  async move(userId: string, id: string, dto: MoveTaskDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await this.lockTaskForOrdering(tx, id);
        await this.access.assertProjectAccess(userId, before.projectId, tx);
        await this.access.assertColumnInProject(
          dto.columnId,
          before.projectId,
          tx,
        );
        const changed = await this.repositionTask(
          tx,
          before,
          dto.columnId,
          dto.targetIndex,
        );
        if (!changed) return before;

        const moved = await tx.task.findUniqueOrThrow({
          where: { id },
          include: taskInclude,
        });
        if (before.columnId !== moved.columnId) {
          await this.activities.record(tx, {
            type: ActivityEvent.TASK_MOVED,
            description: `Moved Task "${moved.title}" to "${moved.column.name}"`,
            projectId: moved.projectId,
            taskId: moved.id,
            userId,
            metadata: {
              before: { id: before.column.id, name: before.column.name },
              after: { id: moved.column.id, name: moved.column.name },
            },
          });
        }
        return moved;
      });
    } catch (error) {
      this.rethrowPositionConflict(error);
    }
  }

  async remove(userId: string, id: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const task = await this.lockTaskForOrdering(tx, id);
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
        await tx.issue.deleteMany({ where: { taskId: id } });
        await tx.task.delete({ where: { id } });
        await this.normalizeColumn(tx, task.columnId, task.projectId);
        return { projectId: task.projectId };
      });
    } catch (error) {
      this.rethrowPositionConflict(error);
    }
  }

  private async assertAssigneeAccess(
    assigneeId: string,
    projectId: string,
    database: TaskDatabaseClient = this.prisma,
  ): Promise<void> {
    const accessibleProject = await database.project.findFirst({
      where: { id: projectId, ...accessibleProjectWhere(assigneeId) },
      select: { id: true },
    });
    if (!accessibleProject) {
      throw new BadRequestException(
        'Assignee does not have access to this project',
      );
    }
  }

  private async lockTaskForOrdering(
    tx: Prisma.TransactionClient,
    taskId: string,
  ): Promise<TaskDetail> {
    const identity = await tx.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    if (!identity) throw new NotFoundException('Task not found');
    await this.lockProject(tx, identity.projectId);
    await this.lockTask(tx, taskId);
    return tx.task.findUniqueOrThrow({
      where: { id: taskId },
      include: taskInclude,
    });
  }

  private async lockProject(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new NotFoundException('Project not found');
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

  private async repositionTask(
    tx: Prisma.TransactionClient,
    task: TaskDetail,
    targetColumnId: string,
    targetIndex: number,
  ): Promise<boolean> {
    const sourceRows = await this.columnOrder(
      tx,
      task.columnId,
      task.projectId,
    );
    const sourceIndex = sourceRows.findIndex((row) => row.id === task.id);
    if (sourceIndex < 0)
      throw new ConflictException('Task ordering state is inconsistent');

    const sourceIds = sourceRows.map((row) => row.id);
    sourceIds.splice(sourceIndex, 1);
    const sameColumn = task.columnId === targetColumnId;
    const targetRows = sameColumn
      ? sourceRows
      : await this.columnOrder(tx, targetColumnId, task.projectId);
    const targetIds = sameColumn ? sourceIds : targetRows.map((row) => row.id);
    if (targetIndex > targetIds.length) {
      throw new BadRequestException(
        'targetIndex exceeds the destination Column length',
      );
    }
    if (sameColumn && targetIndex === sourceIndex) return false;

    targetIds.splice(targetIndex, 0, task.id);
    const orders = sameColumn
      ? new Map([[task.columnId, targetIds]])
      : new Map([
          [task.columnId, sourceIds],
          [targetColumnId, targetIds],
        ]);
    await this.persistOrders(tx, orders);
    return true;
  }

  private async normalizeColumn(
    tx: Prisma.TransactionClient,
    columnId: string,
    projectId: string,
  ): Promise<void> {
    const rows = await this.columnOrder(tx, columnId, projectId);
    if (rows.every((row, index) => row.position === index)) return;
    await this.persistOrders(
      tx,
      new Map([[columnId, rows.map((row) => row.id)]]),
    );
  }

  private async columnOrder(
    tx: Prisma.TransactionClient,
    columnId: string,
    projectId: string,
  ): Promise<Array<{ id: string; position: number; projectId: string }>> {
    const rows = await tx.task.findMany({
      where: { columnId },
      select: { id: true, position: true, projectId: true },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    if (rows.some((row) => row.projectId !== projectId)) {
      throw new ConflictException(
        'Task and Column Project scope is inconsistent',
      );
    }
    return rows;
  }

  private async persistOrders(
    tx: Prisma.TransactionClient,
    orders: Map<string, string[]>,
  ): Promise<void> {
    const columnIds = [...orders.keys()];
    const current = await tx.task.findMany({
      where: { columnId: { in: columnIds } },
      select: { position: true },
    });
    if (current.length === 0) return;

    const maxPosition = Math.max(...current.map((row) => row.position));
    const temporaryOffset = maxPosition + current.length + 1;
    await tx.$executeRaw(
      Prisma.sql`UPDATE "Task"
        SET "position" = "position" + ${temporaryOffset}
        WHERE "columnId" IN (${Prisma.join(columnIds)})`,
    );
    for (const [columnId, taskIds] of orders) {
      for (const [position, taskId] of taskIds.entries()) {
        await tx.$executeRaw(
          Prisma.sql`UPDATE "Task"
            SET "columnId" = ${columnId}, "position" = ${position}
            WHERE "id" = ${taskId}`,
        );
      }
    }
  }

  private rethrowPositionConflict(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Task order changed concurrently; refresh and try again',
      );
    }
    throw error;
  }

  private async recordTaskChanges(
    tx: Prisma.TransactionClient,
    userId: string,
    before: TaskDetail,
    after: TaskDetail,
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
