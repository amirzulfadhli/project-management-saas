import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type { GithubEventName } from './dto/github.dto';

const repositorySchema = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  full_name: z.string().min(3).max(201),
});

const commonSchema = z.object({
  repository: repositorySchema,
  sender: z.object({ login: z.string().min(1).max(100) }).optional(),
});

const pushSchema = commonSchema.extend({
  ref: z.string().min(1).max(1024),
  before: z.string().max(64),
  after: z.string().max(64),
  commits: z.array(z.unknown()).max(10000).default([]),
  pusher: z.object({ name: z.string().min(1).max(100) }).optional(),
});

const pullRequestSchema = commonSchema.extend({
  action: z.string().min(1).max(50),
  number: z.number().int().positive(),
  pull_request: z.object({
    title: z.string().max(1000),
    state: z.string().max(30),
    merged: z.boolean().optional(),
    base: z.object({ ref: z.string().max(255) }),
    head: z.object({ ref: z.string().max(255) }),
  }),
});

const issuesSchema = commonSchema.extend({
  action: z.string().min(1).max(50),
  issue: z.object({
    number: z.number().int().positive(),
    title: z.string().max(1000),
    state: z.string().max(30),
  }),
});

export type GithubEventMetadata = Record<
  string,
  string | number | boolean | null
>;

export interface NormalizedGithubWebhook {
  externalRepositoryId: string;
  fullName: string;
  metadata: GithubEventMetadata;
}

export function normalizeGithubWebhook(
  eventName: GithubEventName,
  value: unknown,
): NormalizedGithubWebhook {
  try {
    if (eventName === 'push') {
      const payload = pushSchema.parse(value);
      return {
        externalRepositoryId: String(payload.repository.id),
        fullName: payload.repository.full_name,
        metadata: {
          ref: payload.ref,
          before: payload.before,
          after: payload.after,
          commitCount: payload.commits.length,
          actor: payload.pusher?.name ?? payload.sender?.login ?? null,
        },
      };
    }

    if (eventName === 'pull_request') {
      const payload = pullRequestSchema.parse(value);
      return {
        externalRepositoryId: String(payload.repository.id),
        fullName: payload.repository.full_name,
        metadata: {
          action: payload.action,
          number: payload.number,
          title: payload.pull_request.title.slice(0, 300),
          state: payload.pull_request.state,
          merged: payload.pull_request.merged ?? false,
          baseBranch: payload.pull_request.base.ref,
          headBranch: payload.pull_request.head.ref,
          actor: payload.sender?.login ?? null,
        },
      };
    }

    const payload = issuesSchema.parse(value);
    return {
      externalRepositoryId: String(payload.repository.id),
      fullName: payload.repository.full_name,
      metadata: {
        action: payload.action,
        number: payload.issue.number,
        title: payload.issue.title.slice(0, 300),
        state: payload.issue.state,
        actor: payload.sender?.login ?? null,
      },
    };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      throw new BadRequestException('Invalid GitHub webhook payload');
    }
    throw error;
  }
}
