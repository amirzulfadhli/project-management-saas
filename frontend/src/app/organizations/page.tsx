"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CreateOrganizationForm } from "@/components/organizations/create-organization-form";
import { OrganizationMembersModal } from "@/components/organizations/organization-members-modal";
import { useOrganization } from "@/components/organizations/organization-provider";
import type { Organization } from "@/lib/types";

export default function OrganizationsPage() {
  const router = useRouter();
  const { organizations, selectedOrganizationId, selectOrganization } =
    useOrganization();
  const [createdOrganization, setCreatedOrganization] =
    useState<Organization | null>(null);
  const [memberOrganization, setMemberOrganization] =
    useState<Organization | null>(null);

  function openWorkspace(organization: Organization) {
    selectOrganization(organization.id);
    router.push("/");
  }

  function handleCreated(organization: Organization) {
    selectOrganization(organization.id);
    setCreatedOrganization(organization);
  }

  if (createdOrganization) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-2xl items-center">
        <section
          className="w-full rounded-xl border border-border bg-surface p-8 text-center"
          aria-live="polite"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-xl font-semibold text-success">
            ✓
          </div>
          <p className="mt-5 text-sm font-semibold text-success">
            Organization created
          </p>
          <h1 className="mt-2 text-2xl font-bold text-text-primary">
            {createdOrganization.name} is ready
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            Your workspace was created and selected. The backend also added you
            as its OWNER.
          </p>
          <Button
            className="mt-6"
            onClick={() => openWorkspace(createdOrganization)}
          >
            Enter workspace
          </Button>
        </section>
      </div>
    );
  }

  const hasOrganizations = organizations.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">Organizations</p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">
          {hasOrganizations
            ? "Choose a workspace"
            : "Create your first workspace"}
        </h1>
        <p className="mt-2 max-w-2xl text-text-secondary">
          {hasOrganizations
            ? "Select an organization to continue, or create another workspace."
            : "You are signed in, but you do not belong to an organization yet. Create one to continue."}
        </p>
      </header>

      <div
        className={
          hasOrganizations
            ? "grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]"
            : "max-w-xl"
        }
      >
        {hasOrganizations ? (
          <section aria-labelledby="workspace-list-heading">
            <h2
              id="workspace-list-heading"
              className="text-lg font-semibold text-text-primary"
            >
              Your organizations
            </h2>
            <div className="mt-3 space-y-3">
              {organizations.map((organization) => {
                const isSelected = organization.id === selectedOrganizationId;
                return (
                  <article
                    key={organization.id}
                    className={
                      isSelected
                        ? "rounded-lg border border-primary bg-primary/5 p-4"
                        : "rounded-lg border border-border bg-surface p-4"
                    }
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-semibold text-text-primary">
                            {organization.name}
                          </h3>
                          {isSelected ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              Selected
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-sm text-text-secondary">
                          flowplan/{organization.slug}
                        </p>
                        {organization._count ? (
                          <p className="mt-2 text-xs text-text-secondary">
                            {organization._count.members}{" "}
                            {organization._count.members === 1
                              ? "member"
                              : "members"}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <Button
                          variant="secondary"
                          onClick={() => setMemberOrganization(organization)}
                        >
                          Members
                        </Button>
                        <Button
                          variant={isSelected ? "primary" : "secondary"}
                          onClick={() => openWorkspace(organization)}
                        >
                          Open
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-surface px-5 py-4">
            <p className="text-sm font-medium text-text-primary">
              No organizations yet
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              Your organization list is empty. The form below creates the
              workspace and your OWNER membership together.
            </p>
          </div>
        )}

        <section
          className={
            hasOrganizations
              ? "rounded-xl border border-border bg-surface p-6"
              : "mt-5 rounded-xl border border-border bg-surface p-6"
          }
          aria-labelledby="create-organization-heading"
        >
          <h2
            id="create-organization-heading"
            className="text-lg font-semibold text-text-primary"
          >
            {hasOrganizations
              ? "Create another organization"
              : "Organization details"}
          </h2>
          <p className="mt-1 mb-5 text-sm text-text-secondary">
            You can change the generated slug before submitting.
          </p>
          <CreateOrganizationForm onCreated={handleCreated} />
        </section>
      </div>

      {memberOrganization ? (
        <OrganizationMembersModal
          organizationId={memberOrganization.id}
          organizationName={memberOrganization.name}
          onClose={() => setMemberOrganization(null)}
        />
      ) : null}
    </div>
  );
}
