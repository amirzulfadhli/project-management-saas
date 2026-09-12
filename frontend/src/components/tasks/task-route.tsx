"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { taskHref } from "@/lib/task-links";
import {
  ProjectWorkspace,
  useProjectWorkspace,
} from "@/components/projects/project-workspace";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { TaskDetail } from "./task-detail";
import { taskDraftKey, useTaskDrafts, useTaskFieldDrafts } from "./task-drafts";

export function TaskRoute({
  projectId,
  taskId,
  sheet = false,
}: {
  projectId: string;
  taskId: string;
  sheet?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const close = () =>
    sheet ? router.back() : router.push(`/projects/${projectId}`);
  // Parallel slots retain their old tree during soft navigation. Never expose a
  // previous Task after the URL moves away (including sign-out/account changes).
  if (sheet && pathname !== taskHref(projectId, taskId)) return null;
  const content = (
    <TaskResource
      key={`${projectId}:${taskId}`}
      taskId={taskId}
      onClose={close}
    />
  );
  return sheet ? (
    <Modal open title="Task details" placement="task" onClose={close}>
      <ProjectWorkspace key={projectId} id={projectId} compact>
        {content}
      </ProjectWorkspace>
    </Modal>
  ) : (
    content
  );
}

function TaskResource({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const { project, currentUserId } = useProjectWorkspace();
  const drafts = useTaskDrafts();
  const fields = useTaskFieldDrafts();
  const task = useQuery({
    queryKey: queryKeys.task(project.id, taskId, currentUserId),
    queryFn: async () => {
      const result = await api.getTask(taskId);
      return result.projectId === project.id ? result : null;
    },
    retry: false,
  });
  const unavailable =
    (task.isSuccess && !task.data) ||
    (task.error instanceof ApiError && [403, 404].includes(task.error.status));
  useEffect(() => {
    if (unavailable) {
      const key = taskDraftKey(project.id, taskId);
      drafts.delete(key);
      for (const field of fields.keys())
        if (field.startsWith(key + ":")) fields.delete(field);
    }
  }, [unavailable, drafts, fields, project.id, taskId]);
  if (task.isPending) return <p role="status">Loading Task…</p>;
  if (unavailable || task.isError)
    return (
      <div className="space-y-3">
        <p role="status">
          {unavailable
            ? "This task is no longer available."
            : "Could not refresh this Task. Please try again."}
        </p>
        {!unavailable && <Button onClick={() => task.refetch()}>Retry</Button>}
        <Button variant="secondary" onClick={onClose}>
          Back to work
        </Button>
      </div>
    );
  return task.data ? <TaskDetail task={task.data} onClose={onClose} /> : null;
}
