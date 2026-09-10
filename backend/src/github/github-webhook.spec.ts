import { BadRequestException } from '@nestjs/common';
import { normalizeGithubWebhook } from './github-webhook';

const repository = { id: 123456, full_name: 'flowplan/example' };

describe('normalizeGithubWebhook', () => {
  it('normalizes push metadata without retaining commits or raw payload data', () => {
    const result = normalizeGithubWebhook('push', {
      repository,
      ref: 'refs/heads/main',
      before: 'a'.repeat(40),
      after: 'b'.repeat(40),
      commits: [{ message: 'sensitive body' }, { message: 'another' }],
      pusher: { name: 'octocat' },
      arbitrary: { token: 'must-not-survive' },
    });

    expect(result).toEqual({
      externalRepositoryId: '123456',
      fullName: 'flowplan/example',
      metadata: {
        ref: 'refs/heads/main',
        before: 'a'.repeat(40),
        after: 'b'.repeat(40),
        commitCount: 2,
        actor: 'octocat',
      },
    });
  });

  it('normalizes pull request and issue events', () => {
    expect(
      normalizeGithubWebhook('pull_request', {
        repository,
        action: 'opened',
        number: 8,
        pull_request: {
          title: 'Add secure webhook ingestion',
          state: 'open',
          merged: false,
          base: { ref: 'main' },
          head: { ref: 'feature/webhooks' },
        },
        sender: { login: 'octocat' },
      }).metadata,
    ).toMatchObject({ number: 8, action: 'opened', baseBranch: 'main' });

    expect(
      normalizeGithubWebhook('issues', {
        repository,
        action: 'closed',
        issue: { number: 12, title: 'Bug', state: 'closed' },
        sender: { login: 'octocat' },
      }).metadata,
    ).toEqual({
      action: 'closed',
      number: 12,
      title: 'Bug',
      state: 'closed',
      actor: 'octocat',
    });
  });

  it('rejects malformed event payloads', () => {
    expect(() => normalizeGithubWebhook('push', { repository })).toThrow(
      BadRequestException,
    );
  });
});
