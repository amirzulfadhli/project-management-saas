"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { Task } from "@/lib/types";
import { formatDate, priorityLabel, priorityTone } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function TaskRow({
  task,
  organizationId,
}: {
  task: Task;
  organizationId: string;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const due = formatDate(task.dueDate);
  const listKey = queryKeys.tasks(task.projectId);

  const remove = useMutation({
    mutationFn: () => api.deleteTask(task.id),
    onSuccess: async () => {
      queryClient.setQueryData<Task[]>(listKey, (current) =>
        current?.filter((item) => item.id !== task.id),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey, exact: true }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.project(task.projectId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projects(organizationId),
        }),
      ]);
    },
    onError: (mutationError: unknown) =>
      setError(
        mutationError instanceof ApiError
          ? mutationError.message
          : "Failed to delete task",
      ),
  });

  const handleDelete = () => {
    if (
      window.confirm(
        `Permanently delete "${task.title}"? This action cannot be undone.`,
      )
    ) {
      setError(null);
      remove.mutate();
    }
  };

  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/projects/${task.projectId}`}
            className="block truncate text-sm font-medium text-text-primary hover:text-primary"
          >
            {task.title}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span>{task.project.name}</span>
            <span aria-hidden="true">·</span>
            <span>{task.column.name}</span>
            {due ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{due}</span>
              </>
            ) : null}
          </div>
        </div>

        <Badge tone={priorityTone(task.priority)}>
          {priorityLabel(task.priority)}
        </Badge>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={remove.isPending}
        >
          {remove.isPending ? "Deleting..." : "Delete permanently"}
        </Button>
      </div>

      {error ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
