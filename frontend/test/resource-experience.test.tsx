import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type {
  ActivityItem,
  AttachmentItem,
  ProjectRepository,
} from "@/lib/types";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { ProjectActivityPanel } from "@/components/projects/project-activity-panel";
import { ProjectGithubIssues } from "@/components/github/project-github-issues";
import { TaskGithubPanel } from "@/components/github/task-github-panel";
import { ProjectGithubPanel } from "@/components/projects/project-github-panel";
import { TaskTimePanel } from "@/components/time-tracking/task-time-panel";
import { TaskDraftProvider } from "@/components/tasks/task-drafts";
import { column, user, taskFixture } from "./project-fixtures";

const file: AttachmentItem = {
  id: "file-a",
  projectId: "project-a",
  taskId: null,
  uploaderId: "other",
  originalName: "Design evidence.txt",
  mimeType: "text/plain",
  sizeBytes: 12,
  createdAt: "2026-09-01T00:00:00Z",
  uploader: { ...user, id: "other" },
};
const repo: ProjectRepository = {
  id: "repo-a",
  projectId: "project-a",
  provider: "github",
  externalRepositoryId: "123",
  owner: "owner",
  name: "repo",
  fullName: "owner/repo",
  htmlUrl: "https://github.com/owner/repo",
  defaultBranch: "main",
  installationId: "installation-a",
  connectedAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};
const issue = {
  externalIssueId: "456",
  number: 1,
  title: "Issue",
  state: "open" as const,
  htmlUrl: "https://github.com/owner/repo/issues/1",
  updatedAt: "2026-09-01T00:00:00Z",
  linkedTask: null,
};
function setup(content: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const tree = (children: ReactNode) => (
    <QueryClientProvider client={client}>
      <TaskDraftProvider>{children}</TaskDraftProvider>
    </QueryClientProvider>
  );
  return { client, tree, ...render(tree(content)) };
}
afterEach(() => jest.restoreAllMocks());
const files = (scope: "task" | "project", owner = false) => (
  <AttachmentsPanel
    scope={scope}
    resourceId={scope === "task" ? "task-a" : "project-a"}
    projectId="project-a"
    currentUserId="user-a"
    canAdminister={owner}
  />
);

test.each(["project", "task"] as const)(
  "%s files retain scoped pagination and authenticated download",
  async (scope) => {
    const list = jest
      .spyOn(
        api,
        scope === "project" ? "getProjectAttachments" : "getTaskAttachments",
      )
      .mockResolvedValueOnce({ items: [file], nextCursor: "next" })
      .mockResolvedValue({
        items: [{ ...file, id: "file-b", originalName: "Second.txt" }],
        nextCursor: null,
      });
    const download = jest
      .spyOn(
        api,
        scope === "project"
          ? "downloadProjectAttachment"
          : "downloadTaskAttachment",
      )
      .mockRejectedValue(new ApiError(403, "Denied", {}));
    setup(files(scope));
    await screen.findByText(file.originalName);
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Second.txt");
    expect(list).toHaveBeenLastCalledWith(
      scope === "project" ? "project-a" : "task-a",
      { cursor: "next", limit: 50 },
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Download" })[0]);
    await screen.findByRole("alert");
    expect(download).toHaveBeenCalledWith(
      scope === "project" ? "project-a" : "task-a",
      "file-a",
    );
  },
);

test("file pagination errors keep loaded rows; final access loss hides rows and upload", async () => {
  const list = jest
    .spyOn(api, "getProjectAttachments")
    .mockResolvedValueOnce({ items: [file], nextCursor: "next" })
    .mockRejectedValue(new ApiError(500, "Temporary failure", {}));
  const view = setup(files("project"));
  fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
  await screen.findByRole("alert");
  expect(screen.getByText(file.originalName)).toBeTruthy();
  list.mockRejectedValue(new ApiError(403, "Denied", {}));
  await act(async () => {
    await view.client.invalidateQueries({
      queryKey: queryKeys.projectAttachments("project-a", "user-a"),
    });
  });
  await screen.findByText("You do not have permission for this attachment.");
  expect(screen.queryByText(file.originalName)).toBeNull();
  expect(screen.queryByLabelText("Upload file")).toBeNull();
});

test("owner deletion stays confirmed and failed storage deletion keeps the row", async () => {
  jest
    .spyOn(api, "getProjectAttachments")
    .mockResolvedValue({ items: [file], nextCursor: null });
  jest.spyOn(window, "confirm").mockReturnValue(true);
  const remove = jest
    .spyOn(api, "deleteProjectAttachment")
    .mockRejectedValue(new ApiError(409, "Storage unavailable", {}));
  setup(files("project", true));
  fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
  await screen.findByText("Storage unavailable");
  expect(screen.getByText(file.originalName)).toBeTruthy();
  expect(remove).toHaveBeenCalledWith("project-a", "file-a");
});

test("Activity links use live Task references and keep deleted history as text without eager Task fetches", async () => {
  const activity: ActivityItem = {
    id: "activity-a",
    projectId: "project-a",
    taskId: "task-a",
    type: "TASK_CREATED",
    description: "Created Task",
    metadata: {},
    actor: user,
    createdAt: "2026-09-01T00:00:00Z",
    task: { id: "task-a", title: "Live Task" },
  };
  jest
    .spyOn(api, "getProjectActivities")
    .mockResolvedValueOnce({ items: [activity], nextCursor: "next" })
    .mockResolvedValue({
      items: [
        {
          ...activity,
          id: "activity-b",
          type: "TASK_DELETED",
          taskId: null,
          task: null,
          description: "Deleted historical task",
        },
      ],
      nextCursor: null,
    });
  const detail = jest.spyOn(api, "getTask");
  setup(<ProjectActivityPanel projectId="project-a" />);
  expect(
    (await screen.findByRole("link", { name: "Task: Live Task" })).getAttribute(
      "href",
    ),
  ).toBe("/projects/project-a/tasks/task-a");
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() =>
    expect(api.getProjectActivities).toHaveBeenLastCalledWith("project-a", {
      cursor: "next",
      limit: 30,
    }),
  );
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(detail).not.toHaveBeenCalled();
});

