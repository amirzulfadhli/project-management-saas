"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ProjectCard } from "@/components/projects/project-card";
import { CreateProjectModal } from "@/components/projects/create-project-modal";
import { useOrganization } from "@/components/organizations/organization-provider";

export default function ProjectsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<{
    organizationId: string;
    message: string;
  } | null>(null);
  const { selectedOrganization, selectedOrganizationId } = useOrganization();

  const projects = useQuery({
    queryKey: queryKeys.projects(selectedOrganizationId ?? "none"),
    queryFn: () => api.getProjects(selectedOrganizationId!),
    enabled: Boolean(selectedOrganizationId),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Projects</h1>
          <p className="text-sm text-text-secondary">
            {selectedOrganization
              ? `Projects in ${selectedOrganization.name}.`
              : "Select an organization to view its projects."}
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          disabled={!selectedOrganizationId}
        >
          New Project
        </Button>
      </div>

      {notice && notice.organizationId === selectedOrganizationId ? (
        <div
          className="rounded-md border border-success/30 bg-success/5 px-4 py-3 text-sm text-success"
          role="status"
        >
          {notice.message}
        </div>
      ) : null}

      {!selectedOrganizationId || projects.isPending ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-secondary">
          <Spinner /> Loading projects...
        </div>
      ) : projects.isError ? (
        <ErrorState
          message={
            projects.error instanceof ApiError
              ? projects.error.message
              : "Failed to load projects."
          }
          onRetry={() => projects.refetch()}
        />
      ) : projects.data && projects.data.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.data.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onNotice={(message) =>
                setNotice({
                  organizationId: project.organizationId,
                  message,
                })
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No projects yet"
          description={
            selectedOrganization
              ? `Create the first project for ${selectedOrganization.name}. A board and default columns are set up automatically.`
              : "Select an organization to get started."
          }
          action={
            <Button
              variant="secondary"
              onClick={() => setCreateOpen(true)}
              disabled={!selectedOrganizationId}
            >
              New Project
            </Button>
          }
        />
      )}

      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}
