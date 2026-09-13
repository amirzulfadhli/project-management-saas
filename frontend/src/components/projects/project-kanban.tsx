"use client";

import { useMemo, useRef, useState } from "react";
import {
  type Announcements,
  closestCorners,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { Column, MoveTaskInput, Task } from "@/lib/types";
import { TaskCard } from "@/components/tasks/task-card";
import { Icon } from "@/components/ui/icon";

interface ProjectKanbanProps {
  projectId: string;
  columns: Column[];
  tasks: Task[];
  onOpenTask: (task: Task) => void;
  onCreateTask: (columnId: string) => void;
  onManageColumn?: (columnId: string) => void;
}

interface MoveVariables extends MoveTaskInput {
  taskId: string;
  sourceColumnId: string;
}

interface MoveContext {
  previousTasks?: Task[];
}

export function ProjectKanban({
  projectId,
  columns,
  tasks,
  onOpenTask,
  onCreateTask,
  onManageColumn,
}: ProjectKanbanProps) {
  const queryClient = useQueryClient();
  const tasksKey = queryKeys.tasks(projectId);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const focusTaskAfterMoveRef = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const tasksByColumn = useMemo(
    () => groupTasks(columns, tasks),
    [columns, tasks],
  );
  const activeTask = activeTaskId
    ? tasks.find((task) => task.id === activeTaskId)
    : undefined;
  const announcements = useMemo<Announcements>(() => {
    const taskName = (id: string | number) =>
      tasks.find((task) => task.id === String(id))?.title ?? "Task";
    const destination = (
      over: Parameters<Announcements["onDragOver"]>[0]["over"],
    ) => {
      const columnId = over?.data.current?.columnId;
      const column = columns.find((item) => item.id === columnId);
      if (!column) return null;
      const target = tasks.find((task) => task.id === String(over?.id));
      return target ? `${column.name}, at ${target.title}` : column.name;
    };
    return {
      onDragStart: ({ active }) => `Picked up ${taskName(active.id)}.`,
      onDragOver: ({ active, over }) => {
        const target = destination(over);
        return target
          ? `${taskName(active.id)} over ${target}.`
          : `${taskName(active.id)} is outside a valid drop area.`;
      },
      onDragEnd: ({ active, over }) => {
        const target = destination(over);
        return target
          ? `Dropped ${taskName(active.id)} in ${target}.`
          : `No move made for ${taskName(active.id)}.`;
      },
      onDragCancel: ({ active }) =>
        `Movement cancelled for ${taskName(active.id)}.`,
    };
  }, [columns, tasks]);

  const moveTask = useMutation({
    mutationFn: ({ taskId, columnId, targetIndex }: MoveVariables) =>
      api.moveTask(taskId, { columnId, targetIndex }),
    onMutate: async (variables): Promise<MoveContext> => {
      setMoveError(null);
      await queryClient.cancelQueries({ queryKey: tasksKey, exact: true });
      const previousTasks = queryClient.getQueryData<Task[]>(tasksKey);
      if (previousTasks) {
        queryClient.setQueryData<Task[]>(
          tasksKey,
          optimisticallyMove(previousTasks, columns, variables),
        );
      }
      return { previousTasks };
    },
    onError: (error: unknown, _variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(tasksKey, context.previousTasks);
      }
      setMoveError(moveErrorMessage(error));
    },
    onSuccess: (movedTask) => {
      queryClient.setQueryData<Task[]>(tasksKey, (current) =>
        (current ?? []).map((task) =>
          task.id === movedTask.id ? movedTask : task,
        ),
      );
    },
    onSettled: async (_data, error, variables) => {
      await queryClient.invalidateQueries({ queryKey: tasksKey, exact: true });
      if (
        error instanceof ApiError &&
        (error.status === 404 || error.status === 409)
      ) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.projectColumns(projectId),
          exact: true,
        });
      }
      if (variables?.sourceColumnId !== variables?.columnId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.projectActivities(projectId),
          exact: true,
        });
      }
      const taskId = focusTaskAfterMoveRef.current;
      focusTaskAfterMoveRef.current = null;
      if (taskId) {
        requestAnimationFrame(() => {
          document.getElementById(`task-drag-handle-${taskId}`)?.focus();
        });
      }
    },
  });

  const handleDragStart = ({ active }: DragStartEvent) => {
    setMoveError(null);
    setActiveTaskId(String(active.id));
  };

  const handleDragEnd = ({ active, over, activatorEvent }: DragEndEvent) => {
    setActiveTaskId(null);
    if (!over || moveTask.isPending) return;

    const dragged = tasks.find((task) => task.id === String(active.id));
    if (!dragged) return;
    const overData = over.data.current as
      { type?: "task" | "column"; columnId?: string } | undefined;
    const targetColumnId = overData?.columnId;
    if (
      !targetColumnId ||
      !columns.some((column) => column.id === targetColumnId)
    ) {
      return;
    }

    const targetTasks = tasksByColumn.get(targetColumnId) ?? [];
    let targetIndex = targetTasks.length;
    if (overData.type === "task") {
      const overIndex = targetTasks.findIndex(
        (task) => task.id === String(over.id),
      );
      if (overIndex < 0) return;
      if (activatorEvent instanceof KeyboardEvent) {
        targetIndex = overIndex;
      } else {
        const translated = active.rect.current.translated;
        const belowMidpoint =
          translated !== null &&
          translated.top > over.rect.top + over.rect.height / 2;
        targetIndex = overIndex + (belowMidpoint ? 1 : 0);
        const sourceTasks = tasksByColumn.get(dragged.columnId) ?? [];
        const sourceIndex = sourceTasks.findIndex(
          (task) => task.id === dragged.id,
        );
        if (dragged.columnId === targetColumnId && sourceIndex < targetIndex) {
          targetIndex -= 1;
        }
      }
    }

    if (
      dragged.columnId === targetColumnId &&
      dragged.position === targetIndex
    ) {
      return;
    }
    if (activatorEvent instanceof KeyboardEvent) {
      focusTaskAfterMoveRef.current = dragged.id;
    }
    moveTask.mutate({
      taskId: dragged.id,
      sourceColumnId: dragged.columnId,
      columnId: targetColumnId,
      targetIndex,
    });
  };

  return (
    <div className="space-y-2">
      {moveError ? (
        <p
          className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {moveError}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {moveTask.isPending
          ? "Saving Task position"
          : moveError
            ? moveError
            : ""}
      </p>
      <DndContext
        accessibility={{ announcements }}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveTaskId(null)}
        onDragEnd={handleDragEnd}
      >
        <div
          className="flex-1 overflow-x-auto"
          role="region"
          aria-label="Task Board"
          tabIndex={0}
        >
          <div className="flex min-h-full items-start gap-3 pb-2">
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                tasks={tasksByColumn.get(column.id) ?? []}
                disabled={moveTask.isPending}
                onOpenTask={onOpenTask}
                onCreateTask={onCreateTask}
                onManageColumn={onManageColumn}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="w-72 rotate-1 opacity-95 shadow-lg">
              <TaskCard task={activeTask} onClick={() => undefined} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function KanbanColumn({
  column,
  tasks,
  disabled,
  onOpenTask,
  onCreateTask,
  onManageColumn,
}: {
  column: Column;
  tasks: Task[];
  disabled: boolean;
  onOpenTask: (task: Task) => void;
  onCreateTask: (columnId: string) => void;
  onManageColumn?: (columnId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column.id}`,
    data: { type: "column", columnId: column.id },
    disabled,
  });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.name}, ${tasks.length} Tasks`}
      className={`flex w-72 shrink-0 flex-col rounded-lg border bg-background p-2 transition-colors ${
        isOver ? "border-primary/60 bg-primary/5" : "border-border"
      }`}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="min-w-0 break-words text-sm font-semibold text-text-primary">
          {column.name}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-xs text-text-secondary">{tasks.length}</span>
          {onManageColumn && (
            <button
              type="button"
              className="icon-control text-text-secondary hover:bg-hover"
              aria-label={`Manage ${column.name} Column`}
              onClick={() => onManageColumn(column.id)}
            >
              <Icon name="more" className="size-4 shrink-0" />
            </button>
          )}
        </div>
      </div>
      <SortableContext
        items={tasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex min-h-12 flex-1 flex-col gap-2">
          {tasks.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-text-secondary">
              No Tasks. Add one below or drop a Task here
            </p>
          ) : (
            tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                disabled={disabled}
                onOpen={() => onOpenTask(task)}
              />
            ))
          )}
        </div>
      </SortableContext>
      <button
        type="button"
        onClick={() => onCreateTask(column.id)}
        className="mt-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-text-secondary hover:bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        + Add Task
      </button>
    </section>
  );
}

