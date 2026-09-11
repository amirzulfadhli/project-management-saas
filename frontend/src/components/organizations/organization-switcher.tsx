"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { useOrganization } from "./organization-provider";

export function OrganizationSwitcher({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { organizations, selectedOrganizationId, selectOrganization } =
    useOrganization();

  if (organizations.length === 0) {
    return (
      <Link
        href="/organizations"
        onClick={onNavigate}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        Create organization
      </Link>
    );
  }

  return (
    <div className="mt-2 min-w-0">
      <Select
        aria-label="Current organization"
        className="max-w-full"
        value={selectedOrganizationId ?? ""}
        onChange={(event) => {
          selectOrganization(event.target.value);
          onNavigate?.();
          if (pathname.startsWith("/projects/")) router.push("/projects");
        }}
      >
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
