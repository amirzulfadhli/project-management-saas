"use client";

import type { ReactNode } from "react";
import type { Task } from "@/lib/types";
import { formatDate, priorityLabel, priorityTone } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export function TaskCard({
  task,
  onClick,
  dragHandle,
}: {
  task: Task;
  onClick: () => void;
  dragHandle?: ReactNode;
}) {
  const due = formatDate(task.dueDate);
  return (
    <article className="group relative">
      <button
        type="button"
        aria-label={`Open Task ${task.title}`}
        onClick={onClick}
        className={`w-full rounded-md border border-border bg-surface p-3 text-left transition-colors hover:border-border hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${dragHandle ? "pl-[52px]" : ""}`}
      >
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <span className="break-words text-sm font-medium text-text-primary">
            {task.title}
          </span>
          <Badge tone={priorityTone(task.priority)}>
            {priorityLabel(task.priority)}
          </Badge>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
          <span className="truncate">
            {task.assignee ? task.assignee.name : "Unassigned"}
          </span>
          {due ? <span className="whitespace-nowrap">{due}</span> : null}
        </div>
      </button>
      {dragHandle ? (
        <div className="absolute left-1.5 top-1.5">{dragHandle}</div>
      ) : null}
    </article>
  );
}
