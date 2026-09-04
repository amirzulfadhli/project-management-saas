"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/components/organizations/organization-provider";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queries";

/**
 * Aggregates Tasks for the selected Organization without using the backend's
 * unscoped Task list. Every request and cache entry remains Project-specific.
 */
export function useOrganizationTasks() {
  const { selectedOrganizationId } = useOrganization();

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects(selectedOrganizationId ?? "none"),
    queryFn: () => api.getProjects(selectedOrganizationId!),
    enabled: Boolean(selectedOrganizationId),
  });

  const taskQueries = useQueries({
    queries: (projectsQuery.data ?? []).map((project) => ({
      queryKey: queryKeys.tasks(project.id),
      queryFn: () => api.getTasks(project.id),
      enabled: Boolean(selectedOrganizationId),
    })),
  });

  const tasks = taskQueries
    .flatMap((query) => query.data ?? [])
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const taskError = taskQueries.find((query) => query.error)?.error ?? null;
  const error = projectsQuery.error ?? taskError;

  const refetch = async () => {
    await projectsQuery.refetch();
    await Promise.all(taskQueries.map((query) => query.refetch()));
  };

  return {
    projects: projectsQuery.data ?? [],
    tasks,
    isPending:
      projectsQuery.isPending || taskQueries.some((query) => query.isPending),
    isError: Boolean(error),
    error,
    refetch,
  };
}
