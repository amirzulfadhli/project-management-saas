import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { NotificationItem } from "@/lib/types";

const mockPush = jest.fn();
let mockUserId = "user-a";
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: mockUserId } } }) },
}));
jest.mock("@/lib/api", () => ({
  ApiError: jest.requireActual("@/lib/api").ApiError,
  api: {
    getNotifications: jest.fn(),
    getNotificationUnreadCount: jest.fn(),
    markNotificationRead: jest.fn(),
    markAllNotificationsRead: jest.fn(),
  },
}));

const notification: NotificationItem = {
  id: "notification-a",
  type: "TASK_ASSIGNED_TO_YOU",
  projectId: "project-a",
  readAt: null,
  entityType: "task",
  entityId: "task-a",
  createdAt: "2026-09-11T00:00:00Z",
  actor: { id: "actor", name: "Daniel", email: "daniel@example.test" },
  project: { id: "project-a", name: "FlowPlan" },
  metadata: { taskTitle: "Session recovery" },
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <NotificationBell key={mockUserId} />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

beforeEach(() => {
  mockUserId = "user-a";
  jest.mocked(api.getNotificationUnreadCount).mockResolvedValue({ count: 1 });
  jest
    .mocked(api.getNotifications)
    .mockResolvedValue({ items: [notification], nextCursor: null });
});

test("count loads while the private list remains lazy until opened", async () => {
  const { client } = setup();
  const trigger = await screen.findByRole("button", {
    name: "Notifications, 1 unread",
  });
  expect(api.getNotifications).not.toHaveBeenCalled();
  trigger.focus();
  fireEvent.click(trigger);
  expect(
    await screen.findByText("Daniel assigned you to Session recovery"),
  ).toBeTruthy();
  expect(screen.getByText("Unread", { exact: true })).toBeTruthy();
  expect(client.getQueryData(queryKeys.notifications("user-a"))).toBeTruthy();
  expect(
    client.getQueryData(queryKeys.notifications("user-b")),
  ).toBeUndefined();
  fireEvent.click(screen.getByRole("button", { name: "Close Notifications" }));
  expect(document.activeElement).toBe(trigger);
});

test("read persistence is awaited before exact Task navigation", async () => {
  jest
    .mocked(api.markNotificationRead)
    .mockResolvedValue({ id: notification.id, readAt: "2026-09-11T01:00:00Z" });
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Notifications, 1 unread" }),
  );
  fireEvent.click(
    await screen.findByText("Daniel assigned you to Session recovery"),
  );
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith("/projects/project-a/tasks/task-a"),
  );
  expect(api.markNotificationRead).toHaveBeenCalledWith(
    "notification-a",
    expect.anything(),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("failed mark-read retains the panel and readable error instead of navigating", async () => {
  jest.mocked(api.markNotificationRead).mockRejectedValue(new Error("Network"));
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Notifications, 1 unread" }),
  );
  fireEvent.click(
    await screen.findByText("Daniel assigned you to Session recovery"),
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("dialog", { name: "Notifications" })).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});

test("mark all read refetches list and count from the server", async () => {
  jest.mocked(api.markAllNotificationsRead).mockImplementation(async () => {
    jest.mocked(api.getNotificationUnreadCount).mockResolvedValue({ count: 0 });
    jest.mocked(api.getNotifications).mockResolvedValue({
      items: [{ ...notification, readAt: "2026-09-11T01:00:00Z" }],
      nextCursor: null,
    });
    return { ok: true };
  });
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Notifications, 1 unread" }),
  );
  await screen.findByText("Daniel assigned you to Session recovery");
  fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
  expect(await screen.findByText("0 unread")).toBeTruthy();
  expect(await screen.findByText("Read", { exact: true })).toBeTruthy();
});

test("pagination preserves previously loaded items", async () => {
  jest
    .mocked(api.getNotifications)
    .mockResolvedValueOnce({ items: [notification], nextCursor: "next" })
    .mockResolvedValueOnce({
      items: [
        {
          ...notification,
          id: "notification-b",
          metadata: { taskTitle: "Another task" },
        },
      ],
      nextCursor: null,
    });
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Notifications, 1 unread" }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
  expect(
    await screen.findByText("Daniel assigned you to Another task"),
  ).toBeTruthy();
  expect(
    screen.getByText("Daniel assigned you to Session recovery"),
  ).toBeTruthy();
  expect(api.getNotifications).toHaveBeenLastCalledWith({
    cursor: "next",
    limit: 30,
  });
});

