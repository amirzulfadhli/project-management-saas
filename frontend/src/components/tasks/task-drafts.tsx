"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Task } from "@/lib/types";

export type TaskFields = {
  title: string;
  description: string;
  columnId: string;
  assigneeId: string;
  priority: number;
  dueDate: string;
};
export type TaskDraft = {
  fields: TaskFields;
  baseline: TaskFields;
  updatedAt?: string;
};
export function taskFields(task: Task): TaskFields {
  return {
    title: task.title,
    description: task.description ?? "",
    columnId: task.columnId,
    assigneeId: task.assigneeId ?? "",
    priority: task.priority,
    dueDate: task.dueDate?.slice(0, 10) ?? "",
  };
}
export function taskDraftKey(projectId: string, taskId: string) {
  return `${projectId}:${taskId}`;
}
const Context = createContext<Map<string, TaskDraft> | null>(null);
const FieldsContext = createContext<Map<string, string | null> | null>(null);
export function TaskDraftProvider({ children }: { children: ReactNode }) {
  const [drafts] = useState(() => new Map<string, TaskDraft>());
  const [fields] = useState(() => new Map<string, string | null>());
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!drafts.size && !fields.size) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts, fields]);
  return (
    <Context.Provider value={drafts}>
      <FieldsContext.Provider value={fields}>{children}</FieldsContext.Provider>
    </Context.Provider>
  );
}

export function useTaskFieldDrafts() {
  const fields = useContext(FieldsContext);
  if (!fields) throw new Error("TaskDraftProvider is missing");
  return fields;
}

/** Plain form drafts only. No files, credentials, query snapshots or browser storage. */
export function useTaskField<T extends string | null>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const fields = useTaskFieldDrafts();
  const [value, setValue] = useState<T>(() =>
    fields.has(key) ? (fields.get(key) as T) : initial,
  );
  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      const previous = fields.has(key) ? (fields.get(key) as T) : initial;
      const next = typeof action === "function" ? action(previous) : action;
      if (next === initial) fields.delete(key);
      else fields.set(key, next);
      setValue(next);
    },
    [fields, key, initial],
  );
  return [value, update];
}
export function useTaskDrafts() {
  const drafts = useContext(Context);
  if (!drafts) throw new Error("TaskDraftProvider is missing");
  return drafts;
}
