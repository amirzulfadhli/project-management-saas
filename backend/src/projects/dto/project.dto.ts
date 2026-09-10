import { z } from 'zod';

export const projectIdSchema = z.string().uuid();

export const createProjectSchema = z.strictObject({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().max(5000).optional(),
  organizationId: z.string().uuid(),
});

export type CreateProjectDto = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.strictObject({
  name: z.string().trim().min(1, 'Name is required').max(120).optional(),
  description: z.string().max(5000).nullable().optional(),
});

export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;

export const listProjectsQuerySchema = z.strictObject({
  organizationId: z.string().uuid().optional(),
  archived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type ListProjectsQueryDto = z.infer<typeof listProjectsQuerySchema>;
