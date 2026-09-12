"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Column, Task, UpdateTaskInput, UserSummary } from "@/lib/types";
import { queryKeys } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";

import {
  taskFields,
  taskDraftKey,
  useTaskDrafts,
  type TaskFields,
} from "./task-drafts";

interface TaskModalProps {
  embedded?: boolean;
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

export function TaskModal({
  onClose,
  organizationId,
  projectId,
  columns,
  task,
  defaultColumnId,
  eligibleAssignees,
  currentUserId,
  embedded = false,
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

  const drafts = useTaskDrafts();
  const draftKey = taskDraftKey(projectId, task?.id ?? "new");
  const [initial] = useState(
    () =>
      drafts.get(draftKey) ?? {
        baseline: task
          ? taskFields(task)
          : {
              title: "",
              description: "",
              priority: 1,
              columnId: initialColumnId,
              assigneeId: "",
              dueDate: "",
            },
        fields: task
          ? taskFields(task)
          : {
              title: "",
              description: "",
              priority: 1,
              columnId: initialColumnId,
              assigneeId: "",
              dueDate: "",
            },
        updatedAt: task?.updatedAt,
      },
  );
  const [fields, setFields] = useState<TaskFields>(initial.fields);
  const { title, description, priority, columnId, assigneeId, dueDate } =
    fields;
  const setField = <K extends keyof TaskFields>(key: K, value: TaskFields[K]) =>
    setFields((current) => ({ ...current, [key]: value }));
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial.baseline);
  useEffect(() => {
    if (dirty) drafts.set(draftKey, { ...initial, fields });
    else drafts.delete(draftKey);
  }, [dirty, drafts, draftKey, fields, initial]);
  const [error, setError] = useState<string | null>(null);
  const discard = () => {
    if (dirty && !window.confirm("Discard unsaved Task changes?")) return;
    drafts.delete(draftKey);
    onClose();
  };
  const saved = () => {
    drafts.delete(draftKey);
    onClose();
  };
  const remoteChanged = Boolean(task && task.updatedAt !== initial.updatedAt);

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
      saved();
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

      // Send only explicitly changed fields; a title edit must not undo a remote move.
      const input: UpdateTaskInput = {};
      if (title !== initial.baseline.title) input.title = title.trim();
      if (description !== initial.baseline.description)
        input.description = description.trim() || null;
      if (columnId !== initial.baseline.columnId) input.columnId = columnId;
      if (priority !== initial.baseline.priority) input.priority = priority;
      if (dueDate !== initial.baseline.dueDate) input.dueDate = dueDate || null;
      if (assigneeId !== initial.baseline.assigneeId)
        input.assigneeId = assigneeId || null;
      return api.updateTask(task.id, input);
    },
    onMutate: async (): Promise<TaskMutationContext> => {
      if (!task) return {};

      await queryClient.cancelQueries({ queryKey: listKey, exact: true });
      const previousTasks = queryClient.getQueryData<Task[]>(listKey);

      if (
        previousTasks &&
        selectedColumn &&
        columnId !== initial.baseline.columnId &&
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
      queryClient.setQueryData(
        queryKeys.task(projectId, updatedTask.id, currentUserId),
        updatedTask,
      );
      queryClient.setQueryData<Task[]>(listKey, (current) =>
        (current ?? []).map((item) =>
          item.id === updatedTask.id ? updatedTask : item,
        ),
      );
      saved();
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
      drafts.delete(draftKey);
      if (task) {
        await queryClient.cancelQueries({
          queryKey: queryKeys.task(projectId, task.id, currentUserId),
          exact: true,
        });
        queryClient.setQueryData(
          queryKeys.task(projectId, task.id, currentUserId),
          null,
        );
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
    (!isEdit || dirty) &&
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

  const form = (
    <form id="task-details-panel" onSubmit={handleSubmit} className="space-y-4">
      <fieldset
        className="space-y-4"
        disabled={
          createTask.isPending || updateTask.isPending || deleteTask.isPending
        }
      >
        {remoteChanged && (
          <p role="status" className="text-sm text-text-secondary">
            This Task changed while you were editing. Your draft is preserved.
            Saving replaces only fields you changed; cancel and reopen to use
            the latest values.
          </p>
        )}
        {dirty && (
          <p className="text-xs text-text-secondary">
            Unsaved changes stay in this session when you navigate away.
          </p>
        )}
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
            onChange={(event) => setField("title", event.target.value)}
            placeholder="Task title"
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
            onChange={(event) => setField("description", event.target.value)}
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
              onChange={(event) => setField("columnId", event.target.value)}
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
              onChange={(event) => setField("assigneeId", event.target.value)}
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
              onChange={(event) =>
                setField("priority", Number(event.target.value))
              }
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
              onChange={(event) => setField("dueDate", event.target.value)}
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
            <Button type="button" variant="ghost" onClick={discard}>
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
      </fieldset>
    </form>
  );
  return embedded ? (
    form
  ) : (
    <Modal open onClose={discard} title="New Task">
      {form}
    </Modal>
  );
}
