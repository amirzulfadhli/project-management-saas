"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { ProjectMember, ProjectRole, UserSummary } from "@/lib/types";
import { useOrganization } from "@/components/organizations/organization-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

interface ProjectMembersPanelProps {
  projectId: string;
  organizationId: string;
}

interface RoleMutationInput {
  memberId: string;
  role: ProjectRole;
}

function sortMembers(members: ProjectMember[]): ProjectMember[] {
  return [...members].sort((left, right) => {
    if (left.role !== right.role) return left.role === "OWNER" ? -1 : 1;
    const byName = left.user.name.localeCompare(right.user.name);
    return byName || left.id.localeCompare(right.id);
  });
}

function mutationMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function ProjectMembersPanel({
  projectId,
  organizationId,
}: ProjectMembersPanelProps) {
  const queryClient = useQueryClient();
  const { selectedOrganization } = useOrganization();
  const { data: session } = authClient.useSession();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<ProjectRole>("MEMBER");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const membersKey = queryKeys.projectMembers(projectId);
  const membersQuery = useQuery({
    queryKey: membersKey,
    queryFn: () => api.getProjectMembers(projectId),
    enabled: Boolean(projectId),
  });

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const currentUserId = session?.user.id ?? null;
  const isOrganizationOwner =
    selectedOrganization?.id === organizationId &&
    selectedOrganization.members?.some(
      (member) => member.userId === currentUserId && member.role === "OWNER",
    );
  const canAdminister =
    Boolean(isOrganizationOwner) ||
    members.some(
      (member) => member.userId === currentUserId && member.role === "OWNER",
    );

  const organizationSourceIsAvailable =
    selectedOrganization?.id === organizationId &&
    Boolean(selectedOrganization.owner);
  const organizationUsers = useMemo(() => {
    if (!organizationSourceIsAvailable || !selectedOrganization) return [];

    const users = new Map<string, UserSummary>();
    if (selectedOrganization.owner) {
      users.set(selectedOrganization.owner.id, selectedOrganization.owner);
    }
    for (const organizationMember of selectedOrganization.members ?? []) {
      if (organizationMember.user) {
        users.set(organizationMember.user.id, organizationMember.user);
      }
    }
    return [...users.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [organizationSourceIsAvailable, selectedOrganization]);

  const addCandidates = useMemo(() => {
    const existingUserIds = new Set(members.map((member) => member.userId));
    return organizationUsers.filter((user) => !existingUserIds.has(user.id));
  }, [members, organizationUsers]);
  const candidateUserId = addCandidates.some(
    (candidate) => candidate.id === selectedUserId,
  )
    ? selectedUserId
    : "";

  const refreshProjectSnapshot = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: membersKey, exact: true }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.project(projectId),
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectActivities(projectId),
        exact: true,
      }),
    ]);
  };

  const addMember = useMutation({
    mutationFn: () =>
      api.addProjectMember(projectId, {
        userId: candidateUserId,
        role: newMemberRole,
      }),
    onSuccess: async (createdMember) => {
      queryClient.setQueryData<ProjectMember[]>(membersKey, (current) =>
        sortMembers([
          ...(current ?? []).filter((member) => member.id !== createdMember.id),
          createdMember,
        ]),
      );
      setSelectedUserId("");
      setNewMemberRole("MEMBER");
      setMutationError(null);
      setNotice(`${createdMember.user.name} was added to the Project roster.`);
      await refreshProjectSnapshot();
    },
    onError: (error: unknown) => {
      setNotice(null);
      setMutationError(mutationMessage(error, "Failed to add Project member."));
    },
  });

  const updateRole = useMutation({
    mutationFn: ({ memberId, role }: RoleMutationInput) =>
      api.updateProjectMemberRole(projectId, memberId, { role }),
    onSuccess: async (updatedMember) => {
      queryClient.setQueryData<ProjectMember[]>(membersKey, (current) =>
        sortMembers(
          (current ?? []).map((member) =>
            member.id === updatedMember.id ? updatedMember : member,
          ),
        ),
      );
      setMutationError(null);
      setNotice(
        `${updatedMember.user.name} is now a Project ${updatedMember.role}.`,
      );
      await refreshProjectSnapshot();
    },
    onError: (error: unknown) => {
      setNotice(null);
      setMutationError(
        mutationMessage(error, "Failed to change the Project member role."),
      );
    },
  });

  const removeMember = useMutation({
    mutationFn: (member: ProjectMember) =>
      api.removeProjectMember(projectId, member.id),
    onSuccess: async (_result, removedMember) => {
      queryClient.setQueryData<ProjectMember[]>(membersKey, (current) =>
        (current ?? []).filter((member) => member.id !== removedMember.id),
      );
      setMutationError(null);
      setNotice(
        removedMember.userId === currentUserId
          ? "Your explicit Project membership was removed. Any inherited Organization access is unchanged."
          : `${removedMember.user.name} was removed from the explicit Project roster.`,
      );
      await refreshProjectSnapshot();
    },
    onError: (error: unknown) => {
      setNotice(null);
      setMutationError(
        mutationMessage(error, "Failed to remove the Project member."),
      );
    },
  });

  const mutationIsPending =
    addMember.isPending || updateRole.isPending || removeMember.isPending;

  const confirmRemoval = (member: ProjectMember) => {
    const isSelf = member.userId === currentUserId;
    const message = isSelf
      ? "Remove your explicit Project membership? You may still retain access through the Organization."
      : `Remove ${member.user.name} from the explicit Project roster? Existing Task assignments will remain.`;
    if (window.confirm(message)) {
      setMutationError(null);
      setNotice(null);
      removeMember.mutate(member);
    }
  };

  return (
    <section aria-label="Project members">
      <div className="min-w-0 space-y-5">
        <p className="text-sm text-text-secondary">
          This roster records Project roles. Organization members may also have
          inherited Project access without appearing here. Removing an explicit
          Project role does not remove Organization access. Project roles and
          Organization ownership are separate.
        </p>

        {membersQuery.isPending ? (
          <div
            className="flex items-center justify-center gap-2 py-8 text-sm text-text-secondary"
            role="status"
          >
            <Spinner /> Loading members...
          </div>
        ) : membersQuery.isError ? (
          <ErrorState
            message={
              membersQuery.error instanceof ApiError
                ? membersQuery.error.message
                : "Failed to load Project members."
            }
            onRetry={() => membersQuery.refetch()}
          />
        ) : members.length === 0 ? (
          <EmptyState
            title="No explicit Project members"
            description="Organization access may still allow collaborators to open this Project."
          />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {members.map((member) => {
              const isSelf = member.userId === currentUserId;
              const canRemove = canAdminister || isSelf;
              return (
                <li
                  key={member.id}
                  className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {member.user.name}
                      </p>
                      {isSelf ? <Badge tone="primary">You</Badge> : null}
                      {!canAdminister ? (
                        <Badge
                          tone={member.role === "OWNER" ? "warning" : "neutral"}
                        >
                          {member.role}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-text-secondary">
                      {member.user.email}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {canAdminister ? (
                      <Select
                        aria-label={`Role for ${member.user.name}`}
                        className="w-28"
                        value={member.role}
                        disabled={mutationIsPending}
                        onChange={(event) => {
                          setMutationError(null);
                          setNotice(null);
                          updateRole.mutate({
                            memberId: member.id,
                            role: event.target.value as ProjectRole,
                          });
                        }}
                      >
                        <option value="OWNER">OWNER</option>
                        <option value="MEMBER">MEMBER</option>
                      </Select>
                    ) : null}
                    {canRemove ? (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={mutationIsPending}
                        onClick={() => confirmRemoval(member)}
                      >
                        {removeMember.isPending &&
                        removeMember.variables?.id === member.id
                          ? "Removing..."
                          : isSelf
                            ? "Leave roster"
                            : "Remove"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {canAdminister && !membersQuery.isPending && !membersQuery.isError ? (
          <form
            className="space-y-3 rounded-md border border-border bg-background p-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!candidateUserId || mutationIsPending) return;
              setMutationError(null);
              setNotice(null);
              addMember.mutate();
            }}
          >
            <div>
              <h3 className="text-sm font-medium text-text-primary">
                Add Organization member
              </h3>
              <p className="mt-1 text-xs text-text-secondary">
                Only existing members of{" "}
                {selectedOrganization?.name ?? "the Organization"} can be added.
              </p>
            </div>

            {!organizationSourceIsAvailable ? (
              <p className="text-sm text-text-secondary">
                Eligible Organization members are unavailable in the current
                workspace context.
              </p>
            ) : addCandidates.length === 0 ? (
              <p className="text-sm text-text-secondary">
                Every eligible Organization member is already on the explicit
                roster.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
                <div className="space-y-1.5">
                  <label
                    htmlFor="project-member-user"
                    className="text-xs font-medium text-text-primary"
                  >
                    Organization member
                  </label>
                  <Select
                    id="project-member-user"
                    value={candidateUserId}
                    disabled={mutationIsPending}
                    onChange={(event) => setSelectedUserId(event.target.value)}
                  >
                    <option value="">Select a member</option>
                    {addCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name} ({candidate.email})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="project-member-role"
                    className="text-xs font-medium text-text-primary"
                  >
                    Project role
                  </label>
                  <Select
                    id="project-member-role"
                    value={newMemberRole}
                    disabled={mutationIsPending}
                    onChange={(event) =>
                      setNewMemberRole(event.target.value as ProjectRole)
                    }
                  >
                    <option value="MEMBER">MEMBER</option>
                    <option value="OWNER">OWNER</option>
                  </Select>
                </div>
                <Button
                  type="submit"
                  disabled={!candidateUserId || mutationIsPending}
                >
                  {addMember.isPending ? "Adding..." : "Add member"}
                </Button>
              </div>
            )}
          </form>
        ) : null}

        {notice ? (
          <p
            className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
            role="status"
          >
            {notice}
          </p>
        ) : null}
        {mutationError ? (
          <p
            className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {mutationError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
