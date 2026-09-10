import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RealtimeService } from '../realtime/realtime.service';
import { RealtimeEventType } from '../realtime/realtime.types';
import { AttachmentsService } from './attachments.service';
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  contentDisposition,
  validateAttachmentFile,
} from './attachment-policy';
import {
  attachmentIdSchema,
  attachmentProjectIdSchema,
  attachmentTaskIdSchema,
  emptyUploadBodySchema,
  listAttachmentsQuerySchema,
  type ListAttachmentsQueryDto,
} from './dto/attachment.dto';

const uploadInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES, files: 1, fields: 0 },
});

@UseGuards(AuthGuard)
@Controller('api/projects/:projectId/attachments')
export class ProjectAttachmentsController {
  constructor(
    private readonly attachments: AttachmentsService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(attachmentProjectIdSchema))
    projectId: string,
    @Query(new ZodValidationPipe(listAttachmentsQuerySchema))
    query: ListAttachmentsQueryDto,
  ) {
    return this.attachments.listProject(user.id, projectId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(uploadInterceptor)
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(attachmentProjectIdSchema))
    projectId: string,
    @Body(new ZodValidationPipe(emptyUploadBodySchema))
    _body: Record<string, never>,
    @UploadedFile() upload: Express.Multer.File | undefined,
  ) {
    const attachment = await this.attachments.uploadProject(
      user.id,
      projectId,
      validateAttachmentFile(upload),
    );
    await this.realtime.publish({
      projectId,
      type: RealtimeEventType.ATTACHMENT_CREATED,
      entity: 'attachment',
      entityId: attachment.id,
      actorId: user.id,
    });
    return attachment;
  }

  @Get(':attachmentId/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(attachmentProjectIdSchema))
    projectId: string,
    @Param('attachmentId', new ZodValidationPipe(attachmentIdSchema))
    attachmentId: string,
    @Res() response: Response,
  ) {
    const { attachment, contents } = await this.attachments.downloadProject(
      user.id,
      projectId,
      attachmentId,
    );
    sendAttachment(
      response,
      attachment.originalName,
      attachment.mimeType,
      contents,
    );
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(attachmentProjectIdSchema))
    projectId: string,
    @Param('attachmentId', new ZodValidationPipe(attachmentIdSchema))
    attachmentId: string,
  ) {
    const attachment = await this.attachments.removeProject(
      user.id,
      projectId,
      attachmentId,
    );
    await this.realtime.publish({
      projectId,
      type: RealtimeEventType.ATTACHMENT_DELETED,
      entity: 'attachment',
      entityId: attachment.id,
      actorId: user.id,
    });
  }
}

@UseGuards(AuthGuard)
@Controller('api/tasks/:taskId/attachments')
export class TaskAttachmentsController {
  constructor(
    private readonly attachments: AttachmentsService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ZodValidationPipe(attachmentTaskIdSchema))
    taskId: string,
    @Query(new ZodValidationPipe(listAttachmentsQuerySchema))
    query: ListAttachmentsQueryDto,
  ) {
    return this.attachments.listTask(user.id, taskId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(uploadInterceptor)
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ZodValidationPipe(attachmentTaskIdSchema))
    taskId: string,
    @Body(new ZodValidationPipe(emptyUploadBodySchema))
    _body: Record<string, never>,
    @UploadedFile() upload: Express.Multer.File | undefined,
  ) {
    const attachment = await this.attachments.uploadTask(
      user.id,
      taskId,
      validateAttachmentFile(upload),
    );
    await this.realtime.publish({
      projectId: attachment.projectId,
      taskId,
      type: RealtimeEventType.ATTACHMENT_CREATED,
      entity: 'attachment',
      entityId: attachment.id,
      actorId: user.id,
    });
    return attachment;
  }

  @Get(':attachmentId/download')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ZodValidationPipe(attachmentTaskIdSchema))
    taskId: string,
    @Param('attachmentId', new ZodValidationPipe(attachmentIdSchema))
    attachmentId: string,
    @Res() response: Response,
  ) {
    const { attachment, contents } = await this.attachments.downloadTask(
      user.id,
      taskId,
      attachmentId,
    );
    sendAttachment(
      response,
      attachment.originalName,
      attachment.mimeType,
      contents,
    );
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ZodValidationPipe(attachmentTaskIdSchema))
    taskId: string,
    @Param('attachmentId', new ZodValidationPipe(attachmentIdSchema))
    attachmentId: string,
  ) {
    const attachment = await this.attachments.removeTask(
      user.id,
      taskId,
      attachmentId,
    );
    await this.realtime.publish({
      projectId: attachment.projectId,
      taskId,
      type: RealtimeEventType.ATTACHMENT_DELETED,
      entity: 'attachment',
      entityId: attachment.id,
      actorId: user.id,
    });
  }
}

function sendAttachment(
  response: Response,
  originalName: string,
  mimeType: string,
  contents: Buffer,
): void {
  response.setHeader('Content-Type', mimeType);
  response.setHeader('Content-Length', String(contents.length));
  response.setHeader('Content-Disposition', contentDisposition(originalName));
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'private, no-store');
  response.status(HttpStatus.OK).send(contents);
}
