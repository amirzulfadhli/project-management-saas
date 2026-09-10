"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { OrganizationMember } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

type OrganizationRole = OrganizationMember["role"];

function sortMembers(members: OrganizationMember[]): OrganizationMember[] {
  return [...members].sort((left, right) => {
    if (left.role !== right.role) return left.role === "OWNER" ? -1 : 1;
    const byName = (left.user?.name ?? "").localeCompare(
      right.user?.name ?? "",
    );
    return byName || left.id.localeCompare(right.id);
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function OrganizationMembersModal({
  organizationId,
  organizationName,
  onClose,
}: {
  organizationId: string;
  organizationName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const membersKey = queryKeys.organizationMembers(organizationId);

  const membersQuery = useQuery({
    queryKey: membersKey,
    queryFn: () => api.getOrganizationMembers(organizationId),
  });
  const members = useMemo(
    () => sortMembers(membersQuery.data ?? []),
    [membersQuery.data],
  );
  const currentUserId = session?.user.id ?? null;
  const canAdminister = members.some(
    (member) => member.userId === currentUserId && member.role === "OWNER",
  );

  const refreshOrganization = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: membersKey, exact: true }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.organization(organizationId),
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.organizations,
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects(organizationId),
        exact: true,
      }),
    ]);
  };

  const addMember = useMutation({
    mutationFn: () =>
      api.addOrganizationMember(organizationId, { email: email.trim() }),
    onSuccess: async (member) => {
      queryClient.setQueryData<OrganizationMember[]>(membersKey, (current) =>
        sortMembers([...(current ?? []), member]),
      );
      setEmail("");
      setMutationError(null);
      setNotice(
        `${member.user?.name ?? member.user?.email ?? "User"} was added.`,
      );
      await refreshOrganization();
    },
    onError: (error: unknown) => {
      setNotice(null);
      setMutationError(
        errorMessage(error, "Failed to add the Organization member."),
      );
    },
  });

  const updateRole = useMutation({
    mutationFn: ({
      memberId,
      role,
    }: {
      memberId: string;
      role: OrganizationRole;
    }) => api.updateOrganizationMemberRole(organizationId, memberId, { role }),
    onSuccess: async (member) => {
      queryClient.setQueryData<OrganizationMember[]>(membersKey, (current) =>
        sortMembers(
          (current ?? []).map((item) =>
            item.id === member.id ? member : item,
          ),
        ),
      );
      setMutationError(null);
      setNotice(
        `${member.user?.name ?? member.user?.email ?? "Member"} is now an Organization ${member.role}.`,
      );
      await refreshOrganization();
    },
    onError: (error: unknown) => {
      setNotice(null);
      setMutationError(
        errorMessage(error, "Failed to change the Organization role."),
      );
    },
  });

  const removeMember = useMutation({
    mutationFn: (member: OrganizationMember) =>
      api.removeOrganizationMember(organizationId, member.id),
    onSuccess: async (_result, member) => {
      queryClient.setQueryData<OrganizationMember[]>(membersKey, (current) =>
        (current ?? []).filter((item) => item.id !== member.id),
      );
      setMutationError(null);
      setNotice(
        member.userId === currentUserId
          ? "Your Organization membership was removed."
          : `${member.user?.name ?? member.user?.email ?? "Member"} was removed.`,
      );
      await refreshOrganization();
    },
    onError: (error: unknown) => {
      setNotice(null);
      setMutationError(
        errorMessage(error, "Failed to remove the Organization member."),
      );
    },
  });

  const mutationPending =
    addMember.isPending || updateRole.isPending || removeMember.isPending;

  function requestRoleChange(
    member: OrganizationMember,
    role: OrganizationRole,
  ) {
    if (role === member.role) return;
    if (
      member.role === "OWNER" &&
      !window.confirm(
        `Demote ${member.user?.name ?? member.user?.email ?? "this owner"} to MEMBER? They will lose Organization administration rights.`,
      )
    ) {
      return;
    }
    setMutationError(null);
    setNotice(null);
    updateRole.mutate({ memberId: member.id, role });
  }

  function requestRemoval(member: OrganizationMember) {
    const identity = member.user?.name ?? member.user?.email ?? "this member";
    if (
      !window.confirm(
        `Remove ${identity} from ${organizationName}? Inherited Project access will end, but explicit Project memberships remain.`,
      )
    ) {
      return;
    }
    setMutationError(null);
    setNotice(null);
    removeMember.mutate(member);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${organizationName} members`}
      size="lg"
    >
      <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
        <p className="text-sm text-text-secondary">
          Organization roles control workspace administration. Explicit Project
          roles remain separate.
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
            message={errorMessage(
              membersQuery.error,
              "Failed to load Organization members.",
            )}
            onRetry={() => membersQuery.refetch()}
          />
        ) : members.length === 0 ? (
          <EmptyState
            title="No Organization members"
            description="Every Organization must retain at least one OWNER."
          />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {members.map((member) => {
              const identity =
                member.user?.name ?? member.user?.email ?? "Unknown user";
              const isSelf = member.userId === currentUserId;
              return (
                <li
                  key={member.id}
                  className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {identity}
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
                    {member.user?.email ? (
                      <p className="truncate text-xs text-text-secondary">
                        {member.user.email}
                      </p>
                    ) : null}
                  </div>

                  {canAdminister ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Select
                        aria-label={`Organization role for ${identity}`}
                        className="w-28"
                        value={member.role}
                        disabled={mutationPending}
                        onChange={(event) =>
                          requestRoleChange(
                            member,
                            event.target.value as OrganizationRole,
                          )
                        }
                      >
                        <option value="OWNER">OWNER</option>
                        <option value="MEMBER">MEMBER</option>
                      </Select>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={mutationPending}
                        onClick={() => requestRemoval(member)}
                      >
                        {removeMember.isPending &&
                        removeMember.variables?.id === member.id
                          ? "Removing..."
                          : isSelf
                            ? "Leave"
                            : "Remove"}
                      </Button>
                    </div>
                  ) : null}
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
              if (!email.trim() || mutationPending) return;
              setMutationError(null);
              setNotice(null);
              addMember.mutate();
            }}
          >
            <div>
              <h3 className="text-sm font-medium text-text-primary">
                Add an existing FlowPlan user
              </h3>
              <p className="mt-1 text-xs text-text-secondary">
                Email invitations are not implemented. The account must already
                exist.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="organization-member-email">
                Existing user email
              </label>
              <Input
                id="organization-member-email"
                type="email"
                autoComplete="email"
                placeholder="member@example.com"
                maxLength={320}
                value={email}
                disabled={mutationPending}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button
                type="submit"
                className="shrink-0"
                disabled={!email.trim() || mutationPending}
              >
                {addMember.isPending ? "Adding..." : "Add member"}
              </Button>
            </div>
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
    </Modal>
  );
}