function SortableTaskCard({
  task,
  disabled,
  onOpen,
}: {
  task: Task;
  disabled: boolean;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", columnId: task.columnId },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-30" : undefined}
    >
      <TaskCard
        task={task}
        onClick={onOpen}
        dragHandle={
          <button
            type="button"
            {...attributes}
            {...listeners}
            id={`task-drag-handle-${task.id}`}
            disabled={disabled}
            aria-label={`Move ${task.title}`}
            title="Drag to move. Keyboard: Space to pick up, arrows to move, Space or Enter to drop, Escape to cancel."
            className="flex min-h-[40px] min-w-[40px] cursor-grab touch-none items-center justify-center rounded p-2 text-text-secondary opacity-70 transition-opacity hover:bg-hover hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing group-hover:opacity-100 disabled:cursor-wait"
          >
            <Icon name="grip" className="size-4 shrink-0" />
          </button>
        }
      />
    </div>
  );
}

function groupTasks(columns: Column[], tasks: Task[]): Map<string, Task[]> {
  const map = new Map(columns.map((column) => [column.id, [] as Task[]]));
  for (const task of tasks) {
    const bucket = map.get(task.columnId);
    if (bucket) bucket.push(task);
  }
  for (const bucket of map.values()) {
    bucket.sort((left, right) =>
      left.position === right.position
        ? left.id.localeCompare(right.id)
        : left.position - right.position,
    );
  }
  return map;
}

