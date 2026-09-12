/** One canonical identity for all Task entry points; legacy query links are still accepted. */
export function taskHref(projectId: string, taskId: string) {
  return `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`;
}
