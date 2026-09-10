"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Column, Task, UpdateTaskInput, UserSummary } from "@/lib/types";
import { queryKeys } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { TaskComments } from "@/components/tasks/task-comments";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { TaskTimePanel } from "@/components/time-tracking/task-time-panel";
import { TaskGithubPanel } from "@/components/github/task-github-panel";

interface TaskModalProps {
  onClose: () => void;
  organizationId: string;
  projectId: string;
  columns: Column[];
  task?: Task | null;
  defaultColumnId?: string;
  eligibleAssignees: UserSummary[] | null;
  currentUserId: string | null;
  canModerateComments: boolean;
}

interface TaskMutationContext {
  previousTasks?: Task[];
}

const taskPanels = [
  { id: "details", label: "Details" },
  { id: "comments", label: "Comments" },
  { id: "attachments", label: "Files" },
  { id: "time", label: "Time tracking" },
  { id: "github", label: "GitHub" },
] as const;

export function TaskModal({
  onClose,
  organizationId,
  projectId,
  columns,
  task,
  defaultColumnId,
  eligibleAssignees,
  currentUserId,
  canModerateComments,
}: TaskModalProps) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(task);
  const projectColumns = columns.filter(
    (column) => column.projectId === projectId,
  );
  const initialColumnId =
    [task?.columnId, defaultColumnId].find(
      (candidate) =>
        candidate && projectColumns.some((column) => column.id === candidate),
    ) ??
    projectColumns[0]?.id ??
    "";

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState(task?.priority ?? 1);
  const [columnId, setColumnId] = useState(initialColumnId);
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? "");
  const [dueDate, setDueDate] = useState(
    task?.dueDate ? task.dueDate.slice(0, 10) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<
    "details" | "comments" | "attachments" | "time" | "github"
  >("details");

  const listKey = queryKeys.tasks(projectId);
  const selectedColumn = projectColumns.find(
    (column) => column.id === columnId,
  );

  const createTask = useMutation({
    mutationFn: () =>
      api.createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        projectId,
        columnId,
        assigneeId: assigneeId || undefined,
        priority,
        // A date input produces YYYY-MM-DD, which the backend accepts as ISO.
        dueDate: dueDate || undefined,
      }),
    onSuccess: async (createdTask) => {
      queryClient.setQueryData<Task[]>(listKey, (current) => [
        createdTask,
        ...(current ?? []).filter((item) => item.id !== createdTask.id),
      ]);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.project(projectId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projects(organizationId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectActivities(projectId),
          exact: true,
        }),
      ]);
      onClose();
    },
    onError: (mutationError: unknown) =>
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : "Failed to create task",
      ),
  });

  const updateTask = useMutation({
    mutationFn: () => {
      if (!task) {
        throw new Error("Task is required for an update.");
      }

      const input: UpdateTaskInput = {
        title: title.trim(),
        description: description.trim() || null,
        columnId,
        priority,
        dueDate: dueDate || null,
        ...(assigneeId !== (task.assigneeId ?? "") && {
          assigneeId: assigneeId || null,
        }),
      };
      return api.updateTask(task.id, input);
    },
    onMutate: async (): Promise<TaskMutationContext> => {
      if (!task) return {};

      await queryClient.cancelQueries({ queryKey: listKey, exact: true });
      const previousTasks = queryClient.getQueryData<Task[]>(listKey);

      if (
        previousTasks &&
        selectedColumn &&
        selectedColumn.id !== task.columnId
      ) {
        const appendPosition = previousTasks.reduce(
          (nextPosition, item) =>
            item.columnId === selectedColumn.id
              ? Math.max(nextPosition, item.position + 1)
              : nextPosition,
          0,
        );
        queryClient.setQueryData<Task[]>(
          listKey,
          previousTasks.map((item) =>
            item.id === task.id
              ? {
                  ...item,
                  columnId: selectedColumn.id,
                  position: appendPosition,
                  column: {
                    id: selectedColumn.id,
                    name: selectedColumn.name,
                    position: selectedColumn.position,
                  },
                }
              : item,
          ),
        );
      }

      return { previousTasks };
    },
    onSuccess: (updatedTask) => {
      queryClient.setQueryData<Task[]>(listKey, (current) =>
        (current ?? []).map((item) =>
          item.id === updatedTask.id ? updatedTask : item,
        ),
      );
      onClose();
    },
    onError: (mutationError: unknown, _input, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(listKey, context.previousTasks);
      }
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : "Failed to update task",
      );
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey, exact: true }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.project(projectId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectActivities(projectId),
          exact: true,
        }),
      ]);
    },
  });

  const deleteTask = useMutation({
    mutationFn: () => {
      if (!task) {
        throw new Error("Task is required for deletion.");
      }
      return api.deleteTask(task.id);
    },
    onSuccess: async () => {
      onClose();
      if (task) {
        queryClient.setQueryData<Task[]>(listKey, (current) =>
          current?.filter((item) => item.id !== task.id),
        );
        queryClient.removeQueries({
          queryKey: queryKeys.taskComments(task.id),
          exact: true,
        });
        queryClient.removeQueries({
          queryKey: queryKeys.taskAttachments(task.id, currentUserId),
          exact: true,
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.projects(organizationId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectAttachments(projectId, currentUserId),
          exact: true,
        }),
      ]);
    },
    onError: (mutationError: unknown) => {
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : "Failed to delete task",
      );
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey, exact: true }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.project(projectId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectActivities(projectId),
          exact: true,
        }),
      ]);
    },
  });

  const canSubmit =
    title.trim().length > 0 &&
    Boolean(selectedColumn) &&
    !createTask.isPending &&
    !updateTask.isPending &&
    !deleteTask.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    if (isEdit) updateTask.mutate();
    else createTask.mutate();
  };

  const handleDelete = () => {
    if (
      task &&
      window.confirm(
        `Permanently delete "${task.title}"? This action cannot be undone.`,
      )
    ) {
      setError(null);
      deleteTask.mutate();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? task?.title || "Task" : "New Task"}
      size={isEdit ? "lg" : "md"}
    >
      {isEdit ? (
        <div
          className="mb-4 flex flex-wrap gap-1 rounded-md bg-hover p-1"
          role="tablist"
          aria-label="Task sections"
        >
          {taskPanels.map((panel) => (
            <button
              key={panel.id}
              id={`task-${panel.id}-tab`}
              type="button"
              role="tab"
              aria-selected={activePanel === panel.id}
              aria-controls={`task-${panel.id}-panel`}
              onClick={() => setActivePanel(panel.id)}
              className={`min-w-24 flex-1 rounded-sm px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                activePanel === panel.id
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {panel.label}
            </button>
          ))}
        </div>
      ) : null}

      {activePanel === "details" ? (
        <form
          id="task-details-panel"
          role="tabpanel"
          aria-labelledby="task-details-tab"
          onSubmit={handleSubmit}
          className="max-h-[68vh] space-y-4 overflow-y-auto pr-1"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="task-title"
              className="text-sm font-medium text-text-primary"
            >
              Title
            </label>
            <Input
              id="task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Task title"
              autoFocus
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="task-description"
              className="text-sm font-medium text-text-primary"
            >
              Description
            </label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional"
              rows={3}
              maxLength={10000}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="task-column"
                className="text-sm font-medium text-text-primary"
              >
                Column
              </label>
              <Select
                id="task-column"
                value={columnId}
                onChange={(event) => setColumnId(event.target.value)}
              >
                {projectColumns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="task-assignee"
                className="text-sm font-medium text-text-primary"
              >
                Assignee
              </label>
              <Select
                id="task-assignee"
                value={assigneeId}
                disabled={!eligibleAssignees}
                onChange={(event) => setAssigneeId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {eligibleAssignees ? (
                  <>
                    {task?.assignee &&
                    !eligibleAssignees.some(
                      (candidate) => candidate.id === task.assignee?.id,
                    ) ? (
                      <option value={task.assignee.id} disabled>
                        {task.assignee.name} (no longer has access)
                      </option>
                    ) : null}
                    {eligibleAssignees.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name} ({candidate.email})
                      </option>
                    ))}
                  </>
                ) : task?.assignee ? (
                  <option value={task.assignee.id}>{task.assignee.name}</option>
                ) : null}
              </Select>
              {!eligibleAssignees ? (
                <p className="text-xs text-text-secondary">
                  Assignee changes are unavailable until the Project&apos;s
                  Organization collaborators load.
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="task-priority"
                className="text-sm font-medium text-text-primary"
              >
                Priority
              </label>
              <Select
                id="task-priority"
                value={priority}
                onChange={(event) => setPriority(Number(event.target.value))}
              >
                {[1, 2, 3, 4].map((value) => (
                  <option key={value} value={value}>
                    {["Low", "Medium", "High", "Urgent"][value - 1]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="task-due"
                className="text-sm font-medium text-text-primary"
              >
                Due date
              </label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          </div>

          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 pt-1">
            <div>
              {isEdit ? (
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleDelete}
                  disabled={deleteTask.isPending}
                >
                  {deleteTask.isPending
                    ? "Deleting permanently..."
                    : "Delete permanently"}
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {createTask.isPending || updateTask.isPending
                  ? "Saving..."
                  : isEdit
                    ? "Save"
                    : "Create Task"}
              </Button>
            </div>
          </div>
        </form>
      ) : activePanel === "comments" && task ? (
        <div
          id="task-comments-panel"
          role="tabpanel"
          aria-labelledby="task-comments-tab"
        >
          <TaskComments
            taskId={task.id}
            projectId={projectId}
            currentUserId={currentUserId}
            canModerate={canModerateComments}
          />
        </div>
      ) : activePanel === "attachments" && task ? (
        <div
          id="task-attachments-panel"
          role="tabpanel"
          aria-labelledby="task-attachments-tab"
          className="max-h-[68vh] overflow-y-auto pr-1"
        >
          <AttachmentsPanel
            scope="task"
            resourceId={task.id}
            projectId={projectId}
            currentUserId={currentUserId}
            canAdminister={canModerateComments}
          />
        </div>
      ) : activePanel === "time" && task ? (
        <div
          id="task-time-panel"
          role="tabpanel"
          aria-labelledby="task-time-tab"
        >
          <TaskTimePanel
            taskId={task.id}
            projectId={projectId}
            currentUserId={currentUserId}
          />
        </div>
      ) : activePanel === "github" && task ? (
        <div
          id="task-github-panel"
          role="tabpanel"
          aria-labelledby="task-github-tab"
          className="max-h-[68vh] overflow-y-auto pr-1"
        >
          <TaskGithubPanel
            taskId={task.id}
            projectId={projectId}
            currentUserId={currentUserId}
          />
        </div>
      ) : null}
    </Modal>
  );
}
