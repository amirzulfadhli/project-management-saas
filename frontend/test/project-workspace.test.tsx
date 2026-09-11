import { useEffect, type ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ProjectWorkspace,
  useProjectWorkspace,
} from "@/components/projects/project-workspace";
import { ProjectSettings } from "@/components/projects/project-settings";
import { ProjectBoard } from "@/components/projects/project-board";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import {
  column,
  member,
  organization,
  projectFixture,
} from "./project-fixtures";
import type { ProjectMember, Task } from "@/lib/types";

let mockPathname = "/projects/project-a";
let mockSearch = "";
let mockOrganization: typeof organization | null = organization;
let mockProject = projectFixture;
let mockMembers: ProjectMember[] = projectFixture.projectMembers;
const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockSelect = jest.fn();
const mockSubscribe = jest.fn();
const mockUnsubscribe = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearch),
  useRouter: () => mockRouter,
}));
jest.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "user-a" } } }) },
}));
jest.mock("@/components/organizations/organization-provider", () => ({
  useOrganization: () => ({
    organizations: mockOrganization ? [mockOrganization] : [],
    selectedOrganization: mockOrganization,
    selectedOrganizationId: mockOrganization?.id ?? null,
    selectOrganization: mockSelect,
  }),
}));
jest.mock("@/lib/realtime", () => ({
  useProjectRealtime: (id: string | null, enabled: boolean) => {
    useEffect(() => {
      if (!id || !enabled) return;
      mockSubscribe(id);
      return () => mockUnsubscribe(id);
    }, [id, enabled]);
    return "connected";
  },
}));
jest.mock("@/components/tasks/task-modal", () => ({
  TaskModal: ({
    task,
    onClose,
  }: {
    task: Task | null;
    onClose: () => void;
  }) => (
    <div role="dialog">
      {task?.title ?? "New Task"}
      <button onClick={onClose}>Close Task</button>
    </div>
  ),
}));
jest.mock("@/components/projects/project-kanban", () => ({
  ProjectKanban: ({
    tasks,
    onOpenTask,
    onCreateTask,
  }: {
    tasks: Task[];
    onOpenTask: (task: Task) => void;
    onCreateTask: (id: string) => void;
  }) => (
    <div>
      Board content
      {tasks.map((task) => (
        <button key={task.id} onClick={() => onOpenTask(task)}>
          {task.title}
        </button>
      ))}
      <button onClick={() => onCreateTask("column-a")}>Create Task</button>
    </div>
  ),
}));
function Probe() {
  const context = useProjectWorkspace();
  return (
    <p>
      {context.project.id}:{" "}
      {context.canAdministerProject ? "administrator" : "collaborator"}
    </p>
  );
}
function setup(children: ReactNode = <Probe />) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const tree = (child: ReactNode) => (
    <QueryClientProvider client={client}>
      <ProjectWorkspace id="project-a">{child}</ProjectWorkspace>
    </QueryClientProvider>
  );
  return { client, tree, ...render(tree(children)) };
}
beforeEach(() => {
  mockPathname = "/projects/project-a";
  mockSearch = "";
  mockOrganization = organization;
  mockProject = projectFixture;
  mockMembers = projectFixture.projectMembers;
  jest.spyOn(api, "getProject").mockImplementation(async () => mockProject);
  jest.spyOn(api, "getProjectColumns").mockResolvedValue([column]);
  jest
    .spyOn(api, "getProjectMembers")
    .mockImplementation(async () => mockMembers);
  jest.spyOn(api, "getTasks").mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

test("persistent section navigation uses real URLs and does not load Board Tasks on resource pages", async () => {
  mockPathname = "/projects/project-a/docs";
  setup();
  await screen.findByText("project-a: administrator");
  const nav = within(
    screen.getByRole("navigation", { name: "Project sections" }),
  );
  for (const [name, slug] of [
    ["Board", ""],
    ["Docs", "/docs"],
    ["Files", "/files"],
    ["Activity", "/activity"],
    ["Time", "/time"],
    ["GitHub", "/github"],
  ]) {
    expect(nav.getByRole("link", { name }).getAttribute("href")).toBe(
      "/projects/project-a" + slug,
    );
  }
  expect(
    nav.getByRole("link", { name: "Docs" }).getAttribute("aria-current"),
  ).toBe("page");
  expect(api.getTasks).not.toHaveBeenCalled();
});
test("one subscription survives section navigation and is released on workspace unmount", async () => {
  const view = setup();
  await screen.findByText("project-a: administrator");
  mockPathname = "/projects/project-a/time";
  view.rerender(
    view.tree(
      <>
        <Probe />
        <p>Time section</p>
      </>,
    ),
  );
  expect(mockSubscribe).toHaveBeenCalledTimes(1);
  expect(mockUnsubscribe).not.toHaveBeenCalled();
  view.unmount();
  expect(mockUnsubscribe).toHaveBeenCalledWith("project-a");
});
test.each([
  "member",
  "explicit-owner",
  "organization-owner",
  "unrelated-owner",
])("administration respects %s authority", async (role) => {
  mockMembers = [
    { ...member, role: role === "explicit-owner" ? "OWNER" : "MEMBER" },
  ] as ProjectMember[];
  if (role === "explicit-owner") mockOrganization = null;
  else if (role === "unrelated-owner")
    mockOrganization = { ...organization, id: "other-org" };
  else
    mockOrganization = {
      ...organization,
      members: role === "organization-owner" ? [member] : [],
    };
  mockProject = { ...projectFixture, projectMembers: mockMembers };
  setup();
  const owner = role === "explicit-owner" || role === "organization-owner";
  await screen.findByText(
    "project-a: " + (owner ? "administrator" : "collaborator"),
  );
  expect(
    Boolean(screen.queryByRole("link", { name: "Project settings" })),
  ).toBe(owner);
  expect(mockSelect).not.toHaveBeenCalled();
});
test("membership refetch removes administration controls without leaving Project context", async () => {
  mockOrganization = null;
  const view = setup();
  await screen.findByText("project-a: administrator");
  mockMembers = [{ ...member, role: "MEMBER" }] as ProjectMember[];
  await act(() =>
    view.client.invalidateQueries({
      queryKey: queryKeys.projectMembers("project-a"),
    }),
  );
  await screen.findByText("project-a: collaborator");
  expect(screen.queryByRole("link", { name: "Project settings" })).toBeNull();
});
test("denied Project refetch unmounts protected section and unsubscribes despite cached data", async () => {
  const view = setup(<p>Private resource</p>);
  await screen.findByText("Private resource");
  jest
    .mocked(api.getProject)
    .mockRejectedValue(
      new ApiError(404, "Project not found", { message: "Project not found" }),
    );
  await act(() =>
    view.client.invalidateQueries({ queryKey: queryKeys.project("project-a") }),
  );
  await screen.findByText("Project not found");
  expect(screen.queryByText("Private resource")).toBeNull();
  expect(mockUnsubscribe).toHaveBeenCalledWith("project-a");
});
test("settings remains read-only for collaborators even on direct route", async () => {
  mockOrganization = null;
  mockMembers = [{ ...member, role: "MEMBER" }] as ProjectMember[];
  mockProject = { ...projectFixture, projectMembers: mockMembers };
  setup(<ProjectSettings />);
  await screen.findByText(/Only Project or Organization owners/);
  expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
});
test("restore uses existing API and invalidates both active/archived list scopes", async () => {
  mockProject = { ...projectFixture, archivedAt: "2026-09-01T00:00:00Z" };
  jest.spyOn(api, "restoreProject").mockResolvedValue(projectFixture);
  const view = setup(<ProjectSettings />);
  const invalidate = jest.spyOn(view.client, "invalidateQueries");
  fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
  await waitFor(() =>
    expect(api.restoreProject).toHaveBeenCalledWith("project-a"),
  );
  await screen.findByRole("button", { name: "Archive" });
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: queryKeys.organizationProjects("org-a"),
  });
});
test("archive retains confirmation and opens the intentional archived list", async () => {
  jest.spyOn(window, "confirm").mockReturnValue(true);
  jest.spyOn(api, "archiveProject").mockResolvedValue(undefined);
  setup(<ProjectSettings />);
  fireEvent.click(await screen.findByRole("button", { name: "Archive" }));
  await waitFor(() =>
    expect(mockRouter.push).toHaveBeenCalledWith("/projects?view=archived"),
  );
});
test("duplicate retains the API and adds only the server-returned Project to its own scope", async () => {
  const copy = { ...projectFixture, id: "copy", name: "FlowPlan (Copy)" };
  jest.spyOn(api, "duplicateProject").mockResolvedValue(copy);
  const view = setup(<ProjectSettings />);
  fireEvent.click(await screen.findByRole("button", { name: "Duplicate" }));
  await waitFor(() =>
    expect(view.client.getQueryData(queryKeys.project("copy"))).toEqual(copy),
  );
  expect(api.duplicateProject).toHaveBeenCalledWith("project-a");
});
test("legacy Task deep-link and remote deletion handling survive Board extraction", async () => {
  mockSearch = "task=task-a";
  jest
    .mocked(api.getTasks)
    .mockResolvedValue([{ id: "task-a", title: "Linked Task" }] as Task[]);
  const view = setup(<ProjectBoard />);
  await screen.findByRole("dialog");
  await act(async () =>
    view.client.setQueryData(queryKeys.tasks("project-a"), []),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("This task is no longer available.")).toBeTruthy();
});
test("collaborators retain Task creation but not structural Column controls", async () => {
  mockOrganization = null;
  mockMembers = [{ ...member, role: "MEMBER" }] as ProjectMember[];
  mockProject = { ...projectFixture, projectMembers: mockMembers };
  setup(<ProjectBoard />);
  fireEvent.click(await screen.findByRole("button", { name: "Create Task" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Manage Columns" })).toBeNull();
});
