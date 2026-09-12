"use client";

import { taskDraftKey, useTaskField } from "@/components/tasks/task-drafts";
import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function TaskTimePanel({
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
  const taskKey = queryKeys.taskTime(taskId, currentUserId);
  const activeKey = queryKeys.activeTimer(currentUserId);
  const draftPrefix = taskDraftKey(projectId, taskId) + ":time:";
  const [startedAt, setStartedAt] = useTaskField<string>(
    draftPrefix + "start",
    "",
  );
  const [endedAt, setEndedAt] = useTaskField<string>(draftPrefix + "end", "");
  const [note, setNote] = useTaskField<string>(draftPrefix + "note", "");
  const [error, setError] = useState<string | null>(null);

  const time = useInfiniteQuery({
    queryKey: taskKey,
    queryFn: ({ pageParam }) =>
      api.getTaskTime(taskId, { cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const active = useQuery({
    queryKey: activeKey,
    queryFn: api.getActiveTimer,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: taskKey, exact: true }),
      queryClient.invalidateQueries({ queryKey: activeKey, exact: true }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectTime(projectId, currentUserId),
        exact: true,
      }),
    ]);
  };
  const mutationOptions = {
    onSuccess: refresh,
    onError: (cause: unknown) => setError(errorMessage(cause)),
  };
  const start = useMutation({
    mutationFn: () => api.startTaskTimer(taskId),
    ...mutationOptions,
  });
  const stop = useMutation({
    mutationFn: () => api.stopTaskTimer(taskId),
    ...mutationOptions,
  });
  const manual = useMutation({
    mutationFn: () =>
      api.createManualTimeEntry(taskId, {
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        note: note.trim() || null,
      }),
    onSuccess: async () => {
      setStartedAt("");
      setEndedAt("");
      setNote("");
      setError(null);
      await refresh();
    },
    onError: mutationOptions.onError,
  });
  const pages = time.data?.pages ?? [];
  const entries = pages.flatMap((page) => page.items);
  const totalSeconds = pages[0]?.totalSeconds ?? 0;
  const activeTimer = active.data?.activeTimer ?? null;
  const activeHere = activeTimer?.taskId === taskId;
  const activeElsewhere = Boolean(activeTimer && !activeHere);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-background/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Tracked on this Task
            </p>
            <p className="mt-1 text-2xl font-semibold text-text-primary">
              {time.isPending
                ? "Loading…"
                : time.isError
                  ? "Unavailable"
                  : formatDuration(totalSeconds)}
            </p>
          </div>
          {activeHere ? (
            <Button
              variant="danger"
              onClick={() => {
                setError(null);
                stop.mutate();
              }}
              disabled={stop.isPending}
            >
              {stop.isPending ? "Stopping..." : "Stop timer"}
            </Button>
          ) : (
            <Button
              onClick={() => {
                setError(null);
                start.mutate();
              }}
              disabled={
                start.isPending ||
                activeElsewhere ||
                active.isPending ||
                active.isError
              }
              title={
                activeElsewhere
                  ? "Stop your other active timer first"
                  : undefined
              }
            >
              {start.isPending ? "Starting..." : "Start timer"}
            </Button>
          )}
        </div>
        {activeHere && activeTimer ? (
          <p className="mt-3 text-sm text-success" role="status">
            Timer running since{" "}
            {new Date(activeTimer.startedAt).toLocaleTimeString()}.
          </p>
        ) : activeElsewhere && activeTimer ? (
          <p className="mt-3 text-sm text-text-secondary">
            A timer is already running on {activeTimer.task.title}.
          </p>
        ) : null}
      </section>

      {active.isError && (
        <p role="alert" className="text-sm text-danger">
          Could not load your active timer.{" "}
          <button onClick={() => active.refetch()}>Retry</button>
        </p>
      )}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <details open={compact ? undefined : true}>
        <summary className="control-target cursor-pointer py-2 text-sm font-medium">
          Manual time and your history
        </summary>
        <form
          className="space-y-3 rounded-lg border border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!startedAt || !endedAt || manual.isPending) return;
            setError(null);
            manual.mutate();
          }}
        >
          <h3 className="text-sm font-semibold text-text-primary">
            Add manual time
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-text-secondary">
              Started
              <Input
                type="datetime-local"
                value={startedAt}
                onChange={(event) => setStartedAt(event.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-text-secondary">
              Ended
              <Input
                type="datetime-local"
                value={endedAt}
                onChange={(event) => setEndedAt(event.target.value)}
                required
              />
            </label>
          </div>
          <label className="block space-y-1 text-xs font-medium text-text-secondary">
            Note (optional)
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              placeholder="What did you work on?"
            />
          </label>
          <Button
            type="submit"
            size="sm"
            disabled={!startedAt || !endedAt || manual.isPending}
          >
            {manual.isPending ? "Adding..." : "Add time"}
          </Button>
        </form>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-text-primary">
            Your recent entries
          </h3>
          {time.isPending ? (
            <div className="flex items-center gap-2 py-5 text-sm text-text-secondary">
              <Spinner /> Loading time...
            </div>
          ) : time.isError ? (
            <p className="text-sm text-danger" role="alert">
              {errorMessage(time.error)}
            </p>
          ) : entries.length === 0 ? (
            <EmptyState title="No time tracked yet." />
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="text-text-primary">
                      {entry.endedAt
                        ? new Date(entry.startedAt).toLocaleString()
                        : "Active timer"}
                    </p>
                    {entry.note ? (
                      <p className="truncate text-xs text-text-secondary">
                        {entry.note}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-medium text-text-primary">
                    {entry.durationSeconds === null
                      ? "Running"
                      : formatDuration(entry.durationSeconds)}
                  </span>
                </div>
              ))}
              {time.hasNextPage ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => time.fetchNextPage()}
                  disabled={time.isFetchingNextPage}
                >
                  {time.isFetchingNextPage ? "Loading..." : "Load more"}
                </Button>
              ) : null}
            </div>
          )}
        </section>
      </details>
    </div>
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof ApiError
    ? cause.message
    : "Time tracking request failed.";
}
