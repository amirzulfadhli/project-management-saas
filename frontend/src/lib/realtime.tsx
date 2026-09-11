"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";
import { authClient } from "./auth-client";
import { queryKeys } from "./queries";
import type { Task } from "./types";

export const realtimeEventTypes = {
  PROJECT_UPDATED: "PROJECT_UPDATED",
  PROJECT_ARCHIVED: "PROJECT_ARCHIVED",
  PROJECT_RESTORED: "PROJECT_RESTORED",
  PROJECT_MEMBER_ADDED: "PROJECT_MEMBER_ADDED",
  PROJECT_MEMBER_ROLE_CHANGED: "PROJECT_MEMBER_ROLE_CHANGED",
  PROJECT_MEMBER_REMOVED: "PROJECT_MEMBER_REMOVED",
  COLUMN_CREATED: "COLUMN_CREATED",
  COLUMN_RENAMED: "COLUMN_RENAMED",
  COLUMN_DELETED: "COLUMN_DELETED",
  TASK_CREATED: "TASK_CREATED",
  TASK_UPDATED: "TASK_UPDATED",
  TASK_MOVED: "TASK_MOVED",
  TASK_DELETED: "TASK_DELETED",
  COMMENT_CREATED: "COMMENT_CREATED",
  COMMENT_UPDATED: "COMMENT_UPDATED",
  COMMENT_DELETED: "COMMENT_DELETED",
  REPOSITORY_CONNECTED: "REPOSITORY_CONNECTED",
  REPOSITORY_DISCONNECTED: "REPOSITORY_DISCONNECTED",
  GITHUB_ISSUE_LINKED: "GITHUB_ISSUE_LINKED",
  GITHUB_ISSUE_UNLINKED: "GITHUB_ISSUE_UNLINKED",
  GITHUB_ISSUE_SYNCED: "GITHUB_ISSUE_SYNCED",
  TASK_CREATED_FROM_GITHUB_ISSUE: "TASK_CREATED_FROM_GITHUB_ISSUE",
  ATTACHMENT_CREATED: "ATTACHMENT_CREATED",
  ATTACHMENT_DELETED: "ATTACHMENT_DELETED",
  WIKI_PAGE_CREATED: "WIKI_PAGE_CREATED",
  WIKI_PAGE_UPDATED: "WIKI_PAGE_UPDATED",
  WIKI_PAGE_DELETED: "WIKI_PAGE_DELETED",
  WIKI_PAGE_MOVED: "WIKI_PAGE_MOVED",
  TIME_ENTRY_CREATED: "TIME_ENTRY_CREATED",
  TIMER_STARTED: "TIMER_STARTED",
  TIMER_STOPPED: "TIMER_STOPPED",
} as const;

export interface RealtimeEventEnvelope {
  id: string;
  projectId: string;
  type: (typeof realtimeEventTypes)[keyof typeof realtimeEventTypes];
  entity:
    | "project"
    | "project-member"
    | "column"
    | "task"
    | "comment"
    | "repository"
    | "github-issue"
    | "attachment"
    | "wiki-page"
    | "time-entry";
  entityId: string;
  actorId: string | null;
  taskId?: string;
  occurredAt: string;
}

type RealtimeStatus = "offline" | "connecting" | "connected" | "unavailable";

