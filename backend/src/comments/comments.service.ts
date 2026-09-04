import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { AccessService } from '../access/access.service';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityEvent } from '../activities/activity.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCommentDto,
  ListCommentsQueryDto,
  UpdateCommentDto,
} from './dto/comment.dto';

const commentSelect = {
  id: true,
  taskId: true,
  parentId: true,
  content: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, email: true, image: true } },
} satisfies Prisma.CommentSelect;

type CommentRecord = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
  ) {}

  async findAll(userId: string, taskId: string, query: ListCommentsQueryDto) {
    await this.assertTaskAccess(userId, taskId, this.prisma);

    if (query.cursor) {
      const cursor = await this.prisma.comment.findFirst({
        where: { id: query.cursor, taskId },
        select: { id: true },
      });
      if (!cursor) throw new NotFoundException('Comment cursor not found');
    }

    const rows = await this.prisma.comment.findMany({
      where: { taskId },
      select: commentSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: page.map((comment) => this.toResponse(comment)),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  create(userId: string, taskId: string, dto: CreateCommentDto) {
    return this.prisma.$transaction(async (tx) => {
      const projectId = await this.assertTaskAccess(userId, taskId, tx);

      if (dto.parentId) {
        const parent = await tx.comment.findUnique({
          where: { id: dto.parentId },
          select: { taskId: true },
        });
        if (!parent || parent.taskId !== taskId) {
          throw new BadRequestException(
            'Parent comment must belong to this task',
          );
        }
      }

      const comment = await tx.comment.create({
        data: {
          content: dto.content,
          taskId,
          authorId: userId,
          parentId: dto.parentId ?? null,
        },
        select: commentSelect,
      });
      await this.activities.record(tx, {
        type: ActivityEvent.COMMENT_CREATED,
        description: 'Added a Comment',
        projectId,
        taskId,
        userId,
        metadata: {
          commentId: comment.id,
          parentId: comment.parentId,
          contentLength: comment.content.length,
        },
      });
      return this.toResponse(comment);
    });
  }

  update(
    userId: string,
    taskId: string,
    commentId: string,
    dto: UpdateCommentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const projectId = await this.assertTaskAccess(userId, taskId, tx);
      await this.lockComment(tx, taskId, commentId);
      const comment = await this.findComment(tx, taskId, commentId);

      if (comment.author.id !== userId) {
        throw new ForbiddenException('Only the comment author may edit it');
      }
      if (comment.deletedAt) {
        throw new ConflictException('Deleted comments cannot be edited');
      }
      if (comment.content === dto.content) return this.toResponse(comment);

      const updated = await tx.comment.update({
        where: { id: commentId },
        data: { content: dto.content },
        select: commentSelect,
      });
      await this.activities.record(tx, {
        type: ActivityEvent.COMMENT_UPDATED,
        description: 'Updated a Comment',
        projectId,
        taskId,
        userId,
        metadata: {
          commentId,
          previousContentLength: comment.content.length,
          newContentLength: updated.content.length,
        },
      });
      return this.toResponse(updated);
    });
  }

  async remove(userId: string, taskId: string, commentId: string) {
    await this.prisma.$transaction(async (tx) => {
      const projectId = await this.assertTaskAccess(userId, taskId, tx);
      await this.lockComment(tx, taskId, commentId);
      const comment = await this.findComment(tx, taskId, commentId);

      if (comment.author.id !== userId) {
        await this.access.assertProjectMembershipAdmin(userId, projectId, tx);
      }
      if (comment.deletedAt) return;

      await tx.comment.update({
        where: { id: commentId },
        data: { content: '', deletedAt: new Date() },
      });
      await this.activities.record(tx, {
        type: ActivityEvent.COMMENT_DELETED,
        description: 'Deleted a Comment',
        projectId,
        taskId,
        userId,
        metadata: {
          commentId,
          parentId: comment.parentId,
          contentLength: comment.content.length,
        },
      });
    });
  }

  private async assertTaskAccess(
    userId: string,
    taskId: string,
    database: PrismaService | Prisma.TransactionClient,
  ): Promise<string> {
    const task = await database.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.access.assertProjectAccess(userId, task.projectId, database);
    return task.projectId;
  }

  private async lockComment(
    tx: Prisma.TransactionClient,
    taskId: string,
    commentId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "Comment" WHERE "id" = ${commentId} AND "taskId" = ${taskId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new NotFoundException('Comment not found');
  }

  private async findComment(
    tx: Prisma.TransactionClient,
    taskId: string,
    commentId: string,
  ): Promise<CommentRecord> {
    const comment = await tx.comment.findFirst({
      where: { id: commentId, taskId },
      select: commentSelect,
    });
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }

  private toResponse(comment: CommentRecord) {
    return {
      ...comment,
      content: comment.deletedAt ? null : comment.content,
    };
  }
}
