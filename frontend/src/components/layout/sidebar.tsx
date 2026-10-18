"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { useOrganization } from "@/components/organizations/organization-provider";
import { Icon } from "@/components/ui/icon";

const navigation = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/projects", label: "Projects", icon: "projects" },
  { href: "/tasks", label: "Tasks", icon: "tasks" },
] as const;

export default function Sidebar({
  onNavigate,
  onMembers,
}: {
  onNavigate?: () => void;
  onMembers: () => void;
}) {
  const pathname = usePathname();
  const { selectedOrganization } = useOrganization();
  return (
    <div className="flex h-full min-w-0 flex-col gap-5">
      <div className="border-b border-border pb-5">
        <Link
          href="/"
          onClick={onNavigate}
          className="inline-flex min-h-11 items-center text-lg font-semibold tracking-tight"
          aria-label="FlowPlan home"
        >
          <span
            className="mr-2 inline-block h-4 w-1 rounded-sm bg-primary"
            aria-hidden="true"
          />
          FlowPlan
        </Link>
        <OrganizationSwitcher onNavigate={onNavigate} />
      </div>
      <nav className="space-y-1" aria-label="Primary navigation">
        {navigation.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium ${active ? "bg-selected text-primary" : "text-text-secondary hover:bg-hover hover:text-text-primary"}`}
            >
              <Icon name={item.icon} className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-border pt-5">
        <p className="mb-2 px-3 text-xs font-medium text-text-secondary">
          Organization
        </p>
        <button
          type="button"
          disabled={!selectedOrganization}
          onClick={onMembers}
          className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-text-secondary hover:bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="members" className="size-4 shrink-0" />
          Members
        </button>
        <Link
          href="/organizations"
          onClick={onNavigate}
          aria-current={pathname === "/organizations" ? "page" : undefined}
          className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm ${pathname === "/organizations" ? "bg-selected text-primary" : "text-text-secondary hover:bg-hover hover:text-text-primary"}`}
        >
          <Icon name="organizations" className="size-4 shrink-0" />
          Manage organizations
        </Link>
      </div>
    </div>
  );
}
