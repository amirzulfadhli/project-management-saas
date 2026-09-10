import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CommentsService } from './comments.service';
import {
  commentIdSchema,
  commentTaskIdSchema,
  createCommentSchema,
  CreateCommentDto,
  listCommentsQuerySchema,
  ListCommentsQueryDto,
  updateCommentSchema,
  UpdateCommentDto,
} from './dto/comment.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { RealtimeEventType } from '../realtime/realtime.types';

@UseGuards(AuthGuard)
@Controller('api/tasks/:taskId/comments')
export class CommentsController {
  constructor(
    private readonly commentsService: CommentsService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ZodValidationPipe(commentTaskIdSchema))
    taskId: string,
    @Query(new ZodValidationPipe(listCommentsQuerySchema))
    query: ListCommentsQueryDto,
  ) {
    return this.commentsService.findAll(user.id, taskId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ZodValidationPipe(commentTaskIdSchema))
    taskId: string,
    @Body(new ZodValidationPipe(createCommentSchema)) dto: CreateCommentDto,
  ) {
    const comment = await this.commentsService.create(user.id, taskId, dto);
    await this.realtime.publishForTask({
      type: RealtimeEventType.COMMENT_CREATED,
      entity: 'comment',
      entityId: comment.id,
      taskId,
      actorId: user.id,
    });
    return comment;
  }

  @Patch(':commentId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ZodValidationPipe(commentTaskIdSchema))
    taskId: string,
    @Param('commentId', new ZodValidationPipe(commentIdSchema))
    commentId: string,
    @Body(new ZodValidationPipe(updateCommentSchema)) dto: UpdateCommentDto,
  ) {
    const comment = await this.commentsService.update(
      user.id,
      taskId,
      commentId,
      dto,
    );
    await this.realtime.publishForTask({
      type: RealtimeEventType.COMMENT_UPDATED,
      entity: 'comment',
      entityId: commentId,
      taskId,
      actorId: user.id,
    });
    return comment;
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ZodValidationPipe(commentTaskIdSchema))
    taskId: string,
    @Param('commentId', new ZodValidationPipe(commentIdSchema))
    commentId: string,
  ) {
    await this.commentsService.remove(user.id, taskId, commentId);
    await this.realtime.publishForTask({
      type: RealtimeEventType.COMMENT_DELETED,
      entity: 'comment',
      entityId: commentId,
      taskId,
      actorId: user.id,
    });
  }
}
