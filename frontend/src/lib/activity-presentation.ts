import type { ActivityItem } from "./types";

export type ActivityCategory =
  "project" | "task" | "member" | "comment" | "integration";

interface ActivityDefinition {
  fallback: string;
  category: ActivityCategory;
}

const activityDefinitions: Record<string, ActivityDefinition> = {
  PROJECT_CREATED: { fallback: "created the Project", category: "project" },
  PROJECT_UPDATED: { fallback: "updated the Project", category: "project" },
  PROJECT_ARCHIVED: { fallback: "archived the Project", category: "project" },
  PROJECT_RESTORED: { fallback: "restored the Project", category: "project" },
  PROJECT_DUPLICATED: {
    fallback: "duplicated the Project",
    category: "project",
  },
  PROJECT_MEMBER_ADDED: {
    fallback: "added a Project member",
    category: "member",
  },
  PROJECT_MEMBER_ROLE_CHANGED: {
    fallback: "changed a Project member role",
    category: "member",
  },
  PROJECT_MEMBER_REMOVED: {
    fallback: "removed a Project member",
    category: "member",
  },
  TASK_CREATED: { fallback: "created a Task", category: "task" },
  TASK_RENAMED: { fallback: "renamed a Task", category: "task" },
  TASK_UPDATED: { fallback: "updated a Task", category: "task" },
  TASK_MOVED: { fallback: "moved a Task", category: "task" },
  TASK_STATUS_CHANGED: {
    fallback: "changed a Task status",
    category: "task",
  },
  TASK_ASSIGNEE_CHANGED: {
    fallback: "changed a Task assignee",
    category: "task",
  },
  TASK_PRIORITY_CHANGED: {
    fallback: "changed a Task priority",
    category: "task",
  },
  TASK_DELETED: { fallback: "deleted a Task", category: "task" },
  COMMENT_CREATED: { fallback: "added a Comment", category: "comment" },
  COMMENT_UPDATED: { fallback: "updated a Comment", category: "comment" },
  COMMENT_DELETED: { fallback: "deleted a Comment", category: "comment" },
  GITHUB_REPOSITORY_CONNECTED: {
    fallback: "connected a GitHub repository",
    category: "integration",
  },
  GITHUB_REPOSITORY_DISCONNECTED: {
    fallback: "disconnected a GitHub repository",
    category: "integration",
  },
  GITHUB_ISSUE_LINKED: {
    fallback: "linked a Task to a GitHub Issue",
    category: "integration",
  },
  GITHUB_ISSUE_UNLINKED: {
    fallback: "unlinked a GitHub Issue",
    category: "integration",
  },
  TASK_CREATED_FROM_GITHUB_ISSUE: {
    fallback: "created a Task from a GitHub Issue",
    category: "integration",
  },
  ATTACHMENT_UPLOADED: {
    fallback: "uploaded an attachment",
    category: "integration",
  },
  ATTACHMENT_DELETED: {
    fallback: "deleted an attachment",
    category: "integration",
  },
  WIKI_PAGE_CREATED: {
    fallback: "created a documentation page",
    category: "project",
  },
  WIKI_PAGE_UPDATED: {
    fallback: "updated a documentation page",
    category: "project",
  },
  WIKI_PAGE_DELETED: {
    fallback: "deleted a documentation page",
    category: "project",
  },
};

export function presentActivity(activity: ActivityItem): {
  text: string;
  category: ActivityCategory;
} {
  const definition = activityDefinitions[activity.type];
  const description = activity.description.trim();

  return {
    text: description
      ? lowerFirst(description)
      : (definition?.fallback ?? "recorded an update"),
    category: definition?.category ?? "project",
  };
}

export function formatActivityTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLocaleLowerCase() + value.slice(1);
}
