"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type {
  Column,
  ProjectDetail,
  ProjectMember,
  UserSummary,
} from "@/lib/types";
import { authClient } from "@/lib/auth-client";
import { useOrganization } from "@/components/organizations/organization-provider";
import { useProjectRealtime } from "@/lib/realtime";
import { ErrorState } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";

export const projectSections = [
  ["", "Board"],
  ["docs", "Docs"],
  ["files", "Files"],
  ["activity", "Activity"],
  ["time", "Time"],
  ["github", "GitHub"],
] as const;

interface WorkspaceContext {
  project: ProjectDetail;
  columns: Column[];
  columnsQuery: ReturnType<typeof useQuery<Column[], Error>>;
  projectMembers: ProjectMember[];
  eligibleAssignees: UserSummary[] | null;
  currentUserId: string | null;
  canAdministerProject: boolean;
}
const ProjectContext = createContext<WorkspaceContext | null>(null);

export function useProjectWorkspace() {
  const value = useContext(ProjectContext);
  if (!value) throw new Error("ProjectWorkspace is missing");
  return value;
}

export function ProjectWorkspace({
  id,
  children,
  compact = false,
}: {
  id: string;
  children: ReactNode;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const {
    organizations,
    selectedOrganization,
    selectedOrganizationId,
    selectOrganization,
  } = useOrganization();
  const project = useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => api.getProject(id),
  });

  const projectOrganizationId = project.data?.organizationId ?? null;
  const projectOrganizationIsSelectable = organizations.some(
    (organization) => organization.id === projectOrganizationId,
  );
  // A Task sheet may belong to another Organization (for example an active timer).
  // Load that selectable Organization without changing the background workspace.
  const sheetOrganization = useQuery({
    queryKey: queryKeys.organization(projectOrganizationId ?? "none"),
    queryFn: () => api.getOrganization(projectOrganizationId!),
    enabled:
      compact &&
      projectOrganizationIsSelectable &&
      projectOrganizationId !== selectedOrganizationId &&
      !project.isError,
  });
  const permissionOrganization =
    selectedOrganization?.id === projectOrganizationId
      ? selectedOrganization
      : compact && projectOrganizationIsSelectable && !sheetOrganization.isError
        ? (sheetOrganization.data ?? null)
        : null;
  const currentProjectId = project.data?.id ?? null;
  const projectContextIsReady =
    compact ||
    !projectOrganizationIsSelectable ||
    selectedOrganizationId === projectOrganizationId;
  const realtimeStatus = useProjectRealtime(
    currentProjectId,
    Boolean(currentProjectId) && projectContextIsReady && !project.isError,
  );

  const columnsQuery = useQuery({
    queryKey: queryKeys.projectColumns(currentProjectId ?? "none"),
    queryFn: () => api.getProjectColumns(currentProjectId!),
    enabled: Boolean(currentProjectId) && projectContextIsReady,
  });

  const membersQuery = useQuery({
    queryKey: queryKeys.projectMembers(currentProjectId ?? "none"),
    queryFn: () => api.getProjectMembers(currentProjectId!),
    enabled: Boolean(currentProjectId) && projectContextIsReady,
  });

  const adoptedOrganizationRef = useRef<string | null>(null);
  useEffect(() => {
    const contextKey = `${id}:${projectOrganizationId}`;
    if (
      !compact &&
      projectOrganizationId &&
      projectOrganizationIsSelectable &&
      adoptedOrganizationRef.current !== contextKey
    ) {
      // Adopt direct-link context once. Do not undo an explicit switch while
      // the old workspace is still mounted during the outgoing navigation.
      adoptedOrganizationRef.current = contextKey;
      if (projectOrganizationId !== selectedOrganizationId) {
        selectOrganization(projectOrganizationId);
      }
    }
  }, [
    id,
    compact,
    projectOrganizationId,
    projectOrganizationIsSelectable,
    selectOrganization,
    selectedOrganizationId,
  ]);

  const embeddedColumns: Column[] = useMemo(
    () =>
      (project.data?.board?.columns ?? []).filter(
        (column) => column.projectId === project.data?.id,
      ),
    [project.data],
  );
  const columns = columnsQuery.data ?? embeddedColumns;

  const projectMembers = useMemo<ProjectMember[]>(
    () => membersQuery.data ?? project.data?.projectMembers ?? [],
    [membersQuery.data, project.data?.projectMembers],
  );
  const eligibleAssignees = useMemo<UserSummary[] | null>(() => {
    if (
      !projectOrganizationId ||
      permissionOrganization?.id !== projectOrganizationId ||
      !permissionOrganization.owner
    ) {
      return null;
    }

    const users = new Map<string, UserSummary>();
    users.set(permissionOrganization.owner.id, permissionOrganization.owner);
    for (const organizationMember of permissionOrganization.members ?? []) {
      if (organizationMember.user) {
        users.set(organizationMember.user.id, organizationMember.user);
      }
    }
    for (const projectMember of projectMembers) {
      users.set(projectMember.userId, projectMember.user);
    }

    return [...users.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [projectMembers, projectOrganizationId, permissionOrganization]);
  const currentUserId = session?.user.id ?? null;
  const isOrganizationOwner =
    permissionOrganization?.id === projectOrganizationId &&
    permissionOrganization.members?.some(
      (member) => member.userId === currentUserId && member.role === "OWNER",
    );
  const canAdministerProject =
    Boolean(isOrganizationOwner) ||
    projectMembers.some(
      (member) => member.userId === currentUserId && member.role === "OWNER",
    );

  const authorized = !project.isError && Boolean(project.data);
  if (project.isPending)
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-2 py-16"
      >
        <Spinner /> Loading project…
      </div>
    );
  if (!authorized || !project.data)
    return (
      <ErrorState
        message={
          project.error instanceof ApiError
            ? project.error.message
            : "This Project is no longer available."
        }
        onRetry={() => project.refetch()}
      />
    );
  if (!projectContextIsReady)
    return <div role="status">Opening Project context…</div>;
  const data = project.data;
  const administrationAllowed = canAdministerProject && !membersQuery.isError;
  return (
    <ProjectContext.Provider
      value={{
        project: data,
        columns,
        columnsQuery,
        projectMembers,
        eligibleAssignees,
        currentUserId,
        canAdministerProject: administrationAllowed,
      }}
    >
      {compact ? (
        children
      ) : (
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="mb-1 truncate text-sm text-text-secondary">
                {data.organization.name}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 break-words text-xl font-semibold">
                  {data.name}
                </h1>
                {data.archivedAt ? (
                  <Badge tone="neutral">Archived</Badge>
                ) : null}
              </div>
              {data.description ? (
                data.description.length <= 180 ? (
                  <p className="mt-2 max-w-3xl break-words text-sm text-text-secondary">
                    {data.description}
                  </p>
                ) : (
                  <details className="mt-2 max-w-3xl text-sm text-text-secondary">
                    <summary className="cursor-pointer">
                      Project description
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap break-words">
                      {data.description}
                    </p>
                  </details>
                )
              ) : null}
            </div>
            <nav
              aria-label="Project administration"
              className="flex flex-wrap gap-2"
            >
              <Link
                aria-current={
                  pathname === `/projects/${id}/members` ? "page" : undefined
                }
                className="control-target inline-flex items-center rounded-md border border-border px-3 text-sm hover:bg-hover aria-[current=page]:bg-selected aria-[current=page]:text-primary"
                href={`/projects/${id}/members`}
              >
                Members
              </Link>
              {administrationAllowed ? (
                <Link
                  aria-current={
                    pathname === `/projects/${id}/settings` ? "page" : undefined
                  }
                  className="control-target inline-flex items-center rounded-md border border-border px-3 text-sm hover:bg-hover aria-[current=page]:bg-selected aria-[current=page]:text-primary"
                  href={`/projects/${id}/settings`}
                >
                  Project settings
                </Link>
              ) : null}
            </nav>
          </div>
          <ProjectNavigation id={id} />
          {data.archivedAt ? (
            <p
              role="status"
              className="border-l-2 border-border-strong pl-3 text-sm text-text-secondary"
            >
              This Project is archived. Its work and history are preserved.
              {administrationAllowed ? " Restore it in Project settings." : ""}
            </p>
          ) : null}
          {membersQuery.isError ? (
            <ErrorState
              message="Could not refresh Project permissions."
              onRetry={() => membersQuery.refetch()}
            />
          ) : null}
          {realtimeStatus === "unavailable" ? (
            <p role="status" className="text-sm text-text-secondary">
              Live updates are temporarily unavailable. Your changes still save
              normally; refresh to reconcile collaborators&apos; changes.
            </p>
          ) : null}
          {children}
        </div>
      )}
    </ProjectContext.Provider>
  );
}

function ProjectNavigation({ id }: { id: string }) {
  const pathname = usePathname();
  const active = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  return (
    <div className="min-w-0">
      <nav
        aria-label="Project sections"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {projectSections.map(([slug, label]) => {
          const href = `/projects/${id}${slug ? "/" + slug : ""}`;
          const selected = pathname === href;
          return (
            <Link
              key={label}
              ref={selected ? active : undefined}
              href={href}
              aria-current={selected ? "page" : undefined}
              className={`control-target inline-flex shrink-0 items-center border-b-2 px-3 py-2 text-sm font-medium ${selected ? "border-primary text-primary" : "border-transparent text-text-secondary hover:bg-hover hover:text-text-primary"}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <p className="mt-1 text-xs text-text-secondary sm:hidden">
        Swipe the section navigation for more.
      </p>
    </div>
  );
}
