"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { authClient } from "@/lib/auth-client";

export default function ProjectsPage() {
  return (
    <Suspense fallback={<p role="status">Loading Projects…</p>}>
      <ProjectsContent />
    </Suspense>
  );
}
function ProjectsContent() {
  const [createOpen, setCreateOpen] = useState(false);
  const showArchived = useSearchParams().get("view") === "archived";
  const [notice, setNotice] = useState<{
    organizationId: string;
    message: string;
  } | null>(null);
  const { selectedOrganization, selectedOrganizationId } = useOrganization();
  const { data: session } = authClient.useSession();

  const projects = useQuery({
    queryKey: queryKeys.projects(
      selectedOrganizationId ?? "none",
      showArchived,
    ),
    queryFn: () => api.getProjects(selectedOrganizationId!, showArchived),
    enabled: Boolean(selectedOrganizationId),
  });
  const isOrganizationOwner = Boolean(
    selectedOrganization?.members?.some(
      (member) => member.userId === session?.user.id && member.role === "OWNER",
    ),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Projects</h1>
          <p className="text-sm text-text-secondary">
            {selectedOrganization
              ? `Projects in ${selectedOrganization.name}.`
              : "Select an organization to view its projects."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav
            aria-label="Project archive view"
            className="flex border-b border-border"
          >
            {[false, true].map((archived) => (
              <Link
                key={String(archived)}
                href={archived ? "/projects?view=archived" : "/projects"}
                aria-current={showArchived === archived ? "page" : undefined}
                className={`control-target inline-flex items-center border-b-2 px-4 text-sm font-medium ${showArchived === archived ? "border-primary text-primary" : "border-transparent text-text-secondary hover:bg-hover"}`}
              >
                {archived ? "Archived" : "Active"}
              </Link>
            ))}
          </nav>
          {!showArchived ? (
            <Button
              onClick={() => setCreateOpen(true)}
              disabled={!selectedOrganizationId}
            >
              New Project
            </Button>
          ) : null}
        </div>
      </div>

      {notice && notice.organizationId === selectedOrganizationId ? (
        <div
          className="rounded-md border border-success/30 bg-success/5 px-4 py-3 text-sm text-success"
          role="status"
        >
          {notice.message}
        </div>
      ) : null}

      {!selectedOrganizationId ? (
        <EmptyState
          title="Select an organization"
          description="Choose an Organization in the sidebar to browse its Projects."
        />
      ) : projects.isPending ? (
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
        <div className="divide-y divide-border rounded-lg border border-border bg-surface">
          {projects.data.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              canAdminister={
                isOrganizationOwner ||
                project.projectMembers.some(
                  (member) =>
                    member.userId === session?.user.id &&
                    member.role === "OWNER",
                )
              }
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
          title={showArchived ? "No archived projects" : "No projects yet"}
          description={
            showArchived
              ? "Archived projects remain preserved and can be restored by an owner."
              : selectedOrganization
                ? `Create the first project for ${selectedOrganization.name}. A board and default columns are set up automatically.`
                : "Select an organization to get started."
          }
          action={
            !showArchived ? (
              <Button
                variant="secondary"
                onClick={() => setCreateOpen(true)}
                disabled={!selectedOrganizationId}
              >
                New Project
              </Button>
            ) : undefined
          }
        />
      )}

      <CreateProjectModal
        key={selectedOrganizationId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}