interface RealtimeContextValue {
  status: RealtimeStatus;
  subscribeProject(projectId: string): () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: session, isPending } = authClient.useSession();
  const sessionUserId = session?.user.id;
  const socketRef = useRef<Socket | null>(null);
  const subscriptions = useRef(new Map<string, number>());
  const [status, setStatus] = useState<RealtimeStatus>("offline");

  const invalidateProjectScope = useCallback(
    async (projectId: string) => {
      const taskIds = new Set<string>();
      for (const [, tasks] of queryClient.getQueriesData<Task[]>({
        queryKey: queryKeys.tasks(projectId),
      })) {
        for (const task of tasks ?? []) taskIds.add(task.id);
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.project(projectId),
          exact: true,
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectColumns(projectId),
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectMembers(projectId),
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectActivities(projectId),
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectRepository(projectId),
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectAttachments(projectId, sessionUserId),
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.wikiPages(projectId, sessionUserId),
          exact: true,
        }),
        queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === "wiki-page" &&
            (query.queryKey[1] as { projectId?: string; userId?: string })
              ?.projectId === projectId &&
            (query.queryKey[1] as { userId?: string })?.userId ===
              sessionUserId,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.githubIssueLists(projectId, sessionUserId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectTime(projectId, sessionUserId ?? null),
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.activeTimer(sessionUserId ?? null),
          exact: true,
        }),
        ...[...taskIds].map((taskId) =>
          queryClient.invalidateQueries({
            queryKey: queryKeys.taskComments(taskId),
            exact: true,
          }),
        ),
        ...[...taskIds].map((taskId) =>
          queryClient.invalidateQueries({
            queryKey: queryKeys.taskTime(taskId, sessionUserId ?? null),
            exact: true,
          }),
        ),
      ]);
    },
    [queryClient, sessionUserId],
  );

  useEffect(() => {
    if (isPending) return;
    if (!sessionUserId) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = io(`${API_URL}/realtime`, {
      autoConnect: false,
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    const resubscribe = () => {
      setStatus("connected");
      for (const projectId of subscriptions.current.keys()) {
        socket.emit("project:subscribe", { projectId }, () => {
          void invalidateProjectScope(projectId);
        });
      }
    };
    const markUnavailable = () => setStatus("unavailable");
    const handleEvent = (event: RealtimeEventEnvelope) => {
      if (!subscriptions.current.has(event.projectId)) return;

      switch (event.entity) {
        case "project":
          {
            const cachedProject = queryClient.getQueryData<{
              organizationId: string;
            }>(queryKeys.project(event.projectId));
            void queryClient.invalidateQueries({
              queryKey: queryKeys.project(event.projectId),
              exact: true,
            });
            if (cachedProject) {
              void queryClient.invalidateQueries({
                queryKey: queryKeys.organizationProjects(
                  cachedProject.organizationId,
                ),
              });
            }
          }
          break;
        case "project-member":
          void Promise.all([
            queryClient.refetchQueries({
              queryKey: queryKeys.projectMembers(event.projectId),
              exact: true,
            }),
            queryClient.refetchQueries({
              queryKey: queryKeys.project(event.projectId),
              exact: true,
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.projectActivities(event.projectId),
              exact: true,
            }),
          ]);
          break;
        case "column":
          void Promise.all([
            queryClient.invalidateQueries({
              queryKey: queryKeys.projectColumns(event.projectId),
              exact: true,
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.project(event.projectId),
              exact: true,
            }),
          ]);
          break;
        case "task":
          if (event.type === realtimeEventTypes.TASK_DELETED && event.taskId) {
            queryClient.setQueriesData<Task[]>(
              { queryKey: queryKeys.tasks(event.projectId) },
              (current) => current?.filter((task) => task.id !== event.taskId),
            );
            queryClient.removeQueries({
              queryKey: queryKeys.taskComments(event.taskId),
              exact: true,
            });
          }
          void Promise.all([
            queryClient.invalidateQueries({
              queryKey: queryKeys.tasks(event.projectId),
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.project(event.projectId),
              exact: true,
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.projectActivities(event.projectId),
              exact: true,
            }),
            ...(event.type === realtimeEventTypes.TASK_DELETED && event.taskId
              ? [
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.taskAttachments(
                      event.taskId,
                      sessionUserId,
                    ),
                    exact: true,
                  }),
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.projectAttachments(
                      event.projectId,
                      sessionUserId,
                    ),
                    exact: true,
                  }),
                ]
              : []),
          ]);
          break;
        case "comment":
          if (event.taskId) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.taskComments(event.taskId),
              exact: true,
            });
          }
          void queryClient.invalidateQueries({
            queryKey: queryKeys.projectActivities(event.projectId),
            exact: true,
          });
          break;
        case "repository":
          void Promise.all([
            queryClient.invalidateQueries({
              queryKey: queryKeys.projectRepository(event.projectId),
              exact: true,
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.projectActivities(event.projectId),
              exact: true,
            }),
          ]);
          break;
        case "github-issue":
          void Promise.all([
            queryClient.invalidateQueries({
              queryKey: queryKeys.githubIssueLists(
                event.projectId,
                sessionUserId,
              ),
            }),
            ...(event.taskId
              ? [
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.taskGithubIssue(
                      event.taskId,
                      sessionUserId,
                    ),
                    exact: true,
                  }),
                ]
              : []),
            queryClient.invalidateQueries({
              queryKey: queryKeys.tasks(event.projectId),
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.projectActivities(event.projectId),
              exact: true,
            }),
          ]);
          break;
        case "attachment":
          void Promise.all([
            queryClient.invalidateQueries({
              queryKey: queryKeys.projectAttachments(
                event.projectId,
                sessionUserId,
              ),
              exact: true,
            }),
            ...(event.taskId
              ? [
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.taskAttachments(
                      event.taskId,
                      sessionUserId,
                    ),
                    exact: true,
                  }),
                ]
              : []),
            queryClient.invalidateQueries({
              queryKey: queryKeys.projectActivities(event.projectId),
              exact: true,
            }),
          ]);
          break;
        case "wiki-page":
          void Promise.all([
            queryClient.invalidateQueries({
              queryKey: queryKeys.wikiPages(event.projectId, sessionUserId),
              exact: true,
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.wikiPage(
                event.projectId,
                event.entityId,
                sessionUserId,
              ),
              exact: true,
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.projectActivities(event.projectId),
              exact: true,
            }),
          ]);
          break;
        case "time-entry":
          void Promise.all([
            queryClient.invalidateQueries({
              queryKey: queryKeys.projectTime(event.projectId, sessionUserId),
              exact: true,
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.activeTimer(sessionUserId),
              exact: true,
            }),
            ...(event.taskId
              ? [
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.taskTime(event.taskId, sessionUserId),
                    exact: true,
                  }),
                ]
              : []),
          ]);
      }
    };
    const handleRevocation = ({ projectId }: { projectId: string }) => {
      if (!subscriptions.current.has(projectId)) return;
      void invalidateProjectScope(projectId);
    };
    const handleNotification = () => {
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications(sessionUserId),
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.notificationUnreadCount(sessionUserId),
          exact: true,
        }),
      ]);
    };

    socket.on("connect", resubscribe);
    socket.on("connect_error", markUnavailable);
    socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") setStatus("unavailable");
    });
    socket.on("project:event", handleEvent);
    socket.on("project:access-revoked", handleRevocation);
    socket.on("notification:event", handleNotification);
    socket.connect();

    return () => {
      socket.off("connect", resubscribe);
      socket.off("connect_error", markUnavailable);
      socket.off("project:event", handleEvent);
      socket.off("project:access-revoked", handleRevocation);
      socket.off("notification:event", handleNotification);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [invalidateProjectScope, isPending, queryClient, sessionUserId]);

  const subscribeProject = useCallback((projectId: string) => {
    const count = subscriptions.current.get(projectId) ?? 0;
    subscriptions.current.set(projectId, count + 1);
    if (count === 0 && socketRef.current?.connected) {
      socketRef.current.emit("project:subscribe", { projectId });
    }

    return () => {
      const current = subscriptions.current.get(projectId) ?? 0;
      if (current <= 1) {
        subscriptions.current.delete(projectId);
        socketRef.current?.emit("project:unsubscribe", { projectId });
      } else {
        subscriptions.current.set(projectId, current - 1);
      }
    };
  }, []);

  const effectiveStatus: RealtimeStatus = sessionUserId ? status : "offline";

  return (
    <RealtimeContext.Provider
      value={{ status: effectiveStatus, subscribeProject }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useProjectRealtime(
  projectId: string | null,
  enabled = true,
): RealtimeStatus {
  const realtime = useContext(RealtimeContext);
  if (!realtime) throw new Error("RealtimeProvider is missing");
  const { status, subscribeProject } = realtime;

  useEffect(() => {
    if (!enabled || !projectId) return;
    return subscribeProject(projectId);
  }, [enabled, projectId, subscribeProject]);

  return status;
}
