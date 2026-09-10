import type {
  ActivityPage,
  AddOrganizationMemberInput,
  Column,
  CommentItem,
  CommentPage,
  CreateCommentInput,
  CreateOrganizationInput,
  CreateProjectColumnInput,
  CreateProjectInput,
  CreateTaskInput,
  AddProjectMemberInput,
  ConnectGithubRepositoryInput,
  GithubInstallation,
  GithubInstallUrlResponse,
  GithubRepositoryPage,
  Organization,
  OrganizationMember,
  ProjectDetail,
  ProjectMember,
  ProjectRepository,
  ProjectSummary,
  Task,
  TaskFilters,
  UpdateProjectMemberRoleInput,
  UpdateProjectColumnInput,
  UpdateProjectInput,
  UpdateTaskInput,
  MoveTaskInput,
  UpdateCommentInput,
  NotificationPage,
  NotificationUnreadCount,
  UpdateOrganizationMemberRoleInput,
  AttachmentItem,
  AttachmentPage,
  ActiveTimerResponse,
  CreateManualTimeEntryInput,
  ProjectTimeSummary,
  TaskTimePage,
  WikiPage,
  WikiPageSummary,
  CreateWikiPageInput,
  UpdateWikiPageInput,
  MoveWikiPageInput,
  GithubIssuePage,
  TaskGithubIssue,
  CreateTaskFromGithubIssueResult,
} from "./types";

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
if (process.env.NODE_ENV === "production" && !configuredApiUrl) {
  throw new Error("NEXT_PUBLIC_API_URL is required for production builds");
}

const API_URL = configuredApiUrl ?? "http://localhost:3001";
try {
  const parsedApiUrl = new URL(API_URL);
  if (!["http:", "https:"].includes(parsedApiUrl.protocol)) {
    throw new Error();
  }
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(
    parsedApiUrl.hostname,
  );
  if (
    process.env.NODE_ENV === "production" &&
    parsedApiUrl.protocol !== "https:" &&
    !isLocalHost
  ) {
    throw new Error();
  }
} catch {
  throw new Error(
    "NEXT_PUBLIC_API_URL must be an absolute HTTPS URL (local HTTP is allowed only for explicit localhost builds)",
  );
}

/** Normalized NestJS error payload. */
interface ApiErrorPayload {
  message?: string | string[];
  error?: string;
  statusCode?: number;
  errors?: Record<string, string[]>;
}

