import type { TaskFilters } from "./types";

/**
 * Central query-key contracts so pages and components invalidate the same
 * cache entries. Prefix invalidation is used heavily: invalidating `["tasks"]`
 * also covers `["tasks", {...}]`, and `["projects"]` covers every
 * organization-scoped Project list.
 */
export const queryKeys = {
  organizations: ["organizations"] as const,
  organization: (id: string) => ["organization", id] as const,
  organizationMembers: (organizationId: string) =>
    ["organization-members", { organizationId }] as const,
  projectLists: ["projects"] as const,
  projects: (organizationId: string) =>
    ["projects", { organizationId }] as const,
  project: (id: string) => ["project", id] as const,
  projectColumns: (projectId: string) =>
    ["project-columns", { projectId }] as const,
  projectMembers: (projectId: string) =>
    ["project-members", { projectId }] as const,
  projectActivities: (projectId: string) =>
    ["project-activities", { projectId }] as const,
  githubInstallations: ["github-installations"] as const,
  githubRepositories: (installationId: string, page: number, perPage: number) =>
    ["github-repositories", { installationId, page, perPage }] as const,
  projectRepository: (projectId: string) =>
    ["project-repository", { projectId }] as const,
  taskLists: ["tasks"] as const,
  tasks: (projectId: string, filters: TaskFilters = {}) =>
    ["tasks", { projectId, ...filters }] as const,
  taskComments: (taskId: string) => ["task-comments", { taskId }] as const,
  projectAttachments: (projectId: string, userId: string | null = null) =>
    ["project-attachments", { projectId, userId }] as const,
  taskAttachments: (taskId: string, userId: string | null = null) =>
    ["task-attachments", { taskId, userId }] as const,
  wikiPages: (projectId: string, userId: string | null = null) =>
    ["wiki-pages", { projectId, userId }] as const,
  wikiPage: (projectId: string, pageId: string, userId: string | null = null) =>
    ["wiki-page", { projectId, pageId, userId }] as const,
  taskTime: (taskId: string, userId: string | null = null) =>
    ["task-time", { taskId, userId }] as const,
  projectTime: (projectId: string, userId: string | null = null) =>
    ["project-time", { projectId, userId }] as const,
  activeTimer: (userId: string | null = null) =>
    ["active-timer", { userId }] as const,
  notifications: (userId: string) => ["notifications", { userId }] as const,
  notificationUnreadCount: (userId: string) =>
    ["notification-unread-count", { userId }] as const,
};