test("GitHub import requires an explicit valid destination and sends only existing contract fields", async () => {
  jest.spyOn(api, "getProjectGithubIssues").mockResolvedValue({
    page: 1,
    perPage: 20,
    nextPage: null,
    repository: repo,
    items: [issue],
  });
  const create = jest
    .spyOn(api, "createTaskFromGithubIssue")
    .mockRejectedValue(new ApiError(409, "Conflict", {}));
  setup(
    <ProjectGithubIssues
      projectId="project-a"
      repositoryId="repo-a"
      columns={[column, { ...column, id: "foreign", projectId: "project-b" }]}
      currentUserId="user-a"
    />,
  );
  const button = await screen.findByRole("button", { name: "Create Task" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(
    screen
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value),
  ).not.toContain("foreign");
  fireEvent.change(screen.getByLabelText("Destination Column"), {
    target: { value: column.id },
  });
  fireEvent.click(button);
  await screen.findByRole("alert");
  expect(create).toHaveBeenCalledWith("project-a", 1, column.id);
});

test("GitHub link selection cannot carry into a different Issue page", async () => {
  jest.spyOn(api, "getTaskGithubIssue").mockResolvedValue(null);
  jest.spyOn(api, "getProjectRepository").mockResolvedValue(repo);
  jest
    .spyOn(api, "getProjectGithubIssues")
    .mockImplementation(async (_project, query) => ({
      page: query!.page!,
      perPage: 30,
      nextPage: query!.page === 1 ? 2 : null,
      repository: repo,
      items: [{ ...issue, number: query!.page! }],
    }));
  const link = jest.spyOn(api, "linkTaskGithubIssue");
  setup(
    <TaskGithubPanel
      taskId="task-a"
      projectId="project-a"
      currentUserId="user-a"
    />,
  );
  fireEvent.change(await screen.findByLabelText("Issue from owner/repo"), {
    target: { value: "1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("option", { name: "#2 Issue" });
  expect(
    (screen.getByRole("button", { name: "Link Issue" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(link).not.toHaveBeenCalled();
});

test("legacy GitHub connection performs no impossible Issue or installation discovery", async () => {
  jest
    .spyOn(api, "getProjectRepository")
    .mockResolvedValue({ ...repo, installationId: null });
  const issues = jest.spyOn(api, "getProjectGithubIssues");
  const installations = jest.spyOn(api, "getGithubInstallations");
  setup(
    <ProjectGithubPanel
      projectId="project-a"
      canAdminister={false}
      columns={[column]}
      currentUserId="user-a"
    />,
  );
  await screen.findByText(/Issue discovery requires a verified/);
  expect(issues).not.toHaveBeenCalled();
  expect(installations).not.toHaveBeenCalled();
  expect(screen.queryByText("Manage connection")).toBeNull();
});

test("repository identity mismatch blocks stale import actions", async () => {
  jest.spyOn(api, "getProjectGithubIssues").mockResolvedValue({
    page: 1,
    perPage: 20,
    nextPage: null,
    repository: repo,
    items: [issue],
  });
  setup(
    <ProjectGithubIssues
      projectId="project-a"
      repositoryId="replacement"
      columns={[column]}
      currentUserId="user-a"
    />,
  );
  await screen.findByText(/repository connection changed/);
  expect(screen.queryByRole("button", { name: "Create Task" })).toBeNull();
});

test("active-elsewhere timer links to its Task without starting a second timer", async () => {
  jest.spyOn(api, "getTaskTime").mockResolvedValue({
    taskId: "task-a",
    items: [],
    nextCursor: null,
    totalSeconds: 0,
  });
  jest.spyOn(api, "getActiveTimer").mockResolvedValue({
    activeTimer: {
      id: "timer",
      projectId: "project-b",
      taskId: "task-b",
      userId: user.id,
      startedAt: "2026-09-01T00:00:00Z",
      endedAt: null,
      durationSeconds: null,
      note: null,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
      task: {
        id: "task-b",
        projectId: "project-b",
        title: taskFixture.title,
      },
    },
  });
  setup(
    <TaskTimePanel
      taskId="task-a"
      projectId="project-a"
      currentUserId="user-a"
      compact
    />,
  );
  expect(
    (await screen.findByRole("link", { name: taskFixture.title })).getAttribute(
      "href",
    ),
  ).toBe("/projects/project-b/tasks/task-b");
  expect(
    (screen.getByRole("button", { name: "Start timer" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
