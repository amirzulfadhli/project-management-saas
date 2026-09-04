"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { useOrganization } from "@/components/organizations/organization-provider";

export function CreateProjectModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { selectedOrganization, selectedOrganizationId } = useOrganization();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setDescription("");
    setError(null);
  };

  const createProject = useMutation({
    mutationFn: () => {
      if (!selectedOrganizationId) {
        throw new Error("Select an organization before creating a project.");
      }

      return api.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        organizationId: selectedOrganizationId,
      });
    },
    onSuccess: async (project) => {
      queryClient.setQueryData(queryKeys.project(project.id), project);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.projects(project.organizationId),
      });
      resetForm();
      onClose();
    },
    onError: (mutationError: unknown) =>
      setError(
        mutationError instanceof ApiError || mutationError instanceof Error
          ? mutationError.message
          : "Failed to create project",
      ),
  });

  const close = () => {
    resetForm();
    createProject.reset();
    onClose();
  };

  const canSubmit =
    name.trim().length > 0 &&
    Boolean(selectedOrganizationId) &&
    !createProject.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    createProject.mutate();
  };

  return (
    <Modal open={open} onClose={close} title="New Project">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="project-name"
            className="text-sm font-medium text-text-primary"
          >
            Name
          </label>
          <Input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Website redesign"
            autoFocus
            maxLength={120}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="project-description"
            className="text-sm font-medium text-text-primary"
          >
            Description
          </label>
          <Textarea
            id="project-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional"
            rows={3}
            maxLength={5000}
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-text-primary">
            Organization
          </span>
          <div className="rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary">
            {selectedOrganization?.name ?? "No organization selected"}
          </div>
        </div>

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {createProject.isPending ? "Creating..." : "Create Project"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
