import { z } from 'zod';

export const githubProjectIdSchema = z.string().uuid();
export const githubInstallationRecordIdSchema = z.string().uuid();
export const githubExternalIdSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{0,19}$/, 'GitHub ID is invalid');

export const connectGithubRepositorySchema = z.strictObject({
  installationId: githubInstallationRecordIdSchema,
  externalRepositoryId: githubExternalIdSchema,
});

export type ConnectGithubRepositoryDto = z.infer<
  typeof connectGithubRepositorySchema
>;

export const githubDeliveryIdSchema = z.string().uuid();
export const githubEventSchema = z.enum(['push', 'pull_request', 'issues']);
export type GithubEventName = z.infer<typeof githubEventSchema>;

export const githubStateSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'GitHub state is invalid');

export const githubSetupQuerySchema = z.strictObject({
  installation_id: githubExternalIdSchema,
  setup_action: z.enum(['install', 'update']).optional(),
  state: githubStateSchema,
});
export type GithubSetupQueryDto = z.infer<typeof githubSetupQuerySchema>;

export const githubCallbackQuerySchema = z.strictObject({
  code: z.string().trim().min(1).max(512),
  state: githubStateSchema,
});
export type GithubCallbackQueryDto = z.infer<typeof githubCallbackQuerySchema>;

export const githubRepositoryQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
});
export type GithubRepositoryQueryDto = z.infer<
  typeof githubRepositoryQuerySchema
>;

export const githubIssueNumberSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(2_147_483_647);

export const githubIssueQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
  state: z.enum(['open', 'closed', 'all']).default('open'),
});
export type GithubIssueQueryDto = z.infer<typeof githubIssueQuerySchema>;

export const linkGithubIssueSchema = z.strictObject({
  issueNumber: githubIssueNumberSchema,
});
export type LinkGithubIssueDto = z.infer<typeof linkGithubIssueSchema>;

export const createTaskFromGithubIssueSchema = z.strictObject({
  columnId: z.string().uuid(),
});
export type CreateTaskFromGithubIssueDto = z.infer<
  typeof createTaskFromGithubIssueSchema
>;
