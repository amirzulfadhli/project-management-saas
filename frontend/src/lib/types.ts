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
  projectMembers: Array<{ userId: string; role: ProjectRole }>;
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
  position: number;
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

export interface AddOrganizationMemberInput {
  email: string;
}

export interface UpdateOrganizationMemberRoleInput {
  role: "OWNER" | "MEMBER";
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
  dueDate?: string | null;
  estimatedTime?: number | null;
  actualTime?: number | null;
  startDate?: string | null;
  completedAt?: string | null;
}

export interface MoveTaskInput {
  columnId: string;
  targetIndex: number;
}

export interface TaskFilters {
  columnId?: string;
  assigneeId?: string;
  priority?: number;
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

export interface GithubInstallUrlResponse {
  url: string;
  expiresAt: string;
}

export interface GithubInstallation {
  id: string;
  externalInstallationId: string;
  accountLogin: string;
  accountId: string;
  accountType: string;
  createdAt: string;
  updatedAt: string;
}

export interface GithubRepository {
  externalRepositoryId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  htmlUrl: string;
  private: boolean;
  archived: boolean;
}

export interface GithubRepositoryPage {
  items: GithubRepository[];
  page: number;
  perPage: number;
  totalCount: number;
  nextPage: number | null;
}

export interface ProjectRepository {
  id: string;
  projectId: string | null;
  provider: string;
  externalRepositoryId: string | null;
  owner: string | null;
  name: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string | null;
  installationId: string | null;
  connectedAt: string;
  updatedAt: string;
}

export interface ConnectGithubRepositoryInput {
  installationId: string;
  externalRepositoryId: string;
}

export interface GithubIssueSummary {
  externalIssueId: string;
  number: number;
  title: string;
  state: "open" | "closed";
  htmlUrl: string;
  updatedAt: string;
  linkedTask: { id: string; title: string } | null;
}

export interface GithubIssuePage {
  items: GithubIssueSummary[];
  page: number;
  perPage: number;
  nextPage: number | null;
  repository: { id: string; fullName: string };
}

export interface TaskGithubIssue {
  id: string;
  taskId: string;
  projectId: string;
  externalIssueId: string;
  number: number;
  title: string;
  state: "open" | "closed";
  htmlUrl: string;
  repository: { fullName: string };
  linkedTask: { id: string; title: string };
  lastSyncedAt: string;
  unavailableAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskFromGithubIssueResult {
  task: Task;
  issue: TaskGithubIssue;
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

export type NotificationType =
  | "TASK_ASSIGNED_TO_YOU"
  | "TASK_UNASSIGNED_FROM_YOU"
  | "COMMENT_REPLY_TO_YOU"
  | "COMMENT_ON_YOUR_TASK"
  | "PROJECT_MEMBER_ADDED_YOU"
  | "PROJECT_MEMBER_ROLE_CHANGED_YOU";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  projectId: string;
  entityType: "task" | "comment" | "project-member";
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
  actor: UserSummary;
  project: { id: string; name: string };
}

export interface NotificationPage {
  items: NotificationItem[];
  nextCursor: string | null;
}

export interface NotificationUnreadCount {
  count: number;
}

export interface AttachmentItem {
  id: string;
  projectId: string;
  taskId: string | null;
  uploaderId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploader: UserSummary;
}

export interface AttachmentPage {
  items: AttachmentItem[];
  nextCursor: string | null;
}

export interface WikiPageSummary {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  position: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  creator: UserSummary;
}

export interface WikiPage extends WikiPageSummary {
  content: string;
}

export interface CreateWikiPageInput {
  title: string;
  content?: string;
  parentId?: string | null;
}

export interface UpdateWikiPageInput {
  title?: string;
  content?: string;
}

export interface MoveWikiPageInput {
  parentId: string | null;
  targetIndex: number;
}

export interface TimeEntry {
  id: string;
  projectId: string;
  taskId: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  task: { id: string; title: string; projectId: string };
}

export interface TaskTimePage {
  taskId: string;
  totalSeconds: number;
  items: TimeEntry[];
  nextCursor: string | null;
}

export interface ActiveTimerResponse {
  activeTimer: TimeEntry | null;
}

export interface ProjectTimeSummary {
  projectId: string;
  totalSeconds: number;
  currentUserSeconds: number;
  tasks: Array<{ taskId: string; title: string; totalSeconds: number }>;
  users: Array<{
    userId: string;
    name: string;
    email: string;
    image: string | null;
    totalSeconds: number;
  }> | null;
}

export interface CreateManualTimeEntryInput {
  startedAt: string;
  endedAt: string;
  note?: string | null;
}
