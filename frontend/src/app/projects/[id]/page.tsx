import { ProjectBoard } from "@/components/projects/project-board";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectBoard key={id} id={id} />;
}
