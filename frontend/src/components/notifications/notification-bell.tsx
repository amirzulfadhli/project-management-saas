"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { taskHref } from "@/lib/task-links";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { NotificationItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { Modal } from "@/components/ui/modal";

function metadataText(
  notification: NotificationItem,
  key: string,
): string | null {
  const value = notification.metadata?.[key];
  return typeof value === "string" ? value : null;
}

function notificationMessage(notification: NotificationItem): string {
  const actor = notification.actor.name;
  const task = metadataText(notification, "taskTitle") ?? "a Task";
  const role = metadataText(notification, "role") ?? "MEMBER";
  switch (notification.type) {
    case "TASK_ASSIGNED_TO_YOU":
      return `${actor} assigned you to ${task}`;
    case "TASK_UNASSIGNED_FROM_YOU":
      return `${actor} unassigned you from ${task}`;
    case "COMMENT_REPLY_TO_YOU":
      return `${actor} replied to your comment on ${task}`;
    case "COMMENT_ON_YOUR_TASK":
      return `${actor} commented on ${task}`;
    case "PROJECT_MEMBER_ADDED_YOU":
      return `${actor} added you to ${notification.project.name} as ${role}`;
    case "PROJECT_MEMBER_ROLE_CHANGED_YOU":
      return `${actor} changed your role in ${notification.project.name} to ${role}`;
    default:
      return `${actor} updated ${notification.project.name}`;
  }
}

function timestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const elapsed = Date.now() - date.getTime();
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationBell() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "signed-out";
  const [open, setOpen] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const unread = useQuery({
    queryKey: queryKeys.notificationUnreadCount(userId),
    queryFn: api.getNotificationUnreadCount,
    enabled: Boolean(session?.user.id),
  });
  const notifications = useInfiniteQuery({
    queryKey: queryKeys.notifications(userId),
    queryFn: ({ pageParam }) =>
      api.getNotifications({ cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: open && Boolean(session?.user.id),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications(userId),
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.notificationUnreadCount(userId),
        exact: true,
      }),
    ]);
  };
  const markRead = useMutation({
    mutationFn: api.markNotificationRead,
    onSuccess: refresh,
    onError: (error) => setMutationError(messageFor(error)),
  });
  const markAllRead = useMutation({
    mutationFn: api.markAllNotificationsRead,
    onSuccess: refresh,
    onError: (error) => setMutationError(messageFor(error)),
  });

  const items = [
    ...new Map(
      (notifications.data?.pages.flatMap((page) => page.items) ?? []).map(
        (item) => [item.id, item],
      ),
    ).values(),
  ];
  const count = unread.data?.count ?? 0;

  async function openNotification(notification: NotificationItem) {
    setMutationError(null);
    if (!notification.readAt) {
      try {
        await markRead.mutateAsync(notification.id);
      } catch {
        // Keep the server failure visible instead of closing its only error surface.
        return;
      }
    }
    if (!mounted.current) return;
    setOpen(false);
    const taskId =
      notification.entityType === "task"
        ? notification.entityId
        : notification.entityType === "comment"
          ? metadataText(notification, "taskId")
          : null;
    router.push(
      taskId
        ? taskHref(notification.projectId, taskId)
        : `/projects/${notification.projectId}`,
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={
          unread.isError
            ? "Notifications, unread count unavailable"
            : count
              ? `Notifications, ${count} unread`
              : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setMutationError(null);
          setOpen((value) => !value);
        }}
        className="icon-control relative gap-2 px-2 text-text-secondary transition-colors hover:bg-hover hover:text-text-primary"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-5 w-5"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        <span className="hidden text-sm font-medium sm:inline">
          Notifications
        </span>
        {count > 0 ? (
          <span className="absolute right-0 top-0 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        placement="header"
      >
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-border pb-2">
          <span className="text-xs text-text-secondary">
            {unread.isPending
              ? "Loading unread count…"
              : unread.isError
                ? "Unread count unavailable"
                : `${count} unread`}
          </span>
          {unread.isError ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void unread.refetch()}
            >
              Retry count
            </Button>
          ) : null}
          {count > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={markAllRead.isPending || markRead.isPending}
              onClick={() => {
                setMutationError(null);
                markAllRead.mutate();
              }}
            >
              {markAllRead.isPending ? "Marking…" : "Mark all read"}
            </Button>
          ) : null}
        </div>

        {mutationError ? (
          <p
            role="alert"
            className="border-b border-danger/20 px-4 py-2 text-sm text-danger"
          >
            {mutationError}
          </p>
        ) : null}

        <div>
          {notifications.isPending ? (
            <div
              className="flex items-center justify-center gap-2 p-6 text-sm text-text-secondary"
              role="status"
            >
              <Spinner /> Loading notifications…
            </div>
          ) : notifications.isError &&
            (!notifications.isFetchNextPageError ||
              items.length === 0 ||
              (notifications.error instanceof ApiError &&
                [401, 403].includes(notifications.error.status))) ? (
            <div className="space-y-3 p-5 text-center">
              <p className="text-sm text-danger">
                {messageFor(notifications.error)}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void notifications.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-medium">You’re all caught up</p>
              <p className="mt-1 text-sm text-text-secondary">
                Meaningful collaboration updates will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((notification) => (
                <div
                  key={notification.id}
                  className={notification.readAt ? "bg-surface" : "bg-selected"}
                >
                  <button
                    type="button"
                    disabled={markRead.isPending || markAllRead.isPending}
                    onClick={() => void openNotification(notification)}
                    className={`block w-full px-3 py-3 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:cursor-wait ${notification.readAt ? "bg-surface" : "bg-selected"}`}
                  >
                    <span className="block text-sm leading-5 break-words">
                      {notificationMessage(notification)}
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-3 text-xs text-text-secondary">
                      <span className="min-w-0 truncate">
                        {notification.project.name}
                      </span>
                      <time
                        className="shrink-0"
                        dateTime={notification.createdAt}
                      >
                        {timestamp(notification.createdAt)}
                      </time>
                    </span>
                    <span className="mt-1 block text-xs text-text-secondary">
                      {notification.readAt ? "Read" : "Unread"}
                    </span>
                  </button>
                  {!notification.readAt && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={markRead.isPending || markAllRead.isPending}
                      aria-label={`Mark read: ${notificationMessage(notification)}`}
                      onClick={() => {
                        setMutationError(null);
                        markRead.mutate(notification.id);
                      }}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {notifications.hasNextPage ? (
            <div className="border-t border-border p-3 text-center">
              <Button
                variant="secondary"
                size="sm"
                disabled={notifications.isFetchingNextPage}
                onClick={() => void notifications.fetchNextPage()}
              >
                {notifications.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
              {notifications.isFetchNextPageError ? (
                <p className="mt-2 text-xs text-danger">
                  Could not load more notifications.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Your session has expired. Please sign in again.";
    if (error.status === 404)
      return "That notification is no longer available.";
    return error.message;
  }
  return "Notifications are temporarily unavailable.";
}
