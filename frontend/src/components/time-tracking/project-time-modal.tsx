"use client";

import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { formatDuration } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";

export function ProjectTimeModal({
  open,
  onClose,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
}) {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? null;
  const summary = useQuery({
    queryKey: queryKeys.projectTime(projectId, userId),
    queryFn: () => api.getProjectTime(projectId),
    enabled: open,
  });

  return (
    <Modal open={open} onClose={onClose} title="Project time" size="lg">
      <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
        {summary.isPending ? (
          <div className="flex items-center justify-center gap-2 py-12 text-text-secondary">
            <Spinner /> Loading time...
          </div>
        ) : summary.isError || !summary.data ? (
          <ErrorState
            message={
              summary.error instanceof ApiError
                ? summary.error.message
                : "Failed to load Project time."
            }
            onRetry={() => summary.refetch()}
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric
                label="Project total"
                value={formatDuration(summary.data.totalSeconds)}
              />
              <Metric
                label="Your contribution"
                value={formatDuration(summary.data.currentUserSeconds)}
              />
            </div>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-text-primary">
                By Task
              </h3>
              {summary.data.tasks.length === 0 ? (
                <EmptyState title="No completed time entries yet." />
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {summary.data.tasks.map((task) => (
                    <div
                      key={task.taskId}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-text-primary">
                        {task.title}
                      </span>
                      <span className="shrink-0 font-medium text-text-primary">
                        {formatDuration(task.totalSeconds)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            {summary.data.users ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-text-primary">
                  By collaborator
                </h3>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {summary.data.users.map((user) => (
                    <div
                      key={user.userId}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-text-primary">
                          {user.name}
                        </p>
                        <p className="truncate text-xs text-text-secondary">
                          {user.email}
                        </p>
                      </div>
                      <span className="shrink-0 font-medium text-text-primary">
                        {formatDuration(user.totalSeconds)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}
