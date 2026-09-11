import { ProjectWorkspace } from "@/components/projects/project-workspace";
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ProjectWorkspace key={id} id={id}>
      {children}
    </ProjectWorkspace>
  );
}
