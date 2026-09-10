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
    <div className="group relative rounded-xl border border-border bg-surface p-4">
      <Link
        href={`/projects/${project.id}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="font-medium text-text-primary">{project.name}</h3>
          {archived ? <Badge tone="neutral">Archived</Badge> : null}
        </div>
        {project.description ? (
          <p className="mb-3 line-clamp-2 text-sm text-text-secondary">
            {project.description}
          </p>
        ) : null}
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <span>{project.organization.name}</span>
          <span aria-hidden="true">·</span>
          <span>
            {project._count.tasks} task{project._count.tasks === 1 ? "" : "s"}
          </span>
          <span aria-hidden="true">·</span>
          <span>{project._count.projectMembers} member(s)</span>
        </div>
      </Link>

      {canAdminister ? (
        <div className="mt-3 flex items-center gap-2">
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
      ) : null}

      {actionError ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {actionError instanceof ApiError
            ? actionError.message
            : "Project action failed."}
        </p>
      ) : null}
    </div>
  );
}
