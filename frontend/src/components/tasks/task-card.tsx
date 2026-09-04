"use client";

import type { Task } from "@/lib/types";
import { formatDate, priorityLabel, priorityTone } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export function TaskCard({
  task,
  onClick,
}: {
  task: Task;
  onClick: () => void;
}) {
  const due = formatDate(task.dueDate);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-border bg-surface p-3 text-left transition-colors hover:border-border hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-text-primary">{task.title}</span>
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
  );
}