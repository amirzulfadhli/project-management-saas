"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries";
import type { ProjectDetail } from "@/lib/types";
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
  const projectId = isProject ? pathname.split("/")[2] : null;
  // Observe the workspace's authorized cache; the global header never fetches Project data.
  const project = useQuery<ProjectDetail>({
    queryKey: queryKeys.project(projectId ?? "none"),
    enabled: false,
  });
  const projectName =
    !project.isError && projectId ? project.data?.name : undefined;
  const sections: Record<string, string> = {
    tasks: "Task",
    docs: "Docs",
    files: "Files",
    activity: "Activity",
    time: "Time",
    github: "GitHub",
    members: "Members",
    settings: "Project settings",
  };
  const section = sections[pathname.split("/")[3]] ?? "Board";
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
              <li className="min-w-0 truncate font-medium">
                <Link href={`/projects/${projectId}`}>
                  {projectName ?? "Project"}
                </Link>
              </li>
              <li aria-hidden="true" className="text-text-secondary">
                /
              </li>
              <li aria-current="page" className="shrink-0 text-text-secondary">
                {section}
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
