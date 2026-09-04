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
  taskLists: ["tasks"] as const,
  tasks: (projectId: string, filters: TaskFilters = {}) =>
    ["tasks", { projectId, ...filters }] as const,
  taskComments: (taskId: string) => ["task-comments", { taskId }] as const,
};
