import type { ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TaskRoute } from "@/components/tasks/task-route";
import { TaskDraftProvider } from "@/components/tasks/task-drafts";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { column, projectFixture, user, taskFixture } from "./project-fixtures";
import { taskHref } from "@/lib/task-links";

let mockPath = "/projects/project-a/tasks/task-a";
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => mockRouter,
}));
jest.mock("@/components/projects/project-workspace", () => ({
  ProjectWorkspace: ({ children }: { children: ReactNode }) => children,
  useProjectWorkspace: () => ({
    project: projectFixture,
    columns: [column, { ...column, id: "column-b", name: "Done" }],
    eligibleAssignees: [user],
    currentUserId: user.id,
    canAdministerProject: false,
  }),
}));
jest.mock("@/components/attachments/attachments-panel", () => ({
  AttachmentsPanel: () => <p>Task attachments</p>,
}));
jest.mock("@/components/github/task-github-panel", () => ({
  TaskGithubPanel: () => <p>Issue context</p>,
}));

function setup(taskId = "task-a", sheet = false) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const tree = (child: ReactNode, account = "user-a") => (
    <QueryClientProvider client={client}>
      <TaskDraftProvider key={account}>{child}</TaskDraftProvider>
    </QueryClientProvider>
  );
  return {
    client,
    tree,
    ...render(
      tree(<TaskRoute projectId="project-a" taskId={taskId} sheet={sheet} />),
    ),
  };
}
beforeEach(() => {
  mockPath = taskHref("project-a", "task-a");
  jest.spyOn(api, "getTask").mockResolvedValue(taskFixture);
  jest
    .spyOn(api, "getTaskComments")
    .mockResolvedValue({ items: [], nextCursor: null });
  jest.spyOn(api, "getTaskTime").mockResolvedValue({
    taskId: "task-a",
    totalSeconds: 60,
    items: [],
    nextCursor: null,
  });
  jest.spyOn(api, "getActiveTimer").mockResolvedValue({ activeTimer: null });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test("direct Task reads before editing and exposes conversation/timer with lazy files", async () => {
  setup();
  await screen.findByRole("heading", { name: taskFixture.title });
  expect(screen.queryByLabelText("Title")).toBeNull();
  expect(
    await screen.findByRole("button", { name: "Start timer" }),
  ).toBeTruthy();
  expect(
    await screen.findByRole("heading", { name: "Conversation" }),
  ).toBeTruthy();
  expect(screen.queryByText("Task attachments")).toBeNull();
  expect(api.getTask).toHaveBeenCalledWith("task-a");
  fireEvent.click(screen.getByRole("button", { name: "Back to work" }));
  expect(mockRouter.push).toHaveBeenCalledWith("/projects/project-a");
});
test("sheet closes through history and cannot linger on an unrelated route", async () => {
  const view = setup("task-a", true);
  await screen.findByRole("heading", { name: taskFixture.title });
  fireEvent.click(screen.getByRole("button", { name: "Close Task details" }));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  mockPath = "/projects/project-a/files";
  view.rerender(
    view.tree(<TaskRoute projectId="project-a" taskId="task-a" sheet />),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});
test.each([403, 404])(
  "Task %s hides even a previously cached Task",
  async (status) => {
    const view = setup();
    await screen.findByText(taskFixture.description!);
    jest
      .mocked(api.getTask)
      .mockRejectedValue(new ApiError(status, "Private error", {}));
    await act(() =>
      view.client.invalidateQueries({
        queryKey: queryKeys.task("project-a", "task-a", user.id),
      }),
    );
    await screen.findByText("This task is no longer available.");
    expect(screen.queryByText(taskFixture.description!)).toBeNull();
    expect(screen.queryByText("Private error")).toBeNull();
  },
);
test("cross-Project substitution never renders returned Task", async () => {
  jest
    .mocked(api.getTask)
    .mockResolvedValue({ ...taskFixture, projectId: "project-b" });
  setup();
  await screen.findByText("This task is no longer available.");
  expect(api.getTaskComments).not.toHaveBeenCalled();
});
test("transient failure offers retry instead of stale protected content", async () => {
  jest.mocked(api.getTask).mockRejectedValueOnce(new Error("Offline"));
  setup();
  fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
  await screen.findByRole("heading", { name: taskFixture.title });
});
test("dirty metadata survives navigation, rejects discard, then cancels explicitly", async () => {
  jest.spyOn(window, "confirm").mockReturnValue(false);
  const view = setup();
  fireEvent.click(await screen.findByRole("button", { name: "Edit Task" }));
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "My draft" },
  });
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
    "My draft",
  );
  view.rerender(view.tree(<p>Another route</p>));
  view.rerender(view.tree(<TaskRoute projectId="project-a" taskId="task-a" />));
  expect(
    ((await screen.findByLabelText("Title")) as HTMLInputElement).value,
  ).toBe("My draft");
  jest.mocked(window.confirm).mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByLabelText("Title")).toBeNull();
});
test("account remount drops Task drafts", async () => {
  const view = setup();
  fireEvent.click(await screen.findByRole("button", { name: "Edit Task" }));
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Private draft" },
  });
  view.rerender(
    view.tree(<TaskRoute projectId="project-a" taskId="task-a" />, "user-b"),
  );
  await screen.findByRole("button", { name: "Edit Task" });
  expect(screen.queryByDisplayValue("Private draft")).toBeNull();
});
test("remote refresh keeps dirty fields and save does not undo a remote Column move", async () => {
  const updated = { ...taskFixture, title: "My draft", columnId: "column-b" };
  jest.spyOn(api, "updateTask").mockResolvedValue(updated);
  const view = setup();
  fireEvent.click(await screen.findByRole("button", { name: "Edit Task" }));
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "My draft" },
  });
  await act(async () =>
    view.client.setQueryData(queryKeys.task("project-a", "task-a", user.id), {
      ...taskFixture,
      title: "Remote",
      columnId: "column-b",
      updatedAt: "2026-09-02T00:00:00Z",
    }),
  );
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
    "My draft",
  );
  expect(await screen.findByText(/This Task changed while/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(api.updateTask).toHaveBeenCalledWith("task-a", {
      title: "My draft",
    }),
  );
  await screen.findByRole("button", { name: "Edit Task" });
  view.rerender(view.tree(<p>Away</p>));
  view.rerender(view.tree(<TaskRoute projectId="project-a" taskId="task-a" />));
  expect(screen.queryByLabelText("Title")).toBeNull();
});
test("failed save retains draft and its error", async () => {
  jest
    .spyOn(api, "updateTask")
    .mockRejectedValue(new ApiError(409, "Try again", {}));
  setup();
  fireEvent.click(await screen.findByRole("button", { name: "Edit Task" }));
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Keep me" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Try again");
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
    "Keep me",
  );
});
test("deleted Task tombstone immediately removes editing and resource controls", async () => {
  const view = setup();
  fireEvent.click(await screen.findByRole("button", { name: "Edit Task" }));
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "Do not resurrect" },
  });
  await act(async () =>
    view.client.setQueryData(
      queryKeys.task("project-a", "task-a", user.id),
      null,
    ),
  );
  await screen.findByText("This task is no longer available.");
  expect(screen.queryByLabelText("Title")).toBeNull();
  expect(screen.queryByRole("button", { name: "Start timer" })).toBeNull();
});
test("Task identity change cannot reuse previous Task form fields", async () => {
  const view = setup();
  fireEvent.click(await screen.findByRole("button", { name: "Edit Task" }));
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: "A draft" },
  });
  jest
    .mocked(api.getTask)
    .mockResolvedValue({ ...taskFixture, id: "task-b", title: "Task B" });
  view.rerender(view.tree(<TaskRoute projectId="project-a" taskId="task-b" />));
  await screen.findByRole("heading", { name: "Task B" });
  expect(screen.queryByDisplayValue("A draft")).toBeNull();
});

