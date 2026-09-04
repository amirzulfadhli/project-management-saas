"use client";

import { ApiError } from "@/lib/api";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TaskRow } from "@/components/tasks/task-row";
import { useOrganization } from "@/components/organizations/organization-provider";
import { useOrganizationTasks } from "@/components/tasks/use-organization-tasks";

export default function TasksPage() {
  const { selectedOrganization, selectedOrganizationId } = useOrganization();
  const tasks = useOrganizationTasks();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Tasks</h1>
        <p className="text-sm text-text-secondary">
          {selectedOrganization
            ? `Tasks across projects in ${selectedOrganization.name}.`
            : "Select an organization to view its tasks."}
        </p>
      </div>

      {tasks.isPending ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-secondary">
          <Spinner /> Loading tasks...
        </div>
      ) : tasks.isError ? (
        <ErrorState
          message={
            tasks.error instanceof ApiError
              ? tasks.error.message
              : "Failed to load tasks."
          }
          onRetry={() => void tasks.refetch()}
        />
      ) : tasks.tasks.length > 0 ? (
        <div className="space-y-2">
          {tasks.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              organizationId={selectedOrganizationId!}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No tasks yet"
          description="Create tasks from a project board to see them here."
        />
      )}
    </div>
  );
}
