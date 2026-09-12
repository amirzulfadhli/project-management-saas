import { TaskRoute } from "@/components/tasks/task-route";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;
  return <TaskRoute projectId={id} taskId={taskId} />;
}
