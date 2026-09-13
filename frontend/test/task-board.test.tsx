import type { ReactNode } from "react";
import type {
  Announcements,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { ProjectKanban } from "@/components/projects/project-kanban";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { Task } from "@/lib/types";
import { column, taskFixture } from "./project-fixtures";

let mockDnd: {
  accessibility: { announcements: Announcements };
  onDragEnd: (e: DragEndEvent) => void;
  onDragStart: (e: DragStartEvent) => void;
  onDragCancel: () => void;
};
jest.mock("@dnd-kit/core", () => ({
  DndContext: (props: typeof mockDnd & { children: ReactNode }) => {
    mockDnd = props;
    return props.children;
  },
  DragOverlay: () => null,
  closestCorners: jest.fn(),
  PointerSensor: jest.fn(),
  KeyboardSensor: jest.fn(),
  useDroppable: () => ({ setNodeRef: jest.fn(), isOver: false }),
  useSensor: jest.fn(),
  useSensors: jest.fn(),
}));
jest.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => children,
  sortableKeyboardCoordinates: jest.fn(),
  verticalListSortingStrategy: jest.fn(),
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));
const columns = [
  column,
  { ...column, id: "column-b", name: "Doing", position: 1 },
];
const tasks = [
  {
    ...taskFixture,
    id: "task-a",
    title: "Alpha",
    columnId: column.id,
    projectId: column.projectId,
    column,
    position: 0,
    priority: 1,
    assignee: null,
    dueDate: null,
  },
  {
    ...taskFixture,
    id: "task-b",
    title: "Beta",
    columnId: column.id,
    projectId: column.projectId,
    column,
    position: 1,
    priority: 2,
    assignee: null,
    dueDate: null,
  },
] as Task[];
const onOpen = jest.fn(),
  onCreate = jest.fn(),
  onManage = jest.fn();
function setup(owner = true) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(queryKeys.tasks("project-a"), tasks);
  function Board() {
    const query = useQuery({
      queryKey: queryKeys.tasks("project-a"),
      queryFn: () => api.getTasks("project-a"),
      staleTime: Infinity,
    });
    return (
      <ProjectKanban
        projectId="project-a"
        columns={columns}
        tasks={query.data ?? []}
        onOpenTask={onOpen}
        onCreateTask={onCreate}
        onManageColumn={owner ? onManage : undefined}
      />
    );
  }
  render(
    <QueryClientProvider client={client}>
      <Board />
    </QueryClientProvider>,
  );
  return client;
}
function drop(columnId: string, keyboard = false, targetTask?: string) {
  return {
    active: { id: "task-a", rect: { current: { translated: { top: 100 } } } },
    over: {
      id: targetTask ?? "column:" + columnId,
      data: { current: { type: targetTask ? "task" : "column", columnId } },
      rect: { top: 0, height: 40 },
    },
    activatorEvent: keyboard
      ? new KeyboardEvent("keydown")
      : new MouseEvent("pointerdown"),
  } as unknown as DragEndEvent;
}
beforeEach(() => jest.spyOn(api, "getTasks").mockResolvedValue(tasks));
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
test("card opening is separate from drag handle, with contextual owner controls and destination creation", () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Move Alpha" }));
  expect(onOpen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Open Task Alpha" }));
  expect(onOpen).toHaveBeenCalledWith(tasks[0]);
  fireEvent.click(screen.getByRole("button", { name: "Manage Doing Column" }));
  expect(onManage).toHaveBeenCalledWith("column-b");
  fireEvent.click(screen.getAllByRole("button", { name: "+ Add Task" })[1]);
  expect(onCreate).toHaveBeenCalledWith("column-b");
  expect(screen.getByRole("region", { name: "Task Board" })).toBeTruthy();
});
test("collaborators can move Tasks but cannot administer structure", () => {
  setup(false);
  expect(
    screen.queryByRole("button", { name: "Manage Doing Column" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Move Alpha" })).toBeTruthy();
});
test.each([false, true])(
  "cross-Column drop preserves the move API (%s keyboard)",
  async (keyboard) => {
    const moved = {
      ...tasks[0],
      columnId: "column-b",
      column: columns[1],
      position: 0,
    };
    jest.spyOn(api, "moveTask").mockResolvedValue(moved);
    jest
      .mocked(api.getTasks)
      .mockResolvedValue([{ ...tasks[1], position: 0 }, moved]);
    const client = setup();
    await act(async () => mockDnd.onDragEnd(drop("column-b", keyboard)));
    await waitFor(() =>
      expect(api.moveTask).toHaveBeenCalledWith("task-a", {
        columnId: "column-b",
        targetIndex: 0,
      }),
    );
    await waitFor(() =>
      expect(client.getQueryData(queryKeys.tasks("project-a"))).toEqual([
        { ...tasks[1], position: 0 },
        moved,
      ]),
    );
  },
);
test("keyboard reorder within a Column retains target-index semantics", async () => {
  jest.spyOn(api, "moveTask").mockResolvedValue({ ...tasks[0], position: 1 });
  setup();
  await act(async () => mockDnd.onDragEnd(drop("column-a", true, "task-b")));
  await waitFor(() =>
    expect(api.moveTask).toHaveBeenCalledWith("task-a", {
      columnId: "column-a",
      targetIndex: 1,
    }),
  );
});
test("failed move rolls back and refetches authoritative state", async () => {
  jest
    .spyOn(api, "moveTask")
    .mockRejectedValue(new ApiError(409, "Conflict", {}));
  const client = setup();
  await act(async () => mockDnd.onDragEnd(drop("column-b")));
  await screen.findByRole("alert");
  await waitFor(() =>
    expect(client.getQueryData(queryKeys.tasks("project-a"))).toEqual(tasks),
  );
  expect(api.getTasks).toHaveBeenCalledTimes(1);
  expect(onOpen).not.toHaveBeenCalled();
});
test("cancel and invalid destination never mutate ordering", async () => {
  jest.spyOn(api, "moveTask");
  setup();
  await act(async () => {
    mockDnd.onDragStart({ active: { id: "task-a" } } as DragStartEvent);
  });
  await act(async () => mockDnd.onDragCancel());
  await act(async () => mockDnd.onDragEnd(drop("other-project-column")));
  expect(api.moveTask).not.toHaveBeenCalled();
});

test("drag announcements identify Tasks and Columns, never internal IDs", () => {
  setup();
  const announcements = mockDnd.accessibility.announcements;
  const event = drop("column-b");
  expect(announcements.onDragStart(event)).toBe("Picked up Alpha.");
  expect(announcements.onDragOver(event)).toBe("Alpha over Doing.");
  expect(announcements.onDragEnd(event)).toBe("Dropped Alpha in Doing.");
  expect(announcements.onDragCancel(event)).toBe(
    "Movement cancelled for Alpha.",
  );
  expect(announcements.onDragOver(drop(column.id, true, "task-b"))).toBe(
    `Alpha over ${column.name}, at Beta.`,
  );
  expect(announcements.onDragEnd({ ...event, over: null })).toBe(
    "No move made for Alpha.",
  );
  expect(announcements.onDragOver(drop("unknown-column"))).toBe(
    "Alpha is outside a valid drop area.",
  );
});
