"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { ProjectSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function ProjectCard({
  project,
  canAdminister,
  onNotice,
}: {
  project: ProjectSummary;
  canAdminister: boolean;
  onNotice?: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const archived = Boolean(project.archivedAt);

  const duplicate = useMutation({
    mutationFn: () => api.duplicateProject(project.id),
    onSuccess: async (copy) => {
      queryClient.setQueryData(queryKeys.project(copy.id), copy);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organizationProjects(project.organizationId),
      });
      onNotice?.(`"${copy.name}" created.`);
    },
  });

  const archive = useMutation({
    mutationFn: () => api.archiveProject(project.id),
    onSuccess: async () => {
      queryClient.setQueryData<ProjectSummary[]>(
        queryKeys.projects(project.organizationId),
        (current) => current?.filter((item) => item.id !== project.id),
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organizationProjects(project.organizationId),
      });
      onNotice?.(`"${project.name}" archived.`);
    },
  });

  const restore = useMutation({
    mutationFn: () => api.restoreProject(project.id),
    onSuccess: async (restored) => {
      queryClient.setQueryData(queryKeys.project(project.id), restored);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organizationProjects(project.organizationId),
      });
      onNotice?.(`"${project.name}" restored.`);
    },
  });

  const actionError = duplicate.error ?? archive.error ?? restore.error;

  const handleArchive = () => {
    if (window.confirm(`Archive "${project.name}"?`)) {
      archive.mutate();
    }
  };

  return (
    <div
      className={`grid min-w-0 items-start gap-x-4 gap-y-2 px-4 py-4 sm:px-5 ${canAdminister ? "grid-cols-[minmax(0,1fr)_5rem]" : "grid-cols-1"}`}
    >
      <Link
        href={`/projects/${project.id}`}
        className="grid min-w-0 gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:grid-cols-[minmax(0,1fr)_11rem] md:items-center md:gap-5"
      >
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 break-words text-sm font-semibold text-text-primary">
              {project.name}
            </h3>
            {archived ? <Badge tone="neutral">Archived</Badge> : null}
          </div>
          {project.description ? (
            <p className="mt-1 line-clamp-1 break-words text-sm text-text-secondary">
              {project.description}
            </p>
          ) : null}
          <p className="mt-1 truncate text-xs text-text-secondary">
            {project.organization.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-text-secondary md:flex-col md:items-start">
          <span>
            {project._count.tasks} task{project._count.tasks === 1 ? "" : "s"}
          </span>
          <span>
            {project._count.projectMembers} explicit{" "}
            {project._count.projectMembers === 1 ? "member" : "members"}
          </span>
        </div>
      </Link>

      {canAdminister ? (
        <details className="relative justify-self-end text-sm">
          <summary
            className="control-target cursor-pointer rounded-md px-2 py-2 text-text-secondary hover:bg-hover hover:text-text-primary"
            aria-label={`Actions for ${project.name}`}
          >
            Actions
          </summary>
          <div className="absolute right-0 top-full z-10 mt-1 flex w-40 flex-col gap-1 rounded-lg border border-border bg-raised p-1 shadow-lg">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => duplicate.mutate()}
              disabled={duplicate.isPending}
            >
              {duplicate.isPending ? "Duplicating..." : "Duplicate"}
            </Button>
            {!archived ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleArchive}
                disabled={archive.isPending}
              >
                {archive.isPending ? "Archiving..." : "Archive"}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => restore.mutate()}
                disabled={restore.isPending}
              >
                {restore.isPending ? "Restoring..." : "Restore"}
              </Button>
            )}
          </div>
        </details>
      ) : null}

      {actionError ? (
        <p className="col-span-full text-sm text-danger" role="alert">
          {actionError instanceof ApiError
            ? actionError.message
            : "Project action failed."}
        </p>
      ) : null}
    </div>
  );
}
