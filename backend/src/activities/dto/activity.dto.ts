import { z } from 'zod';

export const activityProjectIdSchema = z.string().uuid();

export const listActivitiesQuerySchema = z.strictObject({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type ListActivitiesQueryDto = z.infer<typeof listActivitiesQuerySchema>;
