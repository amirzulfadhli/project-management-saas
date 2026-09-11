"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type {
  Column,
  GithubInstallation,
  GithubRepository,
  ProjectRepository,
} from "@/lib/types";
import { ProjectGithubIssues } from "@/components/github/project-github-issues";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const repositoryPageSize = 20;

interface ProjectGithubPanelProps {
  projectId: string;
  canAdminister: boolean;
  columns: Column[];
  currentUserId: string | null;
}

function changedInstallation(
  installations: GithubInstallation[],
  baseline: Map<string, string>,
): GithubInstallation | undefined {
  return installations.find(
    (installation) => baseline.get(installation.id) !== installation.updatedAt,
  );
}

function githubErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 401) {
    return "Your session has expired. Sign in again and retry.";
  }
  if (error.status === 403) {
    return "You do not have permission to administer this GitHub connection.";
  }
  if (error.status === 404) {
    return "The Project, installation, or repository is no longer available. Reinstall or re-authorize the GitHub App, then retry.";
  }
  if (error.status === 409) {
    return "This Project or GitHub repository already has a conflicting connection.";
  }
  if (error.status === 429) {
    return "GitHub's API rate limit was reached. Wait a moment and retry.";
  }
  if (error.status >= 500) {
    return "GitHub is unavailable, rejected the installation, or the integration is not configured. Retry, then reinstall the App if needed.";
  }
  return error.message || fallback;
}

