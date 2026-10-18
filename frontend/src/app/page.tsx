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
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="page-title">Overview</h1>
        <p className="page-description">Your current work at a glance.</p>
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
          <dl className="content-panel grid grid-cols-3 divide-x divide-border">
            <SummaryItem
              label="Projects"
              value={organizationWork.projects.length}
            />
            <SummaryItem label="Tasks" value={organizationWork.tasks.length} />
            <SummaryItem label="Scheduled" value={scheduledTasks.length} />
          </dl>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <section
              className="content-panel overflow-hidden"
              aria-labelledby="scheduled-tasks-heading"
            >
              <div className="panel-heading">
                <h2
                  id="scheduled-tasks-heading"
                  className="text-base font-semibold text-text-primary"
                >
                  Scheduled Tasks
                </h2>
                <Link
                  href="/tasks"
                  aria-label="View all Tasks"
                  className="control-target inline-flex items-center text-sm text-primary hover:underline"
                >
                  View all →
                </Link>
              </div>

              {scheduledTasks.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-text-secondary">
                  No tasks with deadlines.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {scheduledTasks.slice(0, 5).map((task) => (
                    <Link
                      key={task.id}
                      href={taskHref(task.projectId, task.id)}
                      className="flex min-w-0 items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-hover focus-visible:-outline-offset-2 sm:px-5"
                    >
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium text-text-primary">
                          {task.title}
                        </span>
                        <span className="mt-1 block truncate text-xs text-text-secondary">
                          {task.project.name}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-text-secondary">
                        {formatDate(task.dueDate)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section
              className="content-panel overflow-hidden"
              aria-labelledby="recent-projects-heading"
            >
              <div className="panel-heading">
                <h2
                  id="recent-projects-heading"
                  className="text-base font-semibold text-text-primary"
                >
                  Recent Projects
                </h2>
                <Link
                  href="/projects"
                  aria-label="View all Projects"
                  className="control-target inline-flex items-center text-sm text-primary hover:underline"
                >
                  View all →
                </Link>
              </div>

              {organizationWork.projects.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-text-secondary">
                  No projects yet.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {organizationWork.projects.slice(0, 5).map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="flex min-w-0 items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-hover focus-visible:-outline-offset-2 sm:px-5"
                    >
                      <span className="min-w-0 truncate text-sm font-medium text-text-primary">
                        {project.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-text-secondary">
                        {project._count.tasks} tasks
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

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 px-4 py-4 sm:px-5">
      <dt className="text-xs text-text-secondary sm:text-sm">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
        {value}
      </dd>
    </div>
  );
}
