"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { Column } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";

interface ProjectColumnsModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  focusColumnId?: string;
}

interface RenameColumnInput {
  columnId: string;
  name: string;
}

function sortColumns(columns: Column[]): Column[] {
  return [...columns].sort(
    (left, right) =>
      left.position - right.position || left.id.localeCompare(right.id),
  );
}

function columnErrorMessage(
  error: unknown,
  operation: "create" | "rename" | "delete",
): string {
  if (!(error instanceof ApiError)) {
    return `Failed to ${operation} the Column.`;
  }

  if (error.status === 401) {
    return "Your session has expired. Sign in again and retry.";
  }
  if (error.status === 403) {
    return "You do not have permission to manage Columns in this Project.";
  }
  if (error.status === 404) {
    return "This Project or Column is no longer available.";
  }
  if (error.status === 409 && operation === "delete") {
    return "This Column still contains Tasks. Move or permanently delete those Tasks before deleting the Column.";
  }
  if (error.status === 409) {
    return "The Board changed while this request was running. Retry the action.";
  }

  return error.message;
}

export function ProjectColumnsModal({
  open,
  onClose,
  projectId,
  focusColumnId,
}: ProjectColumnsModalProps) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const columnsKey = queryKeys.projectColumns(projectId);
  const columnsQuery = useQuery({
    queryKey: columnsKey,
    queryFn: () => api.getProjectColumns(projectId),
    enabled: open && Boolean(projectId),
  });
  const columns = columnsQuery.data ?? [];
  useEffect(() => {
    if (focusColumnId && columnsQuery.isSuccess)
      document
        .getElementById(`manage-column-${focusColumnId}`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [focusColumnId, columnsQuery.isSuccess]);

  const refreshProjectCaches = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: columnsKey, exact: true }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.project(projectId),
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.tasks(projectId),
      }),
    ]);
  };

  const createColumn = useMutation({
    mutationFn: (name: string) => api.createProjectColumn(projectId, { name }),
    onSuccess: async (createdColumn) => {
      queryClient.setQueryData<Column[]>(columnsKey, (current) =>
        sortColumns([
          ...(current ?? []).filter((column) => column.id !== createdColumn.id),
          createdColumn,
        ]),
      );
      setNewName("");
      setMutationError(null);
      setNotice(`Column "${createdColumn.name}" was added.`);
      await refreshProjectCaches();
    },
    onError: (error: unknown) => {
      setNotice(null);
      setMutationError(columnErrorMessage(error, "create"));
    },
  });

  const renameColumn = useMutation({
    mutationFn: ({ columnId, name }: RenameColumnInput) =>
      api.updateProjectColumn(projectId, columnId, { name }),
    onSuccess: async (updatedColumn) => {
      queryClient.setQueryData<Column[]>(columnsKey, (current) =>
        sortColumns(
          (current ?? []).map((column) =>
            column.id === updatedColumn.id ? updatedColumn : column,
          ),
        ),
      );
      setEditingColumnId(null);
      setRenameName("");
      setMutationError(null);
      setNotice(`Column renamed to "${updatedColumn.name}".`);
      await refreshProjectCaches();
    },
    onError: (error: unknown) => {
      setNotice(null);
      setMutationError(columnErrorMessage(error, "rename"));
    },
  });

  const deleteColumn = useMutation({
    mutationFn: (column: Column) =>
      api.deleteProjectColumn(projectId, column.id),
    onSuccess: async (_result, deletedColumn) => {
      queryClient.setQueryData<Column[]>(columnsKey, (current) =>
        (current ?? []).filter((column) => column.id !== deletedColumn.id),
      );
      if (editingColumnId === deletedColumn.id) {
        setEditingColumnId(null);
        setRenameName("");
      }
      setMutationError(null);
      setNotice(`Empty Column "${deletedColumn.name}" was deleted.`);
      await refreshProjectCaches();
    },
    onError: (error: unknown) => {
      setNotice(null);
      setMutationError(columnErrorMessage(error, "delete"));
    },
  });

  const mutationIsPending =
    createColumn.isPending || renameColumn.isPending || deleteColumn.isPending;
  const trimmedNewName = newName.trim();
  const trimmedRenameName = renameName.trim();

  const confirmDelete = (column: Column) => {
    const confirmed = window.confirm(
      `Permanently delete the empty Column "${column.name}"? Columns containing Tasks cannot be deleted, and Tasks are never moved or deleted automatically.`,
    );
    if (!confirmed) return;

    setMutationError(null);
    setNotice(null);
    deleteColumn.mutate(column);
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage Columns">
      <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
        <p className="text-sm text-text-secondary">
          Columns stay in server-defined order. Reordering is not available yet.
        </p>

        {columnsQuery.isPending ? (
          <div
            className="flex items-center justify-center gap-2 py-8 text-sm text-text-secondary"
            role="status"
          >
            <Spinner /> Loading Columns...
          </div>
        ) : columnsQuery.isError ? (
          <ErrorState
            message={
              columnsQuery.error instanceof ApiError
                ? columnsQuery.error.message
                : "Failed to load Project Columns."
            }
            onRetry={() => columnsQuery.refetch()}
          />
        ) : (
          <>
            {columns.length === 0 ? (
              <EmptyState
                title="No Columns"
                description="Add the first Column to make this Board usable."
              />
            ) : (
              <ol className="divide-y divide-border rounded-md border border-border">
                {columns.map((column) => {
                  const isEditing = editingColumnId === column.id;
                  return (
                    <li
                      key={column.id}
                      id={`manage-column-${column.id}`}
                      className="px-3 py-3"
                    >
                      {isEditing ? (
                        <form
                          className="space-y-3"
                          onSubmit={(event) => {
                            event.preventDefault();
                            if (
                              !trimmedRenameName ||
                              trimmedRenameName.length > 120 ||
                              trimmedRenameName === column.name ||
                              mutationIsPending
                            ) {
                              return;
                            }
                            setMutationError(null);
                            setNotice(null);
                            renameColumn.mutate({
                              columnId: column.id,
                              name: trimmedRenameName,
                            });
                          }}
                        >
                          <div className="space-y-1.5">
                            <label
                              htmlFor={`rename-column-${column.id}`}
                              className="text-xs font-medium text-text-primary"
                            >
                              Column name
                            </label>
                            <Input
                              id={`rename-column-${column.id}`}
                              autoFocus
                              value={renameName}
                              maxLength={120}
                              disabled={mutationIsPending}
                              onChange={(event) =>
                                setRenameName(event.target.value)
                              }
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={mutationIsPending}
                              onClick={() => {
                                setEditingColumnId(null);
                                setRenameName("");
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="submit"
                              size="sm"
                              disabled={
                                !trimmedRenameName ||
                                trimmedRenameName.length > 120 ||
                                trimmedRenameName === column.name ||
                                mutationIsPending
                              }
                            >
                              {renameColumn.isPending ? "Saving..." : "Save"}
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="min-w-0 truncate text-sm font-medium text-text-primary">
                            {column.name}
                          </p>
                          <div className="flex shrink-0 items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={mutationIsPending}
                              onClick={() => {
                                setEditingColumnId(column.id);
                                setRenameName(column.name);
                                setMutationError(null);
                                setNotice(null);
                              }}
                            >
                              Rename
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={mutationIsPending}
                              onClick={() => confirmDelete(column)}
                            >
                              {deleteColumn.isPending &&
                              deleteColumn.variables?.id === column.id
                                ? "Deleting..."
                                : "Delete empty Column"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}

            <form
              className="space-y-3 rounded-md border border-border bg-background p-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  !trimmedNewName ||
                  trimmedNewName.length > 120 ||
                  mutationIsPending
                ) {
                  return;
                }
                setMutationError(null);
                setNotice(null);
                createColumn.mutate(trimmedNewName);
              }}
            >
              <div>
                <h3 className="text-sm font-medium text-text-primary">
                  Add Column
                </h3>
                <p className="mt-1 text-xs text-text-secondary">
                  The server appends it after the current last Column.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <label
                    htmlFor="new-project-column"
                    className="text-xs font-medium text-text-primary"
                  >
                    Column name
                  </label>
                  <Input
                    id="new-project-column"
                    value={newName}
                    maxLength={120}
                    placeholder="e.g. Ready for release"
                    disabled={mutationIsPending}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={
                    !trimmedNewName ||
                    trimmedNewName.length > 120 ||
                    mutationIsPending
                  }
                >
                  {createColumn.isPending ? "Adding..." : "Add Column"}
                </Button>
              </div>
            </form>
          </>
        )}

        {notice ? (
          <p
            className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
            role="status"
          >
            {notice}
          </p>
        ) : null}
        {mutationError ? (
          <p
            className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {mutationError}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
