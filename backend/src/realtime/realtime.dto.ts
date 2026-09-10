import { z } from 'zod';

export const projectSubscriptionSchema = z
  .object({ projectId: z.uuid() })
  .strict();

export type ProjectSubscriptionDto = z.infer<typeof projectSubscriptionSchema>;
