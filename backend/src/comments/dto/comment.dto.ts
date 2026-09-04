import { z } from 'zod';

export const commentTaskIdSchema = z.string().uuid();
export const commentIdSchema = z.string().uuid();

const contentSchema = z.string().trim().min(1).max(5000);

export const createCommentSchema = z.strictObject({
  content: contentSchema,
  parentId: z.string().uuid().optional(),
});

export const updateCommentSchema = z.strictObject({
  content: contentSchema,
});

export const listCommentsQuerySchema = z.strictObject({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateCommentDto = z.infer<typeof createCommentSchema>;
export type UpdateCommentDto = z.infer<typeof updateCommentSchema>;
export type ListCommentsQueryDto = z.infer<typeof listCommentsQuerySchema>;
