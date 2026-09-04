import { z } from 'zod';

const taskDateSchema = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })])
  .transform((value) => new Date(value));

const taskStatusSchema = z
  .string()
  .trim()
  .min(1, 'Status cannot be empty')
  .max(50);

const userIdSchema = z.string().trim().min(1).max(128);

export const taskIdSchema = z.string().uuid();

export const createTaskSchema = z.strictObject({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().max(10000).optional(),
  projectId: z.string().uuid(),
  columnId: z.string().uuid(),
  assigneeId: userIdSchema.optional(),
  priority: z.number().int().min(1).max(4).optional(),
  status: taskStatusSchema.optional(),
  dueDate: taskDateSchema.optional(),
  estimatedTime: z.number().int().min(0).optional(),
  startDate: taskDateSchema.optional(),
});

export type CreateTaskDto = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.strictObject({
  title: z.string().trim().min(1, 'Title is required').max(200).optional(),
  description: z.string().max(10000).nullable().optional(),
  columnId: z.string().uuid().optional(),
  assigneeId: userIdSchema.nullable().optional(),
  priority: z.number().int().min(1).max(4).optional(),
  status: taskStatusSchema.optional(),
  dueDate: taskDateSchema.nullable().optional(),
  estimatedTime: z.number().int().min(0).nullable().optional(),
  actualTime: z.number().int().min(0).nullable().optional(),
  startDate: taskDateSchema.nullable().optional(),
  completedAt: taskDateSchema.nullable().optional(),
});

export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;

export const listTasksQuerySchema = z.strictObject({
  projectId: z.string().uuid().optional(),
  columnId: z.string().uuid().optional(),
  assigneeId: userIdSchema.optional(),
  priority: z.coerce.number().int().min(1).max(4).optional(),
  status: taskStatusSchema.optional(),
});

export type ListTasksQueryDto = z.infer<typeof listTasksQuerySchema>;
