import type { ProjectDetail, ProjectSummary, Task } from "@/lib/types";
export const user = {
  id: "user-a",
  name: "Sarah",
  email: "sarah@example.test",
};
export const member = {
  id: "member-a",
  userId: user.id,
  role: "OWNER" as const,
  user,
};
export const organization = {
  id: "org-a",
  name: "Studio",
  owner: user,
  members: [member],
};
export const column = {
  id: "column-a",
  name: "Backlog",
  position: 0,
  projectId: "project-a",
  boardId: "board-a",
};
export const projectFixture = {
  id: "project-a",
  name: "FlowPlan",
  description: "Developer workspace",
  organizationId: "org-a",
  archivedAt: null,
  organization,
  projectMembers: [member],
  board: { id: "board-a", columns: [column] },
} as unknown as ProjectDetail;
export const projectSummary = {
  ...projectFixture,
  _count: { tasks: 3, projectMembers: 1 },
} as ProjectSummary;
export const taskFixture: Task = {
  id: "task-a",
  projectId: "project-a",
  columnId: "column-a",
  title: "Recover session",
  description: "Plain text description",
  assigneeId: null,
  priority: 2,
  position: 0,
  reporterId: user.id,
  reporter: user,
  assignee: null,
  column,
  project: projectFixture,
  dueDate: null,
  estimatedTime: null,
  actualTime: null,
  startDate: null,
  completedAt: null,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  githubIssueId: null,
  githubIssueNumber: null,
  githubBranch: null,
  githubPrNumbers: [],
  deploymentStatus: null,
};
