import { z } from 'zod';

export const createOrganizationSchema = z.strictObject({
  name: z.string().trim().min(1, 'Name is required').max(120),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must contain lowercase letters or numbers separated by single hyphens',
    )
    .optional(),
});

export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;

export const organizationIdSchema = z.string().uuid();

export const addOrganizationMemberSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(320),
});

export const updateOrganizationMemberRoleSchema = z.strictObject({
  role: z.enum(['OWNER', 'MEMBER']),
});

export type AddOrganizationMemberDto = z.infer<
  typeof addOrganizationMemberSchema
>;
export type UpdateOrganizationMemberRoleDto = z.infer<
  typeof updateOrganizationMemberRoleSchema
>;
