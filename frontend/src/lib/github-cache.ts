import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queries";
import type { TaskGithubIssue } from "./types";

/** Repository replacement/disconnect invalidates only this user's known links in this Project. */
export async function invalidateGithubResources(
  client: QueryClient,
  projectId: string,
  userId: string | null,
) {
  await Promise.all([
    client.invalidateQueries({
      queryKey: queryKeys.githubIssueLists(projectId, userId),
    }),
    client.invalidateQueries({
      predicate: (query) => {
        const identity = query.queryKey[1] as
          { userId?: string | null } | undefined;
        const link = query.state.data as TaskGithubIssue | null | undefined;
        return (
          query.queryKey[0] === "task-github-issue" &&
          identity?.userId === userId &&
          link?.projectId === projectId
        );
      },
    }),
  ]);
}
