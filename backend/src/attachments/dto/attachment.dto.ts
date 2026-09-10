import { z } from 'zod';

export const attachmentProjectIdSchema = z.string().uuid();
export const attachmentTaskIdSchema = z.string().uuid();
export const attachmentIdSchema = z.string().uuid();

export const emptyUploadBodySchema = z.strictObject({});

export const listAttachmentsQuerySchema = z.strictObject({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListAttachmentsQueryDto = z.infer<
  typeof listAttachmentsQuerySchema
>;
