import { z } from 'zod';

export const projectColumnIdSchema = z.string().uuid();

export const createProjectColumnSchema = z.strictObject({
  name: z.string().trim().min(1, 'Column name is required').max(120),
});

export type CreateProjectColumnDto = z.infer<typeof createProjectColumnSchema>;

export const updateProjectColumnSchema = z.strictObject({
  name: z.string().trim().min(1, 'Column name is required').max(120),
});

export type UpdateProjectColumnDto = z.infer<typeof updateProjectColumnSchema>;
