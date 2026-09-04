import { z } from 'zod';
import { ProjectRole } from '../../../generated/prisma/client';

const projectRoleSchema = z.enum([ProjectRole.OWNER, ProjectRole.MEMBER]);

export const projectMemberIdSchema = z.string().uuid();

export const addProjectMemberSchema = z.strictObject({
  userId: z.string().trim().min(1, 'User ID is required').max(128),
  role: projectRoleSchema.default(ProjectRole.MEMBER),
});

export type AddProjectMemberDto = z.infer<typeof addProjectMemberSchema>;

export const updateProjectMemberRoleSchema = z.strictObject({
  role: projectRoleSchema,
});

export type UpdateProjectMemberRoleDto = z.infer<
  typeof updateProjectMemberRoleSchema
>;
