"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { Task } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TaskModal } from "@/components/tasks/task-modal";
import { ProjectKanban } from "./project-kanban";
import { ProjectColumnsModal } from "./project-columns-modal";
import { useProjectWorkspace } from "./project-workspace";
interface TaskModalState {
  open: boolean;
  task: Task | null;
  defaultColumnId?: string;
}

export function ProjectBoard() {
  const {
    project: data,
    columns,
    columnsQuery,
    eligibleAssignees,
    currentUserId,
    canAdministerProject,
  } = useProjectWorkspace();
  const id = data.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [taskModal, setTaskModal] = useState<TaskModalState>({
    open: false,
    task: null,
  });
  const [columnsOpen, setColumnsOpen] = useState(false);
  const requestedTaskId = searchParams.get("task");
  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks(id),
    queryFn: () => api.getTasks(id),
  });
  const requestedTask = requestedTaskId
    ? tasksQuery.data?.find((task) => task.id === requestedTaskId)
    : undefined;
  const requestedTaskIsUnavailable = Boolean(
    requestedTaskId && tasksQuery.isSuccess && !requestedTask,
  );
  const visibleTaskModal: TaskModalState = requestedTaskId
    ? requestedTask
      ? { open: true, task: requestedTask }
      : { open: false, task: null }
    : taskModal;

  const closeTaskModal = () => {
    setTaskModal({ open: false, task: null });
    router.replace(`/projects/${id}`, { scroll: false });
  };

  const openTaskModal = (task: Task) => {
    setTaskModal({ open: true, task });
    router.replace(`/projects/${id}?task=${task.id}`, { scroll: false });
  };

  return (
    <div className="min-w-0 space-y-4">
      {canAdministerProject ? (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setColumnsOpen(true)}
          >
            Manage Columns
          </Button>
        </div>
      ) : null}
      {requestedTaskIsUnavailable ? (
        <p role="status" className="text-sm text-text-secondary">
          This task is no longer available.
        </p>
      ) : null}
      {/* Board */}
      {columnsQuery.isError ? (
        <ErrorState
          message={
            columnsQuery.error instanceof ApiError
              ? columnsQuery.error.message
              : "Failed to load Project Columns."
          }
          onRetry={() => columnsQuery.refetch()}
        />
      ) : tasksQuery.isPending ||
        (columnsQuery.isPending && columns.length === 0) ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-secondary">
          <Spinner /> Loading Board...
        </div>
      ) : tasksQuery.isError ? (
        <ErrorState
          message={
            tasksQuery.error instanceof ApiError
              ? tasksQuery.error.message
              : "Failed to load tasks."
          }
          onRetry={() => tasksQuery.refetch()}
        />
      ) : columns.length === 0 ? (
        <EmptyState title="This project has no board yet." />
      ) : (
        <ProjectKanban
          projectId={data.id}
          columns={columns}
          tasks={tasksQuery.data ?? []}
          onOpenTask={openTaskModal}
          onCreateTask={(columnId) =>
            setTaskModal({
              open: true,
              task: null,
              defaultColumnId: columnId,
            })
          }
        />
      )}

      {visibleTaskModal.open ? (
        <TaskModal
          onClose={closeTaskModal}
          organizationId={data.organizationId}
          projectId={data.id}
          columns={columns}
          task={visibleTaskModal.task}
          defaultColumnId={visibleTaskModal.defaultColumnId}
          eligibleAssignees={eligibleAssignees}
          currentUserId={currentUserId}
          canModerateComments={canAdministerProject}
        />
      ) : null}

      {columnsOpen && canAdministerProject ? (
        <ProjectColumnsModal
          open
          onClose={() => setColumnsOpen(false)}
          projectId={id}
        />
      ) : null}
    </div>
  );
}
