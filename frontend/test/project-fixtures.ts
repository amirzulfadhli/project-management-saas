import type { ProjectDetail, ProjectSummary } from "@/lib/types";
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
