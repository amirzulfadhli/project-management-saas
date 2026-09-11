"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { ProjectSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { useProjectWorkspace } from "./project-workspace";

export function ProjectSettings() {
  const { project: data, canAdministerProject } = useProjectWorkspace();
  const id = data.id;
  const projectOrganizationId = data.organizationId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const archive = useMutation({
    mutationFn: () => api.archiveProject(id),
    onSuccess: async () => {
      if (projectOrganizationId) {
        queryClient.setQueryData<ProjectSummary[]>(
          queryKeys.projects(projectOrganizationId),
          (current) => current?.filter((item) => item.id !== id),
        );
        await queryClient.invalidateQueries({
          queryKey: queryKeys.organizationProjects(projectOrganizationId),
        });
      }
      router.push("/projects?view=archived");
    },
  });

  const restore = useMutation({
    mutationFn: () => api.restoreProject(id),
    onSuccess: async (restored) => {
      queryClient.setQueryData(queryKeys.project(id), restored);
      if (projectOrganizationId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.organizationProjects(projectOrganizationId),
        });
      }
      setActionNotice(`"${restored.name}" restored.`);
    },
  });

  const duplicate = useMutation({
    mutationFn: () => api.duplicateProject(id),
    onSuccess: async (copy) => {
      queryClient.setQueryData(queryKeys.project(copy.id), copy);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organizationProjects(copy.organizationId),
      });
      setActionNotice(`"${copy.name}" created.`);
    },
  });

  const actionError = archive.error ?? restore.error ?? duplicate.error;

  if (!canAdministerProject)
    return (
      <p role="status" className="text-sm text-text-secondary">
        Only Project or Organization owners can administer this Project.
      </p>
    );
  const pending = archive.isPending || restore.isPending || duplicate.isPending;
  return (
    <section
      className="max-w-3xl space-y-5"
      aria-labelledby="project-settings-heading"
    >
      <h2 id="project-settings-heading" className="text-lg font-semibold">
        Project settings
      </h2>
      {actionNotice ? (
        <p role="status" className="text-sm text-success">
          {actionNotice}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="text-sm text-danger">
          {actionError instanceof ApiError
            ? actionError.message
            : "Project action failed."}
        </p>
      ) : null}
      <div className="space-y-3 border-b border-border pb-5">
        <h3 className="font-medium">Project details</h3>
        <Button variant="secondary" onClick={() => setEditOpen(true)}>
          Edit Project
        </Button>
      </div>
      <div className="space-y-3 border-b border-border pb-5">
        <h3 className="font-medium">Duplicate Project</h3>
        <p className="text-sm text-text-secondary">
          Copy the Project details and Board structure. You become the new
          Project owner. Existing Tasks, members, resources, history and GitHub
          connections are not copied.
        </p>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => duplicate.mutate()}
        >
          {duplicate.isPending ? "Duplicating…" : "Duplicate"}
        </Button>
      </div>
      <div className="space-y-3">
        <h3 className="font-medium">
          {data.archivedAt ? "Restore Project" : "Archive Project"}
        </h3>
        <p className="text-sm text-text-secondary">
          Archiving removes this Project from the active list without deleting
          its data or history.
        </p>
        {data.archivedAt ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => restore.mutate()}
          >
            {restore.isPending ? "Restoring…" : "Restore"}
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(
                  `Archive "${data.name}"? Its data and history will remain preserved.`,
                )
              )
                archive.mutate();
            }}
          >
            {archive.isPending ? "Archiving…" : "Archive"}
          </Button>
        )}
      </div>
      {editOpen ? (
        <EditProjectModal
          onClose={() => setEditOpen(false)}
          projectId={id}
          organizationId={data.organizationId}
          initialName={data.name}
          initialDescription={data.description}
        />
      ) : null}
    </section>
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
          queryKey: queryKeys.organizationProjects(organizationId),
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
