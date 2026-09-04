/**
 * API response types for the FlowPlan backend.
 *
 * These mirror the Prisma include shapes returned by the NestJS services in
 * `backend/src/**​/*.service.ts`. Dates are serialized to ISO strings over JSON.
 */

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface OrganizationMember {
  id: string;
  role: "OWNER" | "MEMBER";
  organizationId: string;
  userId: string;
  user?: UserSummary;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  owner?: UserSummary;
  members?: OrganizationMember[];
  _count?: { projects: number; members: number; teams: number };
}

export interface Column {
  id: string;
  name: string;
  projectId: string;
  position: number;
  boardId?: string | null;
  _count?: { tasks: number };
}

export interface Board {
  id: string;
  name: string;
  projectId: string;
  columns: Column[];
}

export type ProjectRole = "OWNER" | "MEMBER";

export interface ProjectMember {
  id: string;
  role: ProjectRole;
  projectId: string;
  userId: string;
  user: UserSummary;
}

export interface ProjectOrganizationRef {
  id: string;
  name: string;
  slug: string;
}

export interface ProjectTeamRef {
  id: string;
  name: string;
}

/** Shape returned by `GET /api/projects` (list). */
export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  teamId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  organization: ProjectOrganizationRef;
  team: ProjectTeamRef | null;
  _count: { tasks: number; projectMembers: number };
}

/** Shape returned by `GET /api/projects/:id` (detail, with board + members). */
export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  teamId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  organization: Organization;
  team: ProjectTeamRef | null;
  board: Board | null;
  projectMembers: ProjectMember[];
}

export interface TaskColumnRef {
  id: string;
  name: string;
  position: number;
}

export interface TaskProjectRef {
  id: string;
  name: string;
}

/** Compact shape returned by Task create, list, detail, and update routes. */
export interface Task {
  id: string;
  title: string;
  description: string | null;
  columnId: string;
  projectId: string;
  assigneeId: string | null;
  reporterId: string;
  priority: number;
  status: string;
  dueDate: string | null;
  estimatedTime: number | null;
  actualTime: number | null;
  startDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  githubIssueId: string | null;
  githubIssueNumber: number | null;
  githubBranch: string | null;
  githubPrNumbers: string[];
  deploymentStatus: string | null;
  assignee: UserSummary | null;
  reporter: UserSummary;
  column: TaskColumnRef;
  project: TaskProjectRef;
}

/** Payloads sent to the backend (mirrors the Zod DTOs). */
export interface CreateOrganizationInput {
  name: string;
  slug?: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  organizationId: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
}

export interface CreateProjectColumnInput {
  name: string;
}

export interface UpdateProjectColumnInput {
  name: string;
}

export interface AddProjectMemberInput {
  userId: string;
  role?: ProjectRole;
}

export interface UpdateProjectMemberRoleInput {
  role: ProjectRole;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  projectId: string;
  columnId: string;
  assigneeId?: string;
  priority?: number;
  status?: string;
  dueDate?: string;
  estimatedTime?: number;
  startDate?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  columnId?: string;
  assigneeId?: string | null;
  priority?: number;
  status?: string;
  dueDate?: string | null;
  estimatedTime?: number | null;
  actualTime?: number | null;
  startDate?: string | null;
  completedAt?: string | null;
}

export interface TaskFilters {
  columnId?: string;
  assigneeId?: string;
  priority?: number;
  status?: string;
}

export interface ActivityTaskRef {
  id: string;
  title: string;
}

export interface ActivityItem {
  id: string;
  type: string;
  description: string;
  metadata: Record<string, unknown> | null;
  taskId: string | null;
  projectId: string;
  createdAt: string;
  actor: UserSummary;
  task: ActivityTaskRef | null;
}

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
}

export interface CommentItem {
  id: string;
  taskId: string;
  parentId: string | null;
  content: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: UserSummary;
}

export interface CommentPage {
  items: CommentItem[];
  nextCursor: string | null;
}

export interface CreateCommentInput {
  content: string;
  parentId?: string;
}

export interface UpdateCommentInput {
  content: string;
}
