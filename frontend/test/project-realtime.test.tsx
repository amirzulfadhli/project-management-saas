import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RealtimeProvider } from "@/lib/realtime";
import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { column, projectFixture } from "./project-fixtures";

const mockHandlers = new Map<string, (...args: unknown[]) => void>();
const mockSocket = {
  connected: true,
  on: jest.fn((name: string, callback: (...args: unknown[]) => void) =>
    mockHandlers.set(name, callback),
  ),
  off: jest.fn((name: string) => mockHandlers.delete(name)),
  emit: jest.fn((_name: string, _data: unknown, callback?: () => void) =>
    callback?.(),
  ),
  connect: jest.fn(),
  disconnect: jest.fn(),
};
jest.mock("socket.io-client", () => ({ io: () => mockSocket }));
jest.mock("next/navigation", () => ({
  usePathname: () => "/projects/project-a/docs",
}));
jest.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ isPending: false, data: { user: { id: "user-a" } } }),
  },
}));
jest.mock("@/components/organizations/organization-provider", () => ({
  useOrganization: () => ({
    organizations: [],
    selectedOrganization: null,
    selectedOrganizationId: null,
    selectOrganization: jest.fn(),
  }),
}));
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <RealtimeProvider>
        <ProjectWorkspace id="project-a">
          <p>Private Docs</p>
        </ProjectWorkspace>
      </RealtimeProvider>
    </QueryClientProvider>,
  );
  return { client, ...view };
}
beforeEach(() => {
  mockHandlers.clear();
  jest.spyOn(api, "getProject").mockResolvedValue(projectFixture);
  jest
    .spyOn(api, "getProjectMembers")
    .mockResolvedValue(projectFixture.projectMembers);
  jest.spyOn(api, "getProjectColumns").mockResolvedValue([column]);
});
afterEach(() => jest.restoreAllMocks());
test("reconnect refreshes mounted resource scopes without touching unrelated Project/user caches", async () => {
  const view = setup();
  await screen.findByText("Private Docs");
  const ownKeys = [
    queryKeys.task("project-a", "task-a", "user-a"),
    queryKeys.taskComments("task-a"),
    queryKeys.taskAttachments("task-a", "user-a"),
    queryKeys.taskGithubIssue("task-a", "user-a"),
    queryKeys.taskTime("task-a", "user-a"),
    queryKeys.projectAttachments("project-a", "user-a"),
    queryKeys.wikiPages("project-a", "user-a"),
    queryKeys.wikiPage("project-a", "wiki-a", "user-a"),
    queryKeys.githubIssues("project-a", 1, 20, "open", "user-a"),
  ];
  const otherKeys = [
    queryKeys.task("other-project", "task-b", "user-a"),
    queryKeys.task("project-a", "task-a", "other-user"),
    queryKeys.wikiPage("other-project", "wiki-b", "user-a"),
    queryKeys.wikiPage("project-a", "wiki-c", "other-user"),
  ];
  for (const key of [...ownKeys, ...otherKeys])
    view.client.setQueryData(key, { fixture: true });
  await act(async () => mockHandlers.get("connect")?.());
  for (const key of ownKeys)
    expect(view.client.getQueryState(key)?.isInvalidated).toBe(true);
  for (const key of otherKeys)
    expect(view.client.getQueryState(key)?.isInvalidated).toBe(false);
});

test("Task events reconcile only the matching detail, and deletion cancels an in-flight fetch", async () => {
  const view = setup();
  await screen.findByText("Private Docs");
  const key = queryKeys.task("project-a", "task-a", "user-a");
  const other = queryKeys.task("project-a", "task-b", "user-a");
  view.client.setQueryData(key, { title: "Old" });
  view.client.setQueryData(other, { title: "Other" });
  await act(async () =>
    mockHandlers.get("project:event")?.({
      entity: "task",
      type: "TASK_UPDATED",
      projectId: "project-a",
      taskId: "task-a",
    }),
  );
  expect(view.client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(view.client.getQueryState(other)?.isInvalidated).toBe(false);
  let resolve!: (value: unknown) => void;
  const pending = view.client
    .fetchQuery({
      queryKey: key,
      queryFn: () =>
        new Promise((done) => {
          resolve = done;
        }),
    })
    .catch(() => undefined);
  await act(async () =>
    mockHandlers.get("project:event")?.({
      entity: "task",
      type: "TASK_DELETED",
      projectId: "project-a",
      taskId: "task-a",
    }),
  );
  expect(view.client.getQueryData(key)).toBeNull();
  await act(async () => {
    resolve({ title: "Do not resurrect" });
    await pending;
  });
  expect(view.client.getQueryData(key)).toBeNull();
});
test("repository changes invalidate known same-user links only in the affected Project", async () => {
  const view = setup();
  await screen.findByText("Private Docs");
  const own = queryKeys.taskGithubIssue("task-a", "user-a");
  const otherUser = queryKeys.taskGithubIssue("task-a", "other-user");
  const otherProject = queryKeys.taskGithubIssue("task-b", "user-a");
  view.client.setQueryData(own, { projectId: "project-a" });
  view.client.setQueryData(otherUser, { projectId: "project-a" });
  view.client.setQueryData(otherProject, { projectId: "project-b" });
  await act(async () =>
    mockHandlers.get("project:event")?.({
      entity: "repository",
      type: "GITHUB_REPOSITORY_DISCONNECTED",
      projectId: "project-a",
    }),
  );
  expect(view.client.getQueryState(own)?.isInvalidated).toBe(true);
  expect(view.client.getQueryState(otherUser)?.isInvalidated).toBe(false);
  expect(view.client.getQueryState(otherProject)?.isInvalidated).toBe(false);
});

test("member events reconcile shared permissions and final access revocation hides resources", async () => {
  const view = setup();
  await screen.findByText("Private Docs");
  expect(screen.getByRole("link", { name: "Project settings" })).toBeTruthy();
  jest.mocked(api.getProjectMembers).mockResolvedValue([]);
  await act(async () =>
    mockHandlers.get("project:event")?.({
      entity: "project-member",
      projectId: "project-a",
      type: "PROJECT_MEMBER_REMOVED",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("link", { name: "Project settings" })).toBeNull(),
  );
  jest
    .mocked(api.getProject)
    .mockRejectedValue(
      new ApiError(404, "Project not found", { message: "Project not found" }),
    );
  await act(async () =>
    mockHandlers.get("project:access-revoked")?.({ projectId: "project-a" }),
  );
  await waitFor(() => expect(screen.queryByText("Private Docs")).toBeNull());
  expect(mockSocket.emit).toHaveBeenCalledWith("project:unsubscribe", {
    projectId: "project-a",
  });
  view.unmount();
  expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
  expect(mockHandlers.has("project:event")).toBe(false);
});
test("unsubscribed Project events never refetch the active Project", async () => {
  setup();
  await screen.findByText("Private Docs");
  jest.mocked(api.getProject).mockClear();
  await act(async () =>
    mockHandlers.get("project:event")?.({
      entity: "project",
      projectId: "other-project",
      type: "PROJECT_UPDATED",
    }),
  );
  expect(api.getProject).not.toHaveBeenCalled();
});
