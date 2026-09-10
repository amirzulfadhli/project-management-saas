/* eslint-disable @typescript-eslint/unbound-method */
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { AccessService } from '../access/access.service';
import type { ActivitiesService } from '../activities/activities.service';
import { ActivityEvent } from '../activities/activity.types';
import type { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from './attachments.service';
import type { FileStorage } from './file-storage';

const attachment = {
  id: 'a1',
  projectId: 'p1',
  taskId: null,
  uploaderId: 'u1',
  originalName: 'notes.txt',
  storageKey: '11111111-1111-4111-8111-111111111111',
  mimeType: 'text/plain',
  sizeBytes: 5,
  createdAt: new Date(),
  uploader: { id: 'u1', name: 'User', email: 'user@test.dev', image: null },
};

describe('AttachmentsService', () => {
  let db: {
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    file: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    task: { findUnique: jest.Mock };
  };
  let access: {
    assertProjectAccess: jest.Mock;
    assertProjectOwnerAuthority: jest.Mock;
  };
  let activities: { record: jest.Mock };
  let storage: jest.Mocked<FileStorage>;
  let service: AttachmentsService;

  beforeEach(() => {
    db = {
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ id: attachment.id }]),
      file: {
        create: jest.fn().mockResolvedValue(attachment),
        findFirst: jest.fn().mockResolvedValue(attachment),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue(attachment),
      },
      task: { findUnique: jest.fn().mockResolvedValue({ projectId: 'p1' }) },
    };
    db.$transaction.mockImplementation(
      (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(db as unknown as Prisma.TransactionClient),
    );
    access = {
      assertProjectAccess: jest.fn(),
      assertProjectOwnerAuthority: jest.fn(),
    };
    activities = { record: jest.fn().mockResolvedValue({ id: 'activity' }) };
    storage = {
      store: jest.fn(),
      read: jest.fn().mockResolvedValue(Buffer.from('hello')),
      delete: jest.fn(),
      exists: jest.fn(),
    };
    service = new AttachmentsService(
      db as unknown as PrismaService,
      access as unknown as AccessService,
      activities as unknown as ActivitiesService,
      storage,
    );
  });

  it('stores a Project attachment and metadata/Activity atomically', async () => {
    await service.uploadProject('u1', 'p1', {
      originalName: 'notes.txt',
      mimeType: 'text/plain',
      sizeBytes: 5,
      buffer: Buffer.from('hello'),
    });
    expect(storage.store).toHaveBeenCalledWith(
      expect.any(String),
      Buffer.from('hello'),
    );
    expect(db.file.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: 'p1',
          taskId: null,
          uploaderId: 'u1',
          originalName: 'notes.txt',
        }) as object,
      }),
    );
    expect(activities.record).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: ActivityEvent.ATTACHMENT_UPLOADED }),
    );
  });

  it('derives Task Project scope and rejects through the shared access boundary', async () => {
    access.assertProjectAccess.mockRejectedValueOnce(new ForbiddenException());
    await expect(
      service.uploadTask('outsider', 't1', {
        originalName: 'notes.txt',
        mimeType: 'text/plain',
        sizeBytes: 5,
        buffer: Buffer.from('hello'),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.store).not.toHaveBeenCalled();
  });

  it('removes the stored object when the database transaction fails', async () => {
    db.$transaction.mockRejectedValueOnce(new Error('database failed'));
    await expect(
      service.uploadProject('u1', 'p1', {
        originalName: 'notes.txt',
        mimeType: 'text/plain',
        sizeBytes: 5,
        buffer: Buffer.from('hello'),
      }),
    ).rejects.toThrow('database failed');
    expect(storage.delete).toHaveBeenCalledWith(expect.any(String));
  });

  it('reports storage write failures before creating metadata', async () => {
    storage.store.mockRejectedValueOnce(new Error('disk full'));
    await expect(
      service.uploadProject('u1', 'p1', {
        originalName: 'notes.txt',
        mimeType: 'text/plain',
        sizeBytes: 5,
        buffer: Buffer.from('hello'),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.file.create).not.toHaveBeenCalled();
  });

  it('allows uploader deletion without owner authority', async () => {
    await service.removeProject('u1', 'p1', 'a1');
    expect(access.assertProjectOwnerAuthority).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith(attachment.storageKey);
    expect(db.file.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    expect(activities.record).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ type: ActivityEvent.ATTACHMENT_DELETED }),
    );
  });

  it("requires owner authority to delete another uploader's attachment", async () => {
    await service.removeProject('owner', 'p1', 'a1');
    expect(access.assertProjectOwnerAuthority).toHaveBeenCalledWith(
      'owner',
      'p1',
      db,
    );
  });

  it('retains metadata when storage deletion fails', async () => {
    storage.delete.mockRejectedValueOnce(
      Object.assign(new Error('busy'), { code: 'EBUSY' }),
    );
    await expect(
      service.removeProject('u1', 'p1', 'a1'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.file.delete).not.toHaveBeenCalled();
    expect(activities.record).not.toHaveBeenCalled();
  });

  it('restores the object when database deletion rolls back', async () => {
    activities.record.mockRejectedValueOnce(new Error('activity failed'));
    await expect(service.removeProject('u1', 'p1', 'a1')).rejects.toThrow(
      'activity failed',
    );
    expect(storage.store).toHaveBeenCalledWith(
      attachment.storageKey,
      Buffer.from('hello'),
    );
  });

  it('returns a clear conflict when metadata exists but storage is missing', async () => {
    storage.read.mockRejectedValueOnce(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    );
    await expect(
      service.removeProject('u1', 'p1', 'a1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.file.delete).not.toHaveBeenCalled();
  });
});