test("Comment draft survives route navigation and successful posting clears it", async () => {
  jest.spyOn(api, "createTaskComment").mockResolvedValue({
    id: "comment-a",
    taskId: "task-a",
    parentId: null,
    content: "Discussion draft",
    author: user,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    deletedAt: null,
  });
  const view = setup();
  fireEvent.change(await screen.findByLabelText("Add Comment"), {
    target: { value: "Discussion draft" },
  });
  view.rerender(view.tree(<p>Away</p>));
  view.rerender(view.tree(<TaskRoute projectId="project-a" taskId="task-a" />));
  expect(
    ((await screen.findByLabelText("Add Comment")) as HTMLTextAreaElement)
      .value,
  ).toBe("Discussion draft");
  fireEvent.click(screen.getByRole("button", { name: "Post Comment" }));
  await waitFor(() =>
    expect(api.createTaskComment).toHaveBeenCalledWith("task-a", {
      content: "Discussion draft",
    }),
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Add Comment") as HTMLTextAreaElement).value,
    ).toBe(""),
  );
});

test("timer failures remain visible outside the collapsed manual-time disclosure", async () => {
  jest
    .spyOn(api, "startTaskTimer")
    .mockRejectedValue(new ApiError(409, "Timer conflict", {}));
  setup();
  const start = await screen.findByRole("button", { name: "Start timer" });
  await waitFor(() =>
    expect((start as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(start);
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Timer conflict");
  expect(alert.closest("details")).toBeNull();
  expect(
    screen.getByText("Manual time and your history").closest("details")?.open,
  ).toBe(false);
});

test("timer Start/Stop use existing own-Task contracts and manual drafts survive navigation", async () => {
  const timer = {
    id: "time-a",
    taskId: "task-a",
    projectId: "project-a",
    userId: user.id,
    startedAt: "2026-09-01T00:00:00Z",
    endedAt: null,
    durationSeconds: null,
    note: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    task: { id: "task-a", title: taskFixture.title, projectId: "project-a" },
  };
  jest.spyOn(api, "startTaskTimer").mockImplementation(async () => {
    jest.mocked(api.getActiveTimer).mockResolvedValue({ activeTimer: timer });
    return timer;
  });
  jest.spyOn(api, "stopTaskTimer").mockImplementation(async () => {
    jest.mocked(api.getActiveTimer).mockResolvedValue({ activeTimer: null });
    return { ...timer, endedAt: "2026-09-01T01:00:00Z", durationSeconds: 3600 };
  });
  const view = setup();
  const startButton = await screen.findByRole("button", {
    name: "Start timer",
  });
  await waitFor(() =>
    expect((startButton as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(startButton);
  fireEvent.click(await screen.findByRole("button", { name: "Stop timer" }));
  await screen.findByRole("button", { name: "Start timer" });
  expect(api.startTaskTimer).toHaveBeenCalledWith("task-a");
  expect(api.stopTaskTimer).toHaveBeenCalledWith("task-a");
  fireEvent.click(screen.getByText("Manual time and your history"));
  fireEvent.change(screen.getByLabelText("Note (optional)"), {
    target: { value: "Manual draft" },
  });
  view.rerender(view.tree(<p>Away</p>));
  view.rerender(view.tree(<TaskRoute projectId="project-a" taskId="task-a" />));
  await screen.findByRole("heading", { name: taskFixture.title });
  expect(
    (screen.getByLabelText("Note (optional)") as HTMLInputElement).value,
  ).toBe("Manual draft");
});
