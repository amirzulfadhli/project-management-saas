"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { taskHref } from "@/lib/task-links";
import type { Task } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TaskRoute } from "@/components/tasks/task-route";
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
  const [managedColumnId, setManagedColumnId] = useState<string | undefined>();
  const [columnsOpen, setColumnsOpen] = useState(false);
  const requestedTaskId = searchParams.get("task");
  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks(id),
    queryFn: () => api.getTasks(id),
    enabled: !requestedTaskId,
  });
  const closeTaskModal = () => setTaskModal({ open: false, task: null });
  const openTaskModal = (task: Task) =>
    router.push(taskHref(id, task.id), { scroll: false });

  if (requestedTaskId)
    return <TaskRoute projectId={id} taskId={requestedTaskId} />;

  return (
    <div className="min-w-0 space-y-4">
      {canAdministerProject ? (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setManagedColumnId(undefined);
              setColumnsOpen(true);
            }}
          >
            Manage Columns
          </Button>
        </div>
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
          onManageColumn={
            canAdministerProject
              ? (columnId) => {
                  setManagedColumnId(columnId);
                  setColumnsOpen(true);
                }
              : undefined
          }
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

      {taskModal.open ? (
        <TaskModal
          onClose={closeTaskModal}
          organizationId={data.organizationId}
          projectId={data.id}
          columns={columns}
          task={taskModal.task}
          defaultColumnId={taskModal.defaultColumnId}
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
          focusColumnId={managedColumnId}
        />
      ) : null}
    </div>
  );
}
