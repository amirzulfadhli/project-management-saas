import type { ActivityItem } from "./types";

export type ActivityCategory = "project" | "task" | "member" | "comment";

interface ActivityDefinition {
  fallback: string;
  category: ActivityCategory;
}

const activityDefinitions: Record<string, ActivityDefinition> = {
  PROJECT_CREATED: { fallback: "created the Project", category: "project" },
  PROJECT_UPDATED: { fallback: "updated the Project", category: "project" },
  PROJECT_ARCHIVED: { fallback: "archived the Project", category: "project" },
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
