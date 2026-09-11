"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthStatus } from "@/components/auth/auth-status";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Icon } from "@/components/ui/icon";

export default function Header({
  onOpenNavigation,
  navigationOpen,
}: {
  onOpenNavigation: () => void;
  navigationOpen: boolean;
}) {
  const pathname = usePathname();
  const isProject = pathname.startsWith("/projects/");
  const label =
    pathname === "/"
      ? "Home"
      : pathname.startsWith("/organizations")
        ? "Organizations"
        : pathname.startsWith("/tasks")
          ? "Tasks"
          : pathname.startsWith("/projects")
            ? "Projects"
            : "Workspace";
  return (
    <header className="sticky top-0 z-20 flex min-h-[var(--header-height)] shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className="icon-control text-text-secondary hover:bg-hover md:hidden"
          onClick={onOpenNavigation}
          aria-label="Open workspace navigation"
          aria-haspopup="dialog"
          aria-expanded={navigationOpen}
        >
          <Icon name="menu" />
        </button>
        <nav aria-label="Breadcrumb" className="min-w-0 text-sm">
          {isProject ? (
            <ol className="flex min-w-0 items-center gap-2">
              <li className="hidden sm:block">
                <Link
                  href="/projects"
                  className="text-text-secondary hover:text-text-primary"
                >
                  Projects
                </Link>
              </li>
              <li
                aria-hidden="true"
                className="hidden text-text-secondary sm:block"
              >
                /
              </li>
              <li aria-current="page" className="truncate font-medium">
                Project
              </li>
            </ol>
          ) : (
            <span aria-current="page" className="font-medium">
              {label}
            </span>
          )}
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <NotificationBell />
        <AuthStatus />
      </div>
    </header>
  );
}