/** Error thrown for any non-2xx response, carrying the backend's detail. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: ApiErrorPayload;

  constructor(status: number, message: string, detail: ApiErrorPayload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function errorMessage(payload: ApiErrorPayload): string {
  if (Array.isArray(payload.message)) return payload.message.join(", ");
  if (typeof payload.message === "string" && payload.message) {
    return payload.message;
  }
  // ZodValidationPipe returns { message: 'Validation failed', errors: {...} }.
  if (payload.errors) {
    const first = Object.values(payload.errors).find((v) => v.length > 0);
    if (first) return first[0];
  }
  return "Request failed";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body && !isFormData
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const detail =
      body && typeof body === "object"
        ? (body as ApiErrorPayload)
        : { message: text || undefined };
    throw new ApiError(res.status, errorMessage(detail), detail);
  }

  return body as T;
}

async function requestBlob(path: string): Promise<Blob> {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include" });
  if (!response.ok) {
    let detail: ApiErrorPayload = {};
    try {
      detail = (await response.json()) as ApiErrorPayload;
    } catch {
      detail = { message: "Download failed" };
    }
    throw new ApiError(response.status, errorMessage(detail), detail);
  }
  return response.blob();
}

function withQuery(path: string, params?: object): string {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export const api = {
  // Organizations
  getOrganizations: () => request<Organization[]>("/api/organizations"),
  getOrganization: (id: string) =>
    request<Organization>("/api/organizations/" + encodeURIComponent(id)),
  createOrganization: (input: CreateOrganizationInput) =>
    request<Organization>("/api/organizations", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getOrganizationMembers: (organizationId: string) =>
    request<OrganizationMember[]>(
      `/api/organizations/${encodeURIComponent(organizationId)}/members`,
    ),
  addOrganizationMember: (
    organizationId: string,
    input: AddOrganizationMemberInput,
  ) =>
    request<OrganizationMember>(
      `/api/organizations/${encodeURIComponent(organizationId)}/members`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  updateOrganizationMemberRole: (
    organizationId: string,
    memberId: string,
    input: UpdateOrganizationMemberRoleInput,
  ) =>
    request<OrganizationMember>(
      `/api/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(memberId)}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
  removeOrganizationMember: (organizationId: string, memberId: string) =>
    request<void>(
      `/api/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(memberId)}`,
      { method: "DELETE" },
    ),

  // Projects
  getProjects: (organizationId: string) =>
    request<ProjectSummary[]>(withQuery("/api/projects", { organizationId })),
  createProject: (input: CreateProjectInput) =>
    request<ProjectDetail>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getProject: (id: string) => request<ProjectDetail>(`/api/projects/${id}`),
  updateProject: (id: string, input: UpdateProjectInput) =>
    request<ProjectDetail>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  archiveProject: (id: string) =>
    request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  duplicateProject: (id: string) =>
    request<ProjectDetail>(`/api/projects/${id}/duplicate`, {
      method: "POST",
    }),

  // Project Columns
  getProjectColumns: (projectId: string) =>
    request<Column[]>(`/api/projects/${encodeURIComponent(projectId)}/columns`),
  createProjectColumn: (projectId: string, input: CreateProjectColumnInput) =>
    request<Column>(`/api/projects/${encodeURIComponent(projectId)}/columns`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateProjectColumn: (
    projectId: string,
    columnId: string,
    input: UpdateProjectColumnInput,
  ) =>
    request<Column>(
      `/api/projects/${encodeURIComponent(projectId)}/columns/${encodeURIComponent(columnId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    ),
  deleteProjectColumn: (projectId: string, columnId: string) =>
    request<void>(
      `/api/projects/${encodeURIComponent(projectId)}/columns/${encodeURIComponent(columnId)}`,
      { method: "DELETE" },
    ),

  // Project membership
  getProjectMembers: (projectId: string) =>
    request<ProjectMember[]>(
      `/api/projects/${encodeURIComponent(projectId)}/members`,
    ),
  addProjectMember: (projectId: string, input: AddProjectMemberInput) =>
    request<ProjectMember>(
      `/api/projects/${encodeURIComponent(projectId)}/members`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    ),
  updateProjectMemberRole: (
    projectId: string,
    memberId: string,
    input: UpdateProjectMemberRoleInput,
  ) =>
    request<ProjectMember>(
      `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(memberId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    ),
  removeProjectMember: (projectId: string, memberId: string) =>
    request<void>(
      `/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(memberId)}`,
      { method: "DELETE" },
    ),

  // Project Activity
  getProjectActivities: (
    projectId: string,
    options: { cursor?: string; limit?: number } = {},
  ) =>
    request<ActivityPage>(
      withQuery(
        `/api/projects/${encodeURIComponent(projectId)}/activities`,
        options,
      ),
    ),

  // GitHub App installations and verified repository connections
  createGithubInstallUrl: () =>
    request<GithubInstallUrlResponse>("/api/github/app/install-url", {
      method: "POST",
    }),
  getGithubInstallations: () =>
    request<GithubInstallation[]>("/api/github/app/installations"),
  getGithubRepositories: (
    installationId: string,
    options: { page?: number; perPage?: number } = {},
  ) =>
    request<GithubRepositoryPage>(
      withQuery(
        `/api/github/app/installations/${encodeURIComponent(installationId)}/repositories`,
        options,
      ),
    ),
  getProjectRepository: (projectId: string) =>
    request<ProjectRepository | null>(
      `/api/projects/${encodeURIComponent(projectId)}/repository`,
    ),
  connectProjectRepository: (
    projectId: string,
    input: ConnectGithubRepositoryInput,
  ) =>
    request<ProjectRepository>(
      `/api/projects/${encodeURIComponent(projectId)}/repository`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  disconnectProjectRepository: (projectId: string) =>
    request<void>(`/api/projects/${encodeURIComponent(projectId)}/repository`, {
      method: "DELETE",
    }),
  getProjectGithubIssues: (
    projectId: string,
    options: {
      page?: number;
      perPage?: number;
      state?: "open" | "closed" | "all";
    } = {},
  ) =>
    request<GithubIssuePage>(
      withQuery(
        `/api/projects/${encodeURIComponent(projectId)}/github/issues`,
        options,
      ),
    ),
  getTaskGithubIssue: (taskId: string) =>
    request<TaskGithubIssue | null>(
      `/api/tasks/${encodeURIComponent(taskId)}/github`,
    ),
  linkTaskGithubIssue: (taskId: string, issueNumber: number) =>
    request<TaskGithubIssue>(
      `/api/tasks/${encodeURIComponent(taskId)}/github/link`,
      { method: "POST", body: JSON.stringify({ issueNumber }) },
    ),
  unlinkTaskGithubIssue: (taskId: string) =>
    request<void>(`/api/tasks/${encodeURIComponent(taskId)}/github/link`, {
      method: "DELETE",
    }),
  createTaskFromGithubIssue: (
    projectId: string,
    issueNumber: number,
    columnId: string,
  ) =>
    request<CreateTaskFromGithubIssueResult>(
      `/api/projects/${encodeURIComponent(projectId)}/github/issues/${issueNumber}/create-task`,
      { method: "POST", body: JSON.stringify({ columnId }) },
    ),

  // Tasks
  getTasks: (projectId: string, filters: TaskFilters = {}) =>
    request<Task[]>(
      withQuery("/api/tasks", {
        projectId,
        ...filters,
      }),
    ),
  createTask: (input: CreateTaskInput) =>
    request<Task>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTask: (id: string, input: UpdateTaskInput) =>
    request<Task>(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  moveTask: (id: string, input: MoveTaskInput) =>
    request<Task>(`/api/tasks/${encodeURIComponent(id)}/move`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteTask: (id: string) =>
    request<void>(`/api/tasks/${id}`, { method: "DELETE" }),

  // Task Comments
  getTaskComments: (
    taskId: string,
    options: { cursor?: string; limit?: number } = {},
  ) =>
    request<CommentPage>(
      withQuery(`/api/tasks/${encodeURIComponent(taskId)}/comments`, options),
    ),
  createTaskComment: (taskId: string, input: CreateCommentInput) =>
    request<CommentItem>(`/api/tasks/${encodeURIComponent(taskId)}/comments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTaskComment: (
    taskId: string,
    commentId: string,
    input: UpdateCommentInput,
  ) =>
    request<CommentItem>(
      `/api/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    ),
  deleteTaskComment: (taskId: string, commentId: string) =>
    request<void>(
      `/api/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`,
      { method: "DELETE" },
    ),

  // Authenticated Project and Task attachments
  getProjectAttachments: (
    projectId: string,
    options: { cursor?: string; limit?: number } = {},
  ) =>
    request<AttachmentPage>(
      withQuery(
        `/api/projects/${encodeURIComponent(projectId)}/attachments`,
        options,
      ),
    ),
  uploadProjectAttachment: (projectId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<AttachmentItem>(
      `/api/projects/${encodeURIComponent(projectId)}/attachments`,
      { method: "POST", body },
    );
  },
  downloadProjectAttachment: (projectId: string, attachmentId: string) =>
    requestBlob(
      `/api/projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
    ),
  deleteProjectAttachment: (projectId: string, attachmentId: string) =>
    request<void>(
      `/api/projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { method: "DELETE" },
    ),
  getTaskAttachments: (
    taskId: string,
    options: { cursor?: string; limit?: number } = {},
  ) =>
    request<AttachmentPage>(
      withQuery(
        `/api/tasks/${encodeURIComponent(taskId)}/attachments`,
        options,
      ),
    ),
  uploadTaskAttachment: (taskId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<AttachmentItem>(
      `/api/tasks/${encodeURIComponent(taskId)}/attachments`,
      { method: "POST", body },
    );
  },
  downloadTaskAttachment: (taskId: string, attachmentId: string) =>
    requestBlob(
      `/api/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
    ),
  deleteTaskAttachment: (taskId: string, attachmentId: string) =>
    request<void>(
      `/api/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { method: "DELETE" },
    ),

  // Project documentation
  getWikiPages: (projectId: string) =>
    request<WikiPageSummary[]>(
      `/api/projects/${encodeURIComponent(projectId)}/wiki`,
    ),
  getWikiPage: (projectId: string, pageId: string) =>
    request<WikiPage>(
      `/api/projects/${encodeURIComponent(projectId)}/wiki/${encodeURIComponent(pageId)}`,
    ),
  createWikiPage: (projectId: string, input: CreateWikiPageInput) =>
    request<WikiPage>(`/api/projects/${encodeURIComponent(projectId)}/wiki`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateWikiPage: (
    projectId: string,
    pageId: string,
    input: UpdateWikiPageInput,
  ) =>
    request<WikiPage>(
      `/api/projects/${encodeURIComponent(projectId)}/wiki/${encodeURIComponent(pageId)}`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
  moveWikiPage: (projectId: string, pageId: string, input: MoveWikiPageInput) =>
    request<WikiPage>(
      `/api/projects/${encodeURIComponent(projectId)}/wiki/${encodeURIComponent(pageId)}/move`,
      { method: "PATCH", body: JSON.stringify(input) },
    ),
  deleteWikiPage: (projectId: string, pageId: string) =>
    request<void>(
      `/api/projects/${encodeURIComponent(projectId)}/wiki/${encodeURIComponent(pageId)}`,
      { method: "DELETE" },
    ),

  // Task timers, private entry history and Project aggregates
  getTaskTime: (
    taskId: string,
    options: { cursor?: string; limit?: number } = {},
  ) =>
    request<TaskTimePage>(
      withQuery(`/api/tasks/${encodeURIComponent(taskId)}/time`, options),
    ),
  startTaskTimer: (taskId: string, note?: string | null) =>
    request<ActiveTimerResponse["activeTimer"]>(
      `/api/tasks/${encodeURIComponent(taskId)}/time/start`,
      { method: "POST", body: JSON.stringify({ note: note ?? null }) },
    ),
  stopTaskTimer: (taskId: string) =>
    request<NonNullable<ActiveTimerResponse["activeTimer"]>>(
      `/api/tasks/${encodeURIComponent(taskId)}/time/stop`,
      { method: "POST", body: JSON.stringify({}) },
    ),
  createManualTimeEntry: (taskId: string, input: CreateManualTimeEntryInput) =>
    request<NonNullable<ActiveTimerResponse["activeTimer"]>>(
      `/api/tasks/${encodeURIComponent(taskId)}/time`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  getProjectTime: (projectId: string) =>
    request<ProjectTimeSummary>(
      `/api/projects/${encodeURIComponent(projectId)}/time`,
    ),
  getActiveTimer: () => request<ActiveTimerResponse>("/api/time/active"),

  // Current user's private notifications
  getNotifications: (options: { cursor?: string; limit?: number } = {}) =>
    request<NotificationPage>(withQuery("/api/notifications", options)),
  getNotificationUnreadCount: () =>
    request<NotificationUnreadCount>("/api/notifications/unread-count"),
  markNotificationRead: (notificationId: string) =>
    request<{ id: string; readAt: string }>(
      `/api/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: "PATCH" },
    ),
  markAllNotificationsRead: () =>
    request<{ ok: boolean }>("/api/notifications/read-all", {
      method: "POST",
    }),
};

export { API_URL };
