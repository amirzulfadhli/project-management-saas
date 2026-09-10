import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { AccessService } from '../access/access.service';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityEvent } from '../activities/activity.types';
import { PrismaService } from '../prisma/prisma.service';
import type { ListAttachmentsQueryDto } from './dto/attachment.dto';
import { FILE_STORAGE, type FileStorage } from './file-storage';
import { isNotFound } from './local-file-storage';
import type { ValidatedAttachment } from './attachment-policy';

const attachmentSelect = {
  id: true,
  projectId: true,
  taskId: true,
  uploaderId: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
  uploader: { select: { id: true, name: true, email: true, image: true } },
} satisfies Prisma.FileSelect;

type AttachmentRecord = Prisma.FileGetPayload<{
  select: typeof attachmentSelect;
}>;

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async listProject(
    userId: string,
    projectId: string,
    query: ListAttachmentsQueryDto,
  ) {
    await this.access.assertProjectAccess(userId, projectId);
    return this.list({ projectId, taskId: null }, query);
  }

  async listTask(
    userId: string,
    taskId: string,
    query: ListAttachmentsQueryDto,
  ) {
    const projectId = await this.resolveTaskProject(
      userId,
      taskId,
      this.prisma,
    );
    return this.list({ projectId, taskId }, query);
  }

  async uploadProject(
    userId: string,
    projectId: string,
    file: ValidatedAttachment,
  ) {
    await this.access.assertProjectAccess(userId, projectId);
    return this.upload(userId, projectId, null, file);
  }

  async uploadTask(userId: string, taskId: string, file: ValidatedAttachment) {
    const projectId = await this.resolveTaskProject(
      userId,
      taskId,
      this.prisma,
    );
    return this.upload(userId, projectId, taskId, file);
  }

  async downloadProject(
    userId: string,
    projectId: string,
    attachmentId: string,
  ) {
    await this.access.assertProjectAccess(userId, projectId);
    return this.download({ id: attachmentId, projectId, taskId: null });
  }

  async downloadTask(userId: string, taskId: string, attachmentId: string) {
    const projectId = await this.resolveTaskProject(
      userId,
      taskId,
      this.prisma,
    );
    return this.download({ id: attachmentId, projectId, taskId });
  }

  async removeProject(userId: string, projectId: string, attachmentId: string) {
    await this.access.assertProjectAccess(userId, projectId);
    return this.remove(userId, { id: attachmentId, projectId, taskId: null });
  }

  async removeTask(userId: string, taskId: string, attachmentId: string) {
    const projectId = await this.resolveTaskProject(
      userId,
      taskId,
      this.prisma,
    );
    return this.remove(userId, { id: attachmentId, projectId, taskId });
  }

  private async list(
    scope: { projectId: string; taskId: string | null },
    query: ListAttachmentsQueryDto,
  ) {
    if (query.cursor) {
      const cursor = await this.prisma.file.findFirst({
        where: { id: query.cursor, ...scope },
        select: { id: true },
      });
      if (!cursor) throw new NotFoundException('Attachment cursor not found');
    }
    const rows = await this.prisma.file.findMany({
      where: scope,
      select: attachmentSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  private async upload(
    userId: string,
    projectId: string,
    taskId: string | null,
    file: ValidatedAttachment,
  ): Promise<AttachmentRecord> {
    const storageKey = randomUUID();
    await this.storeOrThrow(storageKey, file.buffer);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.access.assertProjectAccess(userId, projectId, tx);
        if (taskId) {
          const task = await tx.task.findUnique({
            where: { id: taskId },
            select: { projectId: true },
          });
          if (!task || task.projectId !== projectId) {
            throw new NotFoundException('Task not found');
          }
        }

        const attachment = await tx.file.create({
          data: {
            projectId,
            taskId,
            uploaderId: userId,
            originalName: file.originalName,
            storageKey,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
          },
          select: attachmentSelect,
        });
        await this.activities.record(tx, {
          type: ActivityEvent.ATTACHMENT_UPLOADED,
          description: `Uploaded attachment "${attachment.originalName}"`,
          projectId,
          taskId,
          userId,
          metadata: {
            attachmentId: attachment.id,
            scope: taskId ? 'task' : 'project',
            taskId,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          },
        });
        return attachment;
      });
    } catch (error) {
      try {
        await this.storage.delete(storageKey);
      } catch (cleanupError) {
        this.logger.error(
          'Attachment upload compensation could not remove the stored object',
          cleanupError instanceof Error ? cleanupError.message : undefined,
        );
      }
      throw error;
    }
  }

  private async download(where: {
    id: string;
    projectId: string;
    taskId: string | null;
  }): Promise<{ attachment: AttachmentRecord; contents: Buffer }> {
    const attachment = await this.prisma.file.findFirst({
      where,
      select: { ...attachmentSelect, storageKey: true },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    try {
      return {
        attachment,
        contents: await this.storage.read(attachment.storageKey),
      };
    } catch (error) {
      if (isNotFound(error)) {
        throw new NotFoundException('Attachment file is unavailable');
      }
      throw new ServiceUnavailableException(
        'Attachment storage is unavailable',
      );
    }
  }

  private async remove(
    userId: string,
    where: { id: string; projectId: string; taskId: string | null },
  ): Promise<AttachmentRecord> {
    const rollback: {
      deletedObject: { storageKey: string; contents: Buffer } | null;
    } = { deletedObject: null };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "File" WHERE "id" = ${where.id} FOR UPDATE`,
        );
        if (locked.length === 0)
          throw new NotFoundException('Attachment not found');

        const attachment = await tx.file.findFirst({
          where,
          select: { ...attachmentSelect, storageKey: true },
        });
        if (!attachment) throw new NotFoundException('Attachment not found');
        await this.access.assertProjectAccess(userId, where.projectId, tx);
        if (attachment.uploaderId !== userId) {
          await this.access.assertProjectOwnerAuthority(
            userId,
            where.projectId,
            tx,
          );
        }

        let contents: Buffer;
        try {
          contents = await this.storage.read(attachment.storageKey);
          await this.storage.delete(attachment.storageKey);
        } catch (error) {
          if (isNotFound(error)) {
            throw new ConflictException(
              'Attachment file is unavailable; metadata was retained',
            );
          }
          throw new ServiceUnavailableException(
            'Attachment storage deletion failed; metadata was retained',
          );
        }
        rollback.deletedObject = {
          storageKey: attachment.storageKey,
          contents,
        };

        await tx.file.delete({ where: { id: attachment.id } });
        await this.activities.record(tx, {
          type: ActivityEvent.ATTACHMENT_DELETED,
          description: `Deleted attachment "${attachment.originalName}"`,
          projectId: attachment.projectId,
          taskId: attachment.taskId,
          userId,
          metadata: {
            attachmentId: attachment.id,
            scope: attachment.taskId ? 'task' : 'project',
            taskId: attachment.taskId,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          },
        });
        return attachment;
      });
    } catch (error) {
      if (rollback.deletedObject) {
        try {
          await this.storage.store(
            rollback.deletedObject.storageKey,
            rollback.deletedObject.contents,
          );
        } catch (restoreError) {
          this.logger.error(
            `Attachment ${where.id} storage restore failed after database rollback`,
            restoreError instanceof Error ? restoreError.message : undefined,
          );
        }
      }
      throw error;
    }
  }

  private async resolveTaskProject(
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

  private async storeOrThrow(storageKey: string, contents: Buffer) {
    try {
      await this.storage.store(storageKey, contents);
    } catch {
      throw new ServiceUnavailableException(
        'Attachment storage is unavailable',
      );
    }
  }
}
