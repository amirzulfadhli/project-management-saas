import type {
  ActivityPage,
  Column,
  CommentItem,
  CommentPage,
  CreateCommentInput,
  CreateOrganizationInput,
  CreateProjectColumnInput,
  CreateProjectInput,
  CreateTaskInput,
  AddProjectMemberInput,
  Organization,
  ProjectDetail,
  ProjectMember,
  ProjectSummary,
  Task,
  TaskFilters,
  UpdateProjectMemberRoleInput,
  UpdateProjectColumnInput,
  UpdateProjectInput,
  UpdateTaskInput,
  UpdateCommentInput,
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
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
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
};

export { API_URL };
