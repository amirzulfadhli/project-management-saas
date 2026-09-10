"use client";

import Link from "next/link";
import { Select } from "@/components/ui/select";
import { useOrganization } from "./organization-provider";

export function OrganizationSwitcher() {
  const { organizations, selectedOrganizationId, selectOrganization } =
    useOrganization();

  if (organizations.length === 0) {
    return (
      <Link
        href="/organizations"
        className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Create organization
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label="Current organization"
        className="w-32 min-w-0 sm:w-auto sm:min-w-40 sm:max-w-56"
        value={selectedOrganizationId ?? ""}
        onChange={(event) => selectOrganization(event.target.value)}
      >
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </Select>
      <Link
        href="/organizations"
        className="hidden text-sm font-medium text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:inline"
      >
        Manage
      </Link>
    </div>
  );
}