test("account-keyed remount cannot display the previous user's notification panel", async () => {
  const { client, rerender } = setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Notifications, 1 unread" }),
  );
  await screen.findByText("Daniel assigned you to Session recovery");
  mockUserId = "user-b";
  jest.mocked(api.getNotificationUnreadCount).mockResolvedValue({ count: 0 });
  jest
    .mocked(api.getNotifications)
    .mockResolvedValue({ items: [], nextCursor: null });
  rerender(
    <QueryClientProvider client={client}>
      <NotificationBell key={mockUserId} />
    </QueryClientProvider>,
  );
  expect(
    screen.queryByText("Daniel assigned you to Session recovery"),
  ).toBeNull();
  await waitFor(() =>
    expect(
      client.getQueryData(queryKeys.notificationUnreadCount("user-b")),
    ).toEqual({ count: 0 }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
  expect(await screen.findByText("You’re all caught up")).toBeTruthy();
});

test("unread-count failure is not presented as an authoritative zero", async () => {
  jest
    .mocked(api.getNotificationUnreadCount)
    .mockRejectedValue(new Error("Network"));
  setup();
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Notifications, unread count unavailable",
    }),
  );
  expect(screen.getByText("Unread count unavailable")).toBeTruthy();
  expect(screen.queryByText("0 unread")).toBeNull();
});

test("individual read persists without closing or navigating", async () => {
  jest.mocked(api.markNotificationRead).mockImplementation(async () => {
    jest.mocked(api.getNotifications).mockResolvedValue({
      items: [{ ...notification, readAt: "2026-09-12T00:00:00Z" }],
      nextCursor: null,
    });
    jest.mocked(api.getNotificationUnreadCount).mockResolvedValue({ count: 0 });
    return { id: notification.id, readAt: "2026-09-12T00:00:00Z" };
  });
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Notifications, 1 unread" }),
  );
  fireEvent.click(await screen.findByRole("button", { name: /^Mark read:/ }));
  await screen.findByText("Read", { exact: true });
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Close Notifications" }));
  fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
  await screen.findByText("Read", { exact: true });
});

test.each([
  [
    "comment",
    "comment-a",
    { taskId: "task-b", taskTitle: "Discussion" },
    "/projects/project-a/tasks/task-b",
  ],
  ["comment", "comment-a", { taskTitle: "Discussion" }, "/projects/project-a"],
  ["project-member", "member-a", {}, "/projects/project-a"],
] as const)(
  "%s navigation uses only reliable existing identity",
  async (entityType, entityId, metadata, destination) => {
    jest.mocked(api.getNotifications).mockResolvedValue({
      items: [
        {
          ...notification,
          entityType,
          entityId,
          metadata,
          readAt: "2026-09-12T00:00:00Z",
        },
      ],
      nextCursor: null,
    });
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: "Notifications, 1 unread" }),
    );
    fireEvent.click(await screen.findByText(/Daniel assigned/));
    expect(mockPush).toHaveBeenCalledWith(destination);
  },
);

test("next-page failure preserves loaded notifications and permits retry", async () => {
  jest
    .mocked(api.getNotifications)
    .mockResolvedValueOnce({ items: [notification], nextCursor: "next" })
    .mockRejectedValueOnce(new Error("Network"))
    .mockResolvedValue({ items: [], nextCursor: null });
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Notifications, 1 unread" }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
  await screen.findByText("Could not load more notifications.");
  expect(
    screen.getByText("Daniel assigned you to Session recovery"),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull(),
  );
});

test("next-page authorization failure hides previously loaded private notifications", async () => {
  jest
    .mocked(api.getNotifications)
    .mockResolvedValueOnce({ items: [notification], nextCursor: "next" })
    .mockRejectedValueOnce(new ApiError(403, "Access denied", {}));
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Notifications, 1 unread" }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
  await screen.findByText("Access denied");
  expect(
    screen.queryByText("Daniel assigned you to Session recovery"),
  ).toBeNull();
});

test("a read response after account teardown cannot navigate the new session", async () => {
  let resolveRead!: (value: { id: string; readAt: string }) => void;
  jest.mocked(api.markNotificationRead).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
  );
  const { unmount } = setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Notifications, 1 unread" }),
  );
  fireEvent.click(
    await screen.findByText("Daniel assigned you to Session recovery"),
  );
  await waitFor(() => expect(api.markNotificationRead).toHaveBeenCalled());
  unmount();
  await act(async () => {
    resolveRead({ id: notification.id, readAt: "2026-09-12T00:00:00Z" });
  });
  expect(mockPush).not.toHaveBeenCalled();
});
