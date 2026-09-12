"use client";

import Link from "next/link";
import { taskHref } from "@/lib/task-links";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { useOrganizationTasks } from "@/components/tasks/use-organization-tasks";

export default function DashboardPage() {
  const organizationWork = useOrganizationTasks();

  const scheduledTasks = organizationWork.tasks
    .filter((task) => Boolean(task.dueDate))
    .sort((left, right) => (left.dueDate! < right.dueDate! ? -1 : 1));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Overview</h1>
        <p className="mt-1 text-text-secondary">
          Your current work at a glance.
        </p>
      </div>

      {organizationWork.isPending ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-secondary">
          <Spinner /> Loading...
        </div>
      ) : organizationWork.isError ? (
        <ErrorState
          message={
            organizationWork.error instanceof ApiError
              ? organizationWork.error.message
              : "Failed to load your current work."
          }
          onRetry={() => void organizationWork.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SummaryCard
              label="Projects"
              value={organizationWork.projects.length}
            />
            <SummaryCard label="Tasks" value={organizationWork.tasks.length} />
            <SummaryCard label="Scheduled" value={scheduledTasks.length} />
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-text-primary">
                  Recent Projects
                </h2>
                <Link
                  href="/projects"
                  className="text-sm text-primary hover:text-primary/80"
                >
                  View all →
                </Link>
              </div>

              {organizationWork.projects.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
                  No projects yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {organizationWork.projects.slice(0, 5).map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 hover:bg-hover"
                    >
                      <span className="truncate font-medium text-text-primary">
                        {project.name}
                      </span>
                      <span className="shrink-0 text-xs text-text-secondary">
                        {project._count.tasks} tasks
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-text-primary">
                  Scheduled Tasks
                </h2>
                <Link
                  href="/tasks"
                  className="text-sm text-primary hover:text-primary/80"
                >
                  View all →
                </Link>
              </div>

              {scheduledTasks.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
                  No tasks with deadlines.
                </p>
              ) : (
                <div className="space-y-2">
                  {scheduledTasks.slice(0, 5).map((task) => (
                    <Link
                      key={task.id}
                      href={taskHref(task.projectId, task.id)}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 hover:bg-hover"
                    >
                      <div className="min-w-0">
                        <span className="block truncate font-medium text-text-primary">
                          {task.title}
                        </span>
                        <span className="text-xs text-text-secondary">
                          {task.project.name}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-text-secondary">
                        {formatDate(task.dueDate)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}
