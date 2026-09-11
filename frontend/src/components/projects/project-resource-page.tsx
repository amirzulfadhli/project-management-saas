"use client";

import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { ProjectWikiPanel } from "@/components/wiki/project-wiki-panel";
import { ProjectTimePanel } from "@/components/time-tracking/project-time-panel";
import { ProjectActivityPanel } from "./project-activity-panel";
import { ProjectGithubPanel } from "./project-github-panel";
import { ProjectMembersPanel } from "./project-members-panel";
import { ProjectSettings } from "./project-settings";
import { useProjectWorkspace } from "./project-workspace";

export type ProjectResource =
  "docs" | "files" | "activity" | "time" | "github" | "members" | "settings";
const labels: Record<ProjectResource, string> = {
  docs: "Docs",
  files: "Project files",
  activity: "Activity",
  time: "Time",
  github: "GitHub",
  members: "Project members",
  settings: "Project settings",
};

export function ProjectResourcePage({ section }: { section: ProjectResource }) {
  const {
    project,
    columns,
    currentUserId,
    canAdministerProject: canAdminister,
  } = useProjectWorkspace();
  const common = { projectId: project.id, canAdminister, currentUserId };
  if (section === "settings") return <ProjectSettings />;
  return (
    <section className="min-w-0 space-y-4" aria-label={labels[section]}>
      <h2 className="text-lg font-semibold">{labels[section]}</h2>
      {section === "docs" ? (
        <ProjectWikiPanel key={project.id} {...common} />
      ) : null}
      {section === "files" ? (
        <AttachmentsPanel scope="project" resourceId={project.id} {...common} />
      ) : null}
      {section === "activity" ? (
        <ProjectActivityPanel projectId={project.id} />
      ) : null}
      {section === "time" ? <ProjectTimePanel projectId={project.id} /> : null}
      {section === "github" ? (
        <ProjectGithubPanel {...common} columns={columns} />
      ) : null}
      {section === "members" ? (
        <ProjectMembersPanel
          projectId={project.id}
          organizationId={project.organizationId}
        />
      ) : null}
    </section>
  );
}
