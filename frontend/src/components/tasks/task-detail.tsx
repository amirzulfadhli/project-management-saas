"use client";

import { useState } from "react";
import Link from "next/link";
import type { Task } from "@/lib/types";
import { formatDate, priorityLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useProjectWorkspace } from "@/components/projects/project-workspace";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { TaskTimePanel } from "@/components/time-tracking/task-time-panel";
import { TaskGithubPanel } from "@/components/github/task-github-panel";
import { TaskComments } from "./task-comments";
import { TaskModal } from "./task-modal";
import { taskDraftKey, useTaskDrafts } from "./task-drafts";

export function TaskDetail({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  const {
    project,
    columns,
    eligibleAssignees,
    currentUserId,
    canAdministerProject,
  } = useProjectWorkspace();
  const drafts = useTaskDrafts();
  const [editing, setEditing] = useState(() =>
    drafts.has(taskDraftKey(project.id, task.id)),
  );
  const [files, setFiles] = useState(false);
  return (
    <article className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          className="text-sm text-primary hover:underline"
          href={`/projects/${project.id}`}
        >
          {project.name} / Board
        </Link>
        <div className="flex gap-2">
          {!editing && (
            <Button size="sm" onClick={() => setEditing(true)}>
              Edit Task
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            Back to work
          </Button>
        </div>
      </div>
      {editing ? (
        <TaskModal
          embedded
          task={task}
          organizationId={project.organizationId}
          projectId={project.id}
          columns={columns}
          eligibleAssignees={eligibleAssignees}
          currentUserId={currentUserId}
          canModerateComments={canAdministerProject}
          onClose={() => setEditing(false)}
        />
      ) : (
        <>
          <h2 className="break-words text-xl font-semibold">{task.title}</h2>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 border-y border-border py-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-text-secondary">Column</dt>
              <dd className="break-words">
                {columns.find((column) => column.id === task.columnId)?.name ??
                  task.column.name}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">Assignee</dt>
              <dd className="break-words">
                {task.assignee?.name ?? "Unassigned"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">Priority</dt>
              <dd>{priorityLabel(task.priority)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">Due date</dt>
              <dd>{formatDate(task.dueDate) ?? "Not set"}</dd>
            </div>
          </dl>
          <section aria-label="Description">
            <h3 className="mb-2 text-sm font-semibold">Description</h3>
            <p className="whitespace-pre-wrap break-words text-sm">
              {task.description || "No description yet."}
            </p>
          </section>
        </>
      )}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)]">
        <div className="min-w-0 space-y-5">
          <TaskComments
            key={task.id}
            taskId={task.id}
            projectId={project.id}
            currentUserId={currentUserId}
            canModerate={canAdministerProject}
          />
          <details onToggle={(event) => setFiles(event.currentTarget.open)}>
            <summary className="control-target cursor-pointer py-2 text-sm font-semibold">
              Task files
            </summary>
            {files && (
              <AttachmentsPanel
                scope="task"
                resourceId={task.id}
                projectId={project.id}
                currentUserId={currentUserId}
                canAdminister={canAdministerProject}
              />
            )}
          </details>
          <Link
            href={`/projects/${project.id}/activity`}
            className="text-sm text-primary hover:underline"
          >
            View Project activity
          </Link>
        </div>
        <aside className="min-w-0 space-y-5" aria-label="Task context">
          <TaskTimePanel
            key={task.id}
            taskId={task.id}
            projectId={project.id}
            currentUserId={currentUserId}
            compact
          />
          <section aria-label="GitHub Issue">
            <h3 className="mb-2 text-sm font-semibold">GitHub Issue</h3>
            <TaskGithubPanel
              compact
              taskId={task.id}
              projectId={project.id}
              currentUserId={currentUserId}
            />
          </section>
        </aside>
      </div>
    </article>
  );
}