export function ProjectGithubPanel({
  projectId,
  canAdminister,
  columns,
  currentUserId,
}: ProjectGithubPanelProps) {
  const queryClient = useQueryClient();
  const popupRef = useRef<Window | null>(null);
  const installationBaselineRef = useRef(new Map<string, string>());
  const [selectedInstallationId, setSelectedInstallationId] = useState("");
  const [repositoryPage, setRepositoryPage] = useState(1);
  const [installFlowPending, setInstallFlowPending] = useState(false);
  const [installFlowExpiresAt, setInstallFlowExpiresAt] = useState<number>();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const projectRepositoryKey = queryKeys.projectRepository(projectId);
  const projectRepositoryQuery = useQuery({
    queryKey: projectRepositoryKey,
    queryFn: () => api.getProjectRepository(projectId),
    enabled: Boolean(projectId),
  });
  const isDisconnected =
    projectRepositoryQuery.isSuccess && !projectRepositoryQuery.data;

  const installationsQuery = useQuery({
    queryKey: queryKeys.githubInstallations,
    queryFn: api.getGithubInstallations,
    enabled: canAdminister && isDisconnected,
    refetchInterval: installFlowPending ? 2_000 : false,
  });
  const installations = installationsQuery.data ?? [];
  const activeInstallationId = installations.some(
    (installation) => installation.id === selectedInstallationId,
  )
    ? selectedInstallationId
    : (installations[0]?.id ?? "");

  const finishInstallation = useCallback((installation: GithubInstallation) => {
    popupRef.current?.close();
    popupRef.current = null;
    setInstallFlowPending(false);
    setInstallFlowExpiresAt(undefined);
    setSelectedInstallationId(installation.id);
    setRepositoryPage(1);
    setMutationError(null);
    setNotice(`GitHub account @${installation.accountLogin} is ready.`);
  }, []);

  useEffect(() => {
    if (!installFlowPending || !installationsQuery.data) return;
    const changed = changedInstallation(
      installationsQuery.data,
      installationBaselineRef.current,
    );
    if (changed) finishInstallation(changed);
  }, [finishInstallation, installFlowPending, installationsQuery.data]);

  const refetchInstallations = installationsQuery.refetch;
  useEffect(() => {
    if (!installFlowPending) return;
    const interval = window.setInterval(() => {
      const expired =
        installFlowExpiresAt !== undefined &&
        Date.now() >= installFlowExpiresAt;
      if (!popupRef.current?.closed && !expired) return;

      window.clearInterval(interval);
      void refetchInstallations().then(({ data }) => {
        const changed = data
          ? changedInstallation(data, installationBaselineRef.current)
          : undefined;
        if (changed) {
          finishInstallation(changed);
          return;
        }
        popupRef.current?.close();
        popupRef.current = null;
        setInstallFlowPending(false);
        setInstallFlowExpiresAt(undefined);
        setMutationError(
          expired
            ? "The GitHub installation window expired. Start again."
            : "GitHub installation was not completed. You can safely retry.",
        );
      });
    }, 750);
    return () => window.clearInterval(interval);
  }, [
    finishInstallation,
    installFlowExpiresAt,
    installFlowPending,
    refetchInstallations,
  ]);

  useEffect(
    () => () => {
      popupRef.current?.close();
    },
    [],
  );

  const repositoriesKey = queryKeys.githubRepositories(
    activeInstallationId || "none",
    repositoryPage,
    repositoryPageSize,
  );
  const repositoriesQuery = useQuery({
    queryKey: repositoriesKey,
    queryFn: () =>
      api.getGithubRepositories(activeInstallationId, {
        page: repositoryPage,
        perPage: repositoryPageSize,
      }),
    enabled: canAdminister && isDisconnected && Boolean(activeInstallationId),
  });

  const installGithubApp = useMutation({
    mutationFn: api.createGithubInstallUrl,
  });

  const connectRepository = useMutation({
    mutationFn: (repository: GithubRepository) =>
      api.connectProjectRepository(projectId, {
        installationId: activeInstallationId,
        externalRepositoryId: repository.externalRepositoryId,
      }),
    onSuccess: async (repository) => {
      queryClient.setQueryData<ProjectRepository | null>(
        projectRepositoryKey,
        repository,
      );
      setMutationError(null);
      setNotice(`${repository.fullName} is connected.`);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.projectActivities(projectId),
        exact: true,
      });
    },
    onError: (error: unknown) => {
      setNotice(null);
      setMutationError(
        githubErrorMessage(error, "Could not connect this repository."),
      );
    },
  });

  const disconnectRepository = useMutation({
    mutationFn: () => api.disconnectProjectRepository(projectId),
    onSuccess: async () => {
      queryClient.setQueryData<ProjectRepository | null>(
        projectRepositoryKey,
        null,
      );
      setMutationError(null);
      setNotice("The GitHub repository was disconnected from this Project.");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.projectActivities(projectId),
        exact: true,
      });
    },
    onError: (error: unknown) => {
      setNotice(null);
      setMutationError(
        githubErrorMessage(error, "Could not disconnect this repository."),
      );
    },
  });

  const startInstallation = async () => {
    const popup = window.open(
      "about:blank",
      "flowplan-github-installation",
      "popup,width=760,height=780",
    );
    if (!popup) {
      setMutationError(
        "Allow popups for FlowPlan, then retry the GitHub installation.",
      );
      return;
    }

    popupRef.current = popup;
    installationBaselineRef.current = new Map(
      installations.map((installation) => [
        installation.id,
        installation.updatedAt,
      ]),
    );
    setMutationError(null);
    setNotice(null);

    try {
      const result = await installGithubApp.mutateAsync();
      popup.location.replace(result.url);
      setInstallFlowExpiresAt(new Date(result.expiresAt).getTime());
      setInstallFlowPending(true);
    } catch (error: unknown) {
      popup.close();
      popupRef.current = null;
      setMutationError(
        githubErrorMessage(error, "Could not start GitHub installation."),
      );
    }
  };

  const confirmDisconnect = () => {
    const repository = projectRepositoryQuery.data;
    if (!repository) return;
    const confirmed = window.confirm(
      `Disconnect ${repository.fullName} from this Project? FlowPlan data and the GitHub repository will not be deleted. Existing Activity and delivery history remain.`,
    );
    if (!confirmed) return;
    setMutationError(null);
    setNotice(null);
    disconnectRepository.mutate();
  };

  const mutationPending =
    installGithubApp.isPending ||
    installFlowPending ||
    connectRepository.isPending ||
    disconnectRepository.isPending;

  return (
    <section aria-label="GitHub integration">
      <div className="min-w-0 space-y-5">
        {projectRepositoryQuery.isPending ? (
          <LoadingMessage>Loading GitHub connection...</LoadingMessage>
        ) : projectRepositoryQuery.isError ? (
          <ErrorState
            message={githubErrorMessage(
              projectRepositoryQuery.error,
              "Could not load this Project's GitHub connection.",
            )}
            onRetry={() => projectRepositoryQuery.refetch()}
          />
        ) : projectRepositoryQuery.data ? (
          <ConnectedRepository
            repository={projectRepositoryQuery.data}
            canAdminister={canAdminister}
            disconnectPending={disconnectRepository.isPending}
            onDisconnect={confirmDisconnect}
            projectId={projectId}
            columns={columns}
            currentUserId={currentUserId}
          />
        ) : !canAdminister ? (
          <EmptyState
            title="No GitHub repository connected"
            description="A Project owner or the Organization owner can connect a verified repository."
          />
        ) : (
          <div className="space-y-5">
            <div className="rounded-md border border-border bg-background p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-medium text-text-primary">
                    Install the FlowPlan GitHub App
                  </h3>
                  <p className="mt-1 max-w-md text-xs leading-5 text-text-secondary">
                    Choose which GitHub repositories FlowPlan may access. Tokens
                    stay on the backend and are never shown here.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={mutationPending || installationsQuery.isPending}
                  onClick={() => void startInstallation()}
                >
                  {installGithubApp.isPending
                    ? "Opening GitHub..."
                    : installFlowPending
                      ? "Waiting for GitHub..."
                      : installations.length > 0
                        ? "Install another account"
                        : "Connect GitHub"}
                </Button>
              </div>
              {installFlowPending ? (
                <p
                  className="mt-3 flex items-center gap-2 text-xs text-text-secondary"
                  role="status"
                >
                  <Spinner /> Complete installation in the GitHub window. This
                  page will update automatically.
                </p>
              ) : null}
            </div>

            {installationsQuery.isPending ? (
              <LoadingMessage>Loading GitHub installations...</LoadingMessage>
            ) : installationsQuery.isError ? (
              <ErrorState
                message={githubErrorMessage(
                  installationsQuery.error,
                  "Could not load GitHub installations.",
                )}
                onRetry={() => installationsQuery.refetch()}
              />
            ) : installations.length === 0 ? (
              <EmptyState
                title="No GitHub installations"
                description="Install the FlowPlan GitHub App to discover repositories you explicitly grant it access to."
              />
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="github-installation"
                    className="text-xs font-medium text-text-primary"
                  >
                    GitHub account
                  </label>
                  <Select
                    id="github-installation"
                    value={activeInstallationId}
                    disabled={mutationPending}
                    onChange={(event) => {
                      setSelectedInstallationId(event.target.value);
                      setRepositoryPage(1);
                      setMutationError(null);
                    }}
                  >
                    {installations.map((installation) => (
                      <option key={installation.id} value={installation.id}>
                        @{installation.accountLogin} ({installation.accountType}
                        )
                      </option>
                    ))}
                  </Select>
                </div>

                <RepositoryDiscovery
                  query={repositoriesQuery}
                  page={repositoryPage}
                  mutationPending={mutationPending}
                  connectingRepositoryId={
                    connectRepository.variables?.externalRepositoryId
                  }
                  onConnect={(repository) => {
                    setMutationError(null);
                    setNotice(null);
                    connectRepository.mutate(repository);
                  }}
                  onPrevious={() => setRepositoryPage((value) => value - 1)}
                  onNext={() => setRepositoryPage((value) => value + 1)}
                />
              </div>
            )}
          </div>
        )}

        {notice ? (
          <p
            className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
            role="status"
          >
            {notice}
          </p>
        ) : null}
        {mutationError ? (
          <p
            className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {mutationError}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ConnectedRepository({
  repository,
  canAdminister,
  disconnectPending,
  onDisconnect,
  projectId,
  columns,
  currentUserId,
}: {
  repository: ProjectRepository;
  canAdminister: boolean;
  disconnectPending: boolean;
  onDisconnect: () => void;
  projectId: string;
  columns: Column[];
  currentUserId: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">Connected</Badge>
              {repository.installationId ? (
                <Badge tone="primary">Verified App</Badge>
              ) : (
                <Badge tone="warning">Legacy connection</Badge>
              )}
            </div>
            <a
              href={repository.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block break-all text-base font-semibold text-text-primary hover:text-primary hover:underline"
            >
              {repository.fullName}
              <span className="sr-only"> (opens GitHub in a new tab)</span>
            </a>
            <p className="mt-1 text-sm text-text-secondary">
              Default branch: {repository.defaultBranch ?? "Unknown"}
            </p>
          </div>
          {canAdminister ? (
            <Button
              variant="danger"
              size="sm"
              disabled={disconnectPending}
              onClick={onDisconnect}
            >
              {disconnectPending ? "Disconnecting..." : "Disconnect"}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs leading-5 text-text-secondary">
        Disconnecting removes only FlowPlan&apos;s Project connection. It does
        not delete GitHub data or historical FlowPlan Activity.
      </p>
      <ProjectGithubIssues
        projectId={projectId}
        columns={columns}
        currentUserId={currentUserId}
      />
    </div>
  );
}

function RepositoryDiscovery({
  query,
  page,
  mutationPending,
  connectingRepositoryId,
  onConnect,
  onPrevious,
  onNext,
}: {
  query: ReturnType<
    typeof useQuery<Awaited<ReturnType<typeof api.getGithubRepositories>>>
  >;
  page: number;
  mutationPending: boolean;
  connectingRepositoryId?: string;
  onConnect: (repository: GithubRepository) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (query.isPending) {
    return <LoadingMessage>Discovering repositories...</LoadingMessage>;
  }
  if (query.isError) {
    return (
      <ErrorState
        message={githubErrorMessage(
          query.error,
          "Could not discover GitHub repositories.",
        )}
        onRetry={() => query.refetch()}
      />
    );
  }
  if (!query.data || query.data.items.length === 0) {
    return (
      <EmptyState
        title={
          page === 1 ? "No repositories available" : "No more repositories"
        }
        description={
          page === 1
            ? "Update the GitHub App installation if it needs access to another repository."
            : "Return to the previous page."
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-text-primary">
          Available repositories
        </h3>
        <span className="text-xs text-text-secondary">
          {query.data.totalCount} total
        </span>
      </div>
      <ul className="divide-y divide-border rounded-md border border-border">
        {query.data.items.map((repository) => (
          <li
            key={repository.externalRepositoryId}
            className="flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <a
                  href={repository.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="max-w-full truncate text-sm font-medium text-text-primary hover:text-primary hover:underline"
                  title={repository.fullName}
                >
                  {repository.fullName}
                  <span className="sr-only"> (opens GitHub in a new tab)</span>
                </a>
                <Badge tone={repository.private ? "neutral" : "primary"}>
                  {repository.private ? "Private" : "Public"}
                </Badge>
                {repository.archived ? (
                  <Badge tone="warning">Archived</Badge>
                ) : null}
              </div>
              <p className="mt-1 truncate text-xs text-text-secondary">
                Default branch: {repository.defaultBranch}
              </p>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              disabled={mutationPending}
              onClick={() => onConnect(repository)}
            >
              {connectingRepositoryId === repository.externalRepositoryId
                ? "Connecting..."
                : "Connect"}
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1 || mutationPending}
          onClick={onPrevious}
        >
          Previous
        </Button>
        <span className="text-xs text-text-secondary">Page {page}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={query.data.nextPage === null || mutationPending}
          onClick={onNext}
        >
          Next
        </Button>
      </div>
      <p className="text-xs leading-5 text-text-secondary">
        Archived repositories are labelled but remain selectable because the
        backend does not currently prohibit read-only or archived connections.
      </p>
    </div>
  );
}

function LoadingMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-center gap-2 py-8 text-sm text-text-secondary"
      role="status"
    >
      <Spinner /> {children}
    </div>
  );
}