function optimisticallyMove(
  tasks: Task[],
  columns: Column[],
  move: MoveVariables,
): Task[] {
  const task = tasks.find((candidate) => candidate.id === move.taskId);
  const targetColumn = columns.find((column) => column.id === move.columnId);
  if (!task || !targetColumn) return tasks;

  const grouped = groupTasks(columns, tasks);
  const source = [...(grouped.get(task.columnId) ?? [])].filter(
    (candidate) => candidate.id !== task.id,
  );
  const target =
    task.columnId === move.columnId
      ? source
      : [...(grouped.get(move.columnId) ?? [])];
  target.splice(move.targetIndex, 0, task);

  const placement = new Map<string, { column: Column; position: number }>();
  source.forEach((candidate, position) =>
    placement.set(candidate.id, {
      column:
        columns.find((column) => column.id === task.columnId) ?? targetColumn,
      position,
    }),
  );
  target.forEach((candidate, position) =>
    placement.set(candidate.id, { column: targetColumn, position }),
  );

  return tasks.map((candidate) => {
    const next = placement.get(candidate.id);
    return next
      ? {
          ...candidate,
          columnId: next.column.id,
          position: next.position,
          column: {
            id: next.column.id,
            name: next.column.name,
            position: next.column.position,
          },
        }
      : candidate;
  });
}

function moveErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Task movement failed. Try again.";
  if (error.status === 400) return "That drop position is no longer valid.";
  if (error.status === 403)
    return "You no longer have permission to move this Task.";
  if (error.status === 404)
    return "The Task or destination Column is no longer available.";
  if (error.status === 409)
    return "The board changed at the same time. The latest order has been restored.";
  return error.message || "Task movement failed. Try again.";
}
