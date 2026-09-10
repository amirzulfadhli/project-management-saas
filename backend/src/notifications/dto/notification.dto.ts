import { z } from 'zod';

export const notificationIdSchema = z.string().uuid();

export const listNotificationsQuerySchema = z.strictObject({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type ListNotificationsQueryDto = z.infer<
  typeof listNotificationsQuerySchema
>;
