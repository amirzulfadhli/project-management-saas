"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type {
  Column,
  ProjectMember,
  ProjectSummary,
  Task,
  UserSummary,
} from "@/lib/types";
import { queryKeys } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/components/organizations/organization-provider";
import { TaskCard } from "@/components/tasks/task-card";
import { TaskModal } from "@/components/tasks/task-modal";
import { ProjectColumnsModal } from "@/components/projects/project-columns-modal";
import { ProjectMembersModal } from "@/components/projects/project-members-modal";
import { ProjectActivityModal } from "@/components/projects/project-activity-modal";
import { authClient } from "@/lib/auth-client";

interface TaskModalState {
  open: boolean;
  task: Task | null;
  defaultColumnId?: string;
}

export function ProjectBoard({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const {
    organizations,
    selectedOrganization,
    selectedOrganizationId,
    selectOrganization,
  } = useOrganization();

  const [taskModal, setTaskModal] = useState<TaskModalState>({
    open: false,
    task: null,
  });
  const [editOpen, setEditOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const project = useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => api.getProject(id),
  });

  const projectOrganizationId = project.data?.organizationId ?? null;
  const projectOrganizationIsSelectable = organizations.some(
    (organization) => organization.id === projectOrganizationId,
  );
  const currentProjectId = project.data?.id ?? null;
  const projectContextIsReady =
    !projectOrganizationIsSelectable ||
    selectedOrganizationId === projectOrganizationId;

  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks(currentProjectId ?? "none"),
    queryFn: () => api.getTasks(currentProjectId!),
    enabled: Boolean(currentProjectId) && projectContextIsReady,
  });

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

  useEffect(() => {
    if (
      projectOrganizationId &&
      projectOrganizationIsSelectable &&
      projectOrganizationId !== selectedOrganizationId
    ) {
      selectOrganization(projectOrganizationId);
    }
  }, [
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
      selectedOrganization?.id !== projectOrganizationId ||
      !selectedOrganization.owner
    ) {
      return null;
    }

    const users = new Map<string, UserSummary>();
    users.set(selectedOrganization.owner.id, selectedOrganization.owner);
    for (const organizationMember of selectedOrganization.members ?? []) {
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
  }, [projectMembers, projectOrganizationId, selectedOrganization]);
  const currentUserId = session?.user.id ?? null;
  const canModerateComments =
    currentUserId === project.data?.organization.ownerId ||
    projectMembers.some(
      (member) => member.userId === currentUserId && member.role === "OWNER",
    );

  // Group tasks by column id for stable board rendering.
  const tasksByColumn = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const col of columns) map.set(col.id, []);
    for (const task of tasksQuery.data ?? []) {
      const bucket = map.get(task.columnId) ?? [];
      bucket.push(task);
      map.set(task.columnId, bucket);
    }
    return map;
  }, [columns, tasksQuery.data]);

  const archive = useMutation({
    mutationFn: () => api.archiveProject(id),
    onSuccess: async () => {
      if (projectOrganizationId) {
        queryClient.setQueryData<ProjectSummary[]>(
          queryKeys.projects(projectOrganizationId),
          (current) => current?.filter((item) => item.id !== id),
        );
        await queryClient.invalidateQueries({
          queryKey: queryKeys.projects(projectOrganizationId),
        });
      }
      router.push("/projects");
    },
  });

  const duplicate = useMutation({
    mutationFn: () => api.duplicateProject(id),
    onSuccess: async (copy) => {
      queryClient.setQueryData(queryKeys.project(copy.id), copy);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.projects(copy.organizationId),
      });
      setActionNotice(`"${copy.name}" created.`);
    },
  });

  const actionError = archive.error ?? duplicate.error;

  if (project.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-text-secondary">
        <Spinner /> Loading project…
      </div>
    );
  }

  if (project.isError || !project.data) {
    const message =
      project.error instanceof ApiError
        ? project.error.message
        : "Failed to load project.";
    return <ErrorState message={message} onRetry={() => project.refetch()} />;
  }

  const data = project.data;

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-text-primary">
              {data.name}
            </h1>
            {data.archivedAt ? <Badge tone="neutral">Archived</Badge> : null}
          </div>
          {data.description ? (
            <p className="mt-1 max-w-2xl text-sm text-text-secondary">
              {data.description}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-text-secondary">
            {data.organization.name} · {projectMembers.length} explicit
            member(s)
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setActivityOpen(true)}
          >
            Activity
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setColumnsOpen(true)}
          >
            Columns
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMembersOpen(true)}
          >
            Members
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditOpen(true)}
          >
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => duplicate.mutate()}
            disabled={duplicate.isPending}
          >
            {duplicate.isPending ? "Duplicating…" : "Duplicate"}
          </Button>
          {!data.archivedAt ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.confirm(`Archive "${data.name}"?`)) archive.mutate();
              }}
              disabled={archive.isPending}
            >
              {archive.isPending ? "Archiving..." : "Archive"}
            </Button>
          ) : null}
        </div>
      </div>

      {actionNotice ? (
        <p
          className="rounded-md border border-success/30 bg-success/5 px-4 py-3 text-sm text-success"
          role="status"
        >
          {actionNotice}
        </p>
      ) : null}

      {actionError ? (
        <p
          className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {actionError instanceof ApiError
            ? actionError.message
            : "Project action failed."}
        </p>
      ) : null}

      {/* Board */}
      {columnsQuery.isError ? (
        <ErrorState
          message={
            columnsQuery.error instanceof ApiError
              ? columnsQuery.error.message
              : "Failed to load Project Columns."
          }
          onRetry={() => columnsQuery.refetch()}
        />
      ) : tasksQuery.isPending ||
        (columnsQuery.isPending && columns.length === 0) ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-secondary">
          <Spinner /> Loading Board...
        </div>
      ) : tasksQuery.isError ? (
        <ErrorState
          message={
            tasksQuery.error instanceof ApiError
              ? tasksQuery.error.message
              : "Failed to load tasks."
          }
          onRetry={() => tasksQuery.refetch()}
        />
      ) : columns.length === 0 ? (
        <EmptyState title="This project has no board yet." />
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="flex min-h-full items-start gap-3 pb-2">
            {columns.map((col) => {
              const tasks = tasksByColumn.get(col.id) ?? [];
              return (
                <div
                  key={col.id}
                  className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-background p-2"
                >
                  <div className="mb-2 flex items-center justify-between px-1">
                    <h2 className="text-sm font-semibold text-text-primary">
                      {col.name}
                    </h2>
                    <span className="text-xs text-text-secondary">
                      {tasks.length}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-2">
                    {tasks.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-text-secondary">
                        No tasks
                      </p>
                    ) : (
                      tasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onClick={() => setTaskModal({ open: true, task })}
                        />
                      ))
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setTaskModal({
                        open: true,
                        task: null,
                        defaultColumnId: col.id,
                      })
                    }
                    className="mt-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-text-secondary hover:bg-hover hover:text-text-primary"
                  >
                    + Add task
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {taskModal.open ? (
        <TaskModal
          onClose={() => setTaskModal({ open: false, task: null })}
          organizationId={data.organizationId}
          projectId={data.id}
          columns={columns}
          task={taskModal.task}
          defaultColumnId={taskModal.defaultColumnId}
          eligibleAssignees={eligibleAssignees}
          currentUserId={currentUserId}
          canModerateComments={canModerateComments}
        />
      ) : null}

      {activityOpen ? (
        <ProjectActivityModal
          open
          onClose={() => setActivityOpen(false)}
          projectId={data.id}
        />
      ) : null}

      {membersOpen ? (
        <ProjectMembersModal
          open
          onClose={() => setMembersOpen(false)}
          projectId={data.id}
          organizationId={data.organizationId}
          organizationOwnerId={data.organization.ownerId}
        />
      ) : null}

      {columnsOpen ? (
        <ProjectColumnsModal
          open
          onClose={() => setColumnsOpen(false)}
          projectId={data.id}
        />
      ) : null}

      {editOpen ? (
        <EditProjectModal
          onClose={() => setEditOpen(false)}
          projectId={id}
          organizationId={data.organizationId}
          initialName={data.name}
          initialDescription={data.description}
        />
      ) : null}
    </div>
  );
}

function EditProjectModal({
  onClose,
  projectId,
  organizationId,
  initialName,
  initialDescription,
}: {
  onClose: () => void;
  projectId: string;
  organizationId: string;
  initialName: string;
  initialDescription: string | null;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [error, setError] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: () =>
      api.updateProject(projectId, {
        name: name.trim(),
        description: description.trim() || null,
      }),
    onSuccess: async (updatedProject) => {
      queryClient.setQueryData(queryKeys.project(projectId), updatedProject);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.projects(organizationId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectActivities(projectId),
          exact: true,
        }),
      ]);
      onClose();
    },
    onError: (e: unknown) =>
      setError(e instanceof ApiError ? e.message : "Failed to update project"),
  });

  return (
    <Modal open onClose={onClose} title="Edit Project">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          update.mutate();
        }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <label
            htmlFor="edit-name"
            className="text-sm font-medium text-text-primary"
          >
            Name
          </label>
          <Input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="edit-desc"
            className="text-sm font-medium text-text-primary"
          >
            Description
          </label>
          <Textarea
            id="edit-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={5000}
          />
        </div>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
