"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { TaskGithubIssue } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const pageSize = 30;

export function TaskGithubPanel({
  taskId,
  projectId,
  currentUserId,
  compact = false,
}: {
  taskId: string;
  projectId: string;
  currentUserId: string | null;
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [choosing, setChoosing] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const issueKey = queryKeys.taskGithubIssue(taskId, currentUserId);
  const linked = useQuery({
    queryKey: issueKey,
    queryFn: () => api.getTaskGithubIssue(taskId),
  });
  const repository = useQuery({
    queryKey: queryKeys.projectRepository(projectId),
    queryFn: () => api.getProjectRepository(projectId),
  });
  const issuesKey = queryKeys.githubIssues(
    projectId,
    page,
    pageSize,
    "open",
    currentUserId,
  );
  const issues = useQuery({
    queryKey: issuesKey,
    queryFn: () =>
      api.getProjectGithubIssues(projectId, {
        page,
        perPage: pageSize,
        state: "open",
      }),
    enabled:
      (!compact || choosing) &&
      linked.isSuccess &&
      !linked.data &&
      Boolean(repository.data),
  });

  const refreshProjectGithub = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.githubIssueLists(projectId, currentUserId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectActivities(projectId),
        exact: true,
      }),
    ]);
  };

  const link = useMutation({
    mutationFn: (issueNumber: number) =>
      api.linkTaskGithubIssue(taskId, issueNumber),
    onSuccess: async (value) => {
      queryClient.setQueryData<TaskGithubIssue | null>(issueKey, value);
      setMessage(null);
      await refreshProjectGithub();
    },
    onError: (error: unknown) => setMessage(githubIssueError(error)),
  });
  const unlink = useMutation({
    mutationFn: () => api.unlinkTaskGithubIssue(taskId),
    onSuccess: async () => {
      queryClient.setQueryData<TaskGithubIssue | null>(issueKey, null);
      setSelectedNumber("");
      setMessage(null);
      await refreshProjectGithub();
    },
    onError: (error: unknown) => setMessage(githubIssueError(error)),
  });

  if (linked.isPending || repository.isPending) return <Loading />;
  if (linked.isError || repository.isError) {
    return (
      <ErrorState
        message={githubIssueError(linked.error ?? repository.error)}
        onRetry={() =>
          void Promise.all([linked.refetch(), repository.refetch()])
        }
      />
    );
  }
  if (linked.data) {
    const issue = linked.data;
    return (
      <section className="space-y-4" aria-label="Linked GitHub Issue">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={issue.state === "open" ? "success" : "neutral"}>
              {issue.state}
            </Badge>
            {issue.unavailableAt ? (
              <Badge tone="warning">Unavailable</Badge>
            ) : null}
          </div>
          <a
            href={issue.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block break-words text-sm font-semibold text-text-primary hover:text-primary hover:underline"
          >
            {issue.repository.fullName}#{issue.number}: {issue.title}
            <span className="sr-only"> (opens GitHub in a new tab)</span>
          </a>
          <p className="mt-2 text-xs text-text-secondary">
            Last synchronized {new Date(issue.lastSyncedAt).toLocaleString()}.
            GitHub state does not move this Task between Columns.
          </p>
        </div>
        <Button
          variant="danger"
          size="sm"
          disabled={unlink.isPending}
          onClick={() => {
            if (
              window.confirm(
                `Unlink GitHub Issue #${issue.number}? Neither the Task nor GitHub Issue will be deleted.`,
              )
            ) {
              unlink.mutate();
            }
          }}
        >
          {unlink.isPending ? "Unlinking..." : "Unlink Issue"}
        </Button>
        {message ? <InlineError>{message}</InlineError> : null}
      </section>
    );
  }
  if (!repository.data) {
    return (
      <EmptyState
        title="No GitHub repository connected"
        description="Connect a verified repository from the Project GitHub panel before linking an Issue."
      />
    );
  }
  if (compact && !choosing)
    return (
      <Button variant="secondary" size="sm" onClick={() => setChoosing(true)}>
        Link GitHub Issue
      </Button>
    );
  if (issues.isPending) return <Loading />;
  if (issues.isError) {
    return (
      <ErrorState
        message={githubIssueError(issues.error)}
        onRetry={() => issues.refetch()}
      />
    );
  }

  const available = (issues.data?.items ?? []).filter(
    (issue) => !issue.linkedTask,
  );
  return (
    <section className="space-y-4" aria-label="Link a GitHub Issue">
      <div>
        <h3 className="text-sm font-medium text-text-primary">
          Link an open GitHub Issue
        </h3>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          Future GitHub title, body, and state changes will synchronize here.
          FlowPlan never moves the Task automatically.
        </p>
      </div>
      {available.length === 0 ? (
        <EmptyState
          title={
            page === 1 ? "No unlinked open Issues" : "No Issues on this page"
          }
          description="Create or reopen an Issue on GitHub, or browse another page."
        />
      ) : (
        <div className="space-y-1.5">
          <label htmlFor="task-github-issue" className="text-xs font-medium">
            Issue from {issues.data?.repository.fullName}
          </label>
          <Select
            id="task-github-issue"
            value={selectedNumber}
            disabled={link.isPending}
            onChange={(event) => setSelectedNumber(event.target.value)}
          >
            <option value="">Choose an Issue</option>
            {available.map((issue) => (
              <option key={issue.externalIssueId} value={issue.number}>
                #{issue.number} {issue.title}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page === 1 || link.isPending}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous
        </Button>
        <span className="text-xs text-text-secondary">Page {page}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={!issues.data?.nextPage || link.isPending}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </Button>
      </div>
      <Button
        disabled={!selectedNumber || link.isPending}
        onClick={() => link.mutate(Number(selectedNumber))}
      >
        {link.isPending ? "Linking..." : "Link Issue"}
      </Button>
      {message ? <InlineError>{message}</InlineError> : null}
    </section>
  );
}

function Loading() {
  return (
    <p
      className="flex items-center justify-center gap-2 py-8 text-sm text-text-secondary"
      role="status"
    >
      <Spinner /> Loading GitHub Issues...
    </p>
  );
}

function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
      role="alert"
    >
      {children}
    </p>
  );
}

export function githubIssueError(error: unknown): string {
  if (!(error instanceof ApiError)) return "GitHub Issue request failed.";
  if (error.status === 401) return "Your session expired. Sign in and retry.";
  if (error.status === 403) return "You do not have access to this Project.";
  if (error.status === 404)
    return "The Task, repository, installation, or Issue is unavailable.";
  if (error.status === 409)
    return "This Task or GitHub Issue is already linked.";
  if (error.status === 429)
    return "GitHub's rate limit was reached. Retry later.";
  return error.status >= 500
    ? "GitHub is temporarily unavailable or the App installation needs attention."
    : error.message;
}
