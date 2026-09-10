"use client";

import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import {
  formatActivityTimestamp,
  presentActivity,
  type ActivityCategory,
} from "@/lib/activity-presentation";
import { queryKeys } from "@/lib/queries";
import type { ActivityItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";

const categoryClasses: Record<ActivityCategory, string> = {
  project: "bg-primary",
  task: "bg-success",
  member: "bg-purple",
  comment: "bg-warning",
  integration: "bg-primary",
};

export function ProjectActivityModal({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const activityQuery = useInfiniteQuery({
    queryKey: queryKeys.projectActivities(projectId),
    queryFn: ({ pageParam }) =>
      api.getProjectActivities(projectId, {
        cursor: pageParam,
        limit: 30,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: open && Boolean(projectId),
  });

  const activities = useMemo(() => {
    const unique = new Map<string, ActivityItem>();
    for (const page of activityQuery.data?.pages ?? []) {
      for (const activity of page.items) unique.set(activity.id, activity);
    }
    return [...unique.values()];
  }, [activityQuery.data]);
  const nextPageErrorMessage = activityErrorMessage(
    activityQuery.error,
    "Could not load more activity.",
  );

  return (
    <Modal open={open} onClose={onClose} title="Project activity" size="lg">
      <div className="max-h-[72vh] overflow-y-auto pr-1">
        {activityQuery.isPending ? (
          <div
            className="flex items-center justify-center gap-2 py-12 text-sm text-text-secondary"
            role="status"
          >
            <Spinner /> Loading activity...
          </div>
        ) : activityQuery.isError && activities.length === 0 ? (
          <ErrorState
            message={activityErrorMessage(
              activityQuery.error,
              "Failed to load Project activity.",
            )}
            onRetry={() => activityQuery.refetch()}
          />
        ) : activities.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Project, Task, membership, and Comment changes will appear here."
          />
        ) : (
          <>
            <ol className="space-y-1" aria-label="Project activity">
              {activities.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} />
              ))}
            </ol>

            <div className="mt-4 flex flex-col items-center gap-2 border-t border-border pt-4">
              {activityQuery.isFetchNextPageError ? (
                <p className="text-sm text-danger" role="alert">
                  {nextPageErrorMessage}
                </p>
              ) : null}
              {activityQuery.hasNextPage ? (
                <Button
                  variant="secondary"
                  disabled={activityQuery.isFetchingNextPage}
                  onClick={() => activityQuery.fetchNextPage()}
                >
                  {activityQuery.isFetchingNextPage ? (
                    <>
                      <Spinner /> Loading more...
                    </>
                  ) : activityQuery.isFetchNextPageError ? (
                    "Retry"
                  ) : (
                    "Load more"
                  )}
                </Button>
              ) : (
                <p className="text-xs text-text-secondary">
                  You&apos;re all caught up.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function ActivityRow({ activity }: { activity: ActivityItem }) {
  const presentation = presentActivity(activity);
  const actorInitial =
    activity.actor.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <li className="relative flex min-w-0 gap-3 rounded-md px-2 py-3 hover:bg-hover">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-hover text-xs font-semibold text-text-secondary"
        aria-hidden="true"
      >
        {actorInitial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm leading-5 text-text-primary">
          <span className="font-medium">{activity.actor.name}</span>{" "}
          {presentation.text}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
          <span
            className={`h-1.5 w-1.5 rounded-full ${categoryClasses[presentation.category]}`}
            aria-hidden="true"
          />
          <time dateTime={activity.createdAt}>
            {formatActivityTimestamp(activity.createdAt)}
          </time>
          {activity.task ? (
            <span className="max-w-full truncate" title={activity.task.title}>
              Task: {activity.task.title}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function activityErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401)
    return "Your session has expired. Please sign in again.";
  if (error.status === 403) return "You no longer have access to this Project.";
  if (error.status === 404)
    return "This Project or activity page is no longer available.";
  return error.message || fallback;
}
