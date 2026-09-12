import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Home from "@/app/page";
import { TaskRow } from "@/components/tasks/task-row";
import { ProjectTimePanel } from "@/components/time-tracking/project-time-panel";
import { ProjectGithubIssues } from "@/components/github/project-github-issues";
import { TaskGithubPanel } from "@/components/github/task-github-panel";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { column, taskFixture } from "./project-fixtures";
import TaskPage from "@/app/projects/[id]/tasks/[taskId]/page";
import TaskSheet from "@/app/@task/(.)projects/[id]/tasks/[taskId]/page";
import NoTask from "@/app/@task/page";
import DismissTask from "@/app/@task/[...rest]/page";
import DefaultTask from "@/app/@task/default";

jest.mock("@/components/tasks/task-route", () => ({ TaskRoute: () => null }));
jest.mock("@/components/tasks/use-organization-tasks", () => ({
  useOrganizationTasks: () => ({
    projects: [],
    tasks: [{ ...taskFixture, dueDate: "2026-09-30" }],
    isPending: false,
    isError: false,
  }),
}));
jest.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "user-a" } } }) },
}));
function setup(content: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  render(<QueryClientProvider client={client}>{content}</QueryClientProvider>);
  return client;
}
afterEach(() => jest.restoreAllMocks());
test("compact Task GitHub context waits for explicit discovery", async () => {
  jest.spyOn(api, "getTaskGithubIssue").mockResolvedValue(null);
  jest
    .spyOn(api, "getProjectRepository")
    .mockResolvedValue({ id: "repo-a" } as Awaited<
      ReturnType<typeof api.getProjectRepository>
    >);
  jest.spyOn(api, "getProjectGithubIssues").mockResolvedValue({
    items: [],
    page: 1,
    perPage: 30,
    nextPage: null,
    repository: { id: "repo-a", fullName: "owner/repo" },
  });
  setup(
    <TaskGithubPanel
      projectId="project-a"
      taskId="task-a"
      currentUserId="user-a"
      compact
    />,
  );
  const choose = await screen.findByRole("button", {
    name: "Link GitHub Issue",
  });
  expect(api.getProjectGithubIssues).not.toHaveBeenCalled();
  fireEvent.click(choose);
  await waitFor(() =>
    expect(api.getProjectGithubIssues).toHaveBeenCalledWith("project-a", {
      page: 1,
      perPage: 30,
      state: "open",
    }),
  );
});
test("Home due Tasks and Tasks rows use the same exact Task route", () => {
  setup(
    <>
      <Home />
      <TaskRow task={taskFixture} organizationId="org-a" />
    </>,
  );
  const links = screen
    .getAllByRole("link")
    .filter((link) => link.textContent?.includes(taskFixture.title));
  expect(links).toHaveLength(2);
  for (const link of links)
    expect(link.getAttribute("href")).toBe("/projects/project-a/tasks/task-a");
});
test("Project Time opens the actual Task rather than only its Project", async () => {
  jest.spyOn(api, "getProjectTime").mockResolvedValue({
    projectId: "project-a",
    totalSeconds: 60,
    currentUserSeconds: 60,
    tasks: [{ taskId: "task-a", title: taskFixture.title, totalSeconds: 60 }],
    users: null,
  });
  setup(<ProjectTimePanel projectId="project-a" />);
  expect(
    (await screen.findByRole("link", { name: taskFixture.title })).getAttribute(
      "href",
    ),
  ).toBe("/projects/project-a/tasks/task-a");
});
test("linked GitHub Issue opens its exact Task and retains import conflict controls", async () => {
  jest.spyOn(api, "getProjectGithubIssues").mockResolvedValue({
    page: 1,
    perPage: 20,
    nextPage: null,
    repository: { id: "repo-a", fullName: "owner/repo" },
    items: [
      {
        externalIssueId: "123",
        number: 1,
        title: "Issue",
        state: "open",
        htmlUrl: "https://github.com/owner/repo/issues/1",
        updatedAt: "2026-09-01T00:00:00Z",
        linkedTask: { id: "task-a", title: taskFixture.title },
      },
    ],
  });
  setup(
    <ProjectGithubIssues
      projectId="project-a"
      currentUserId="user-a"
      columns={[column]}
    />,
  );
  expect(
    (await screen.findByRole("link", { name: taskFixture.title })).getAttribute(
      "href",
    ),
  ).toBe("/projects/project-a/tasks/task-a");
  expect(
    (
      screen.getByRole("button", {
        name: "Already linked",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
test("direct and intercepted routes share identity; empty slots dismiss on home/other navigation", async () => {
  const params = Promise.resolve({ id: "project-a", taskId: "task-a" });
  const page = await TaskPage({ params });
  const sheet = await TaskSheet({ params });
  expect(page.props).toEqual({ projectId: "project-a", taskId: "task-a" });
  expect(sheet.props).toEqual({
    projectId: "project-a",
    taskId: "task-a",
    sheet: true,
  });
  expect(NoTask()).toBeNull();
  expect(DismissTask()).toBeNull();
  expect(DefaultTask()).toBeNull();
});
test("Task row deletion tombstones any previously opened detail", async () => {
  jest.spyOn(window, "confirm").mockReturnValue(true);
  jest.spyOn(api, "deleteTask").mockResolvedValue(undefined);
  const client = setup(<TaskRow task={taskFixture} organizationId="org-a" />);
  const key = queryKeys.task("project-a", "task-a", "user-a");
  client.setQueryData(key, taskFixture);
  fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));
  await waitFor(() => expect(client.getQueryData(key)).toBeNull());
});
