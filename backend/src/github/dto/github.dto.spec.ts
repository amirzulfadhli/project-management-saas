import {
  createTaskFromGithubIssueSchema,
  githubIssueQuerySchema,
  linkGithubIssueSchema,
} from './github.dto';

describe('GitHub Issue DTOs', () => {
  it('accepts bounded discovery pagination and defaults to open Issues', () => {
    expect(githubIssueQuerySchema.parse({})).toEqual({
      page: 1,
      perPage: 30,
      state: 'open',
    });
    expect(
      githubIssueQuerySchema.parse({ page: '2', perPage: '100', state: 'all' }),
    ).toEqual({ page: 2, perPage: 100, state: 'all' });
  });

  it('rejects unknown Issue-link identity fields', () => {
    expect(() =>
      linkGithubIssueSchema.parse({ issueNumber: 7, owner: 'spoofed' }),
    ).toThrow();
    expect(() => linkGithubIssueSchema.parse({ issueNumber: 0 })).toThrow();
  });

  it('accepts only a destination Column when importing an Issue', () => {
    const columnId = '10000000-0000-4000-8000-000000000001';
    expect(createTaskFromGithubIssueSchema.parse({ columnId })).toEqual({
      columnId,
    });
    expect(() =>
      createTaskFromGithubIssueSchema.parse({ columnId, projectId: columnId }),
    ).toThrow();
  });
});
