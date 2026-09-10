"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { Column, Task } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { githubIssueError } from "./task-github-panel";

const pageSize = 20;

export function ProjectGithubIssues({
  projectId,
  columns,
  currentUserId,
}: {
  projectId: string;
  columns: Column[];
  currentUserId: string | null;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [columnId, setColumnId] = useState(columns[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const issues = useQuery({
    queryKey: queryKeys.githubIssues(
      projectId,
      page,
      pageSize,
      "open",
      currentUserId,
    ),
    queryFn: () =>
      api.getProjectGithubIssues(projectId, {
        page,
        perPage: pageSize,
        state: "open",
      }),
  });
  const createTask = useMutation({
    mutationFn: (issueNumber: number) =>
      api.createTaskFromGithubIssue(projectId, issueNumber, columnId),
    onSuccess: async ({ task }) => {
      queryClient.setQueryData<Task[]>(queryKeys.tasks(projectId), (current) =>
        [...(current ?? []).filter((item) => item.id !== task.id), task].sort(
          (left, right) =>
            left.column.position - right.column.position ||
            left.position - right.position ||
            left.id.localeCompare(right.id),
        ),
      );
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.githubIssueLists(projectId, currentUserId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectActivities(projectId),
          exact: true,
        }),
      ]);
    },
    onError: (value: unknown) => setError(githubIssueError(value)),
  });

  if (issues.isPending) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-6 text-sm text-text-secondary"
        role="status"
      >
        <Spinner /> Loading repository Issues...
      </div>
    );
  }
  if (issues.isError) {
    return (
      <ErrorState
        message={githubIssueError(issues.error)}
        onRetry={() => issues.refetch()}
      />
    );
  }

  return (
    <section
      className="space-y-3 border-t border-border pt-5"
      aria-label="GitHub Issues"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-primary">Open Issues</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Explicitly import an Issue as a Task. Webhooks never create Tasks
            automatically.
          </p>
        </div>
        <div className="w-full sm:w-52">
          <label
            htmlFor="github-import-column"
            className="text-xs font-medium text-text-primary"
          >
            Destination Column
          </label>
          <Select
            id="github-import-column"
            className="mt-1"
            value={columnId}
            onChange={(event) => setColumnId(event.target.value)}
          >
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!issues.data || issues.data.items.length === 0 ? (
        <EmptyState
          title={page === 1 ? "No open Issues" : "No Issues on this page"}
          description="GitHub may have no open Issues, or only pull requests on this page."
        />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {issues.data.items.map((issue) => (
            <li
              key={issue.externalIssueId}
              className="flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="success">Open</Badge>
                  <a
                    href={issue.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="break-words text-sm font-medium text-text-primary hover:text-primary hover:underline"
                  >
                    #{issue.number} {issue.title}
                    <span className="sr-only">
                      {" "}
                      (opens GitHub in a new tab)
                    </span>
                  </a>
                </div>
                {issue.linkedTask ? (
                  <p className="mt-1 text-xs text-text-secondary">
                    Linked to {issue.linkedTask.title}
                  </p>
                ) : null}
              </div>
              <Button
                size="sm"
                className="shrink-0"
                disabled={
                  Boolean(issue.linkedTask) || !columnId || createTask.isPending
                }
                onClick={() => createTask.mutate(issue.number)}
              >
                {createTask.isPending && createTask.variables === issue.number
                  ? "Creating..."
                  : issue.linkedTask
                    ? "Already linked"
                    : "Create Task"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={page === 1}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous
        </Button>
        <span className="text-xs text-text-secondary">Page {page}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={issues.data?.nextPage === null}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </Button>
      </div>
      {error ? (
        <p
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
