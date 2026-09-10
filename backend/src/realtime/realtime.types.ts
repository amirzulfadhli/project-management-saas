export const RealtimeEventType = {
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  PROJECT_ARCHIVED: 'PROJECT_ARCHIVED',
  PROJECT_RESTORED: 'PROJECT_RESTORED',
  PROJECT_MEMBER_ADDED: 'PROJECT_MEMBER_ADDED',
  PROJECT_MEMBER_ROLE_CHANGED: 'PROJECT_MEMBER_ROLE_CHANGED',
  PROJECT_MEMBER_REMOVED: 'PROJECT_MEMBER_REMOVED',
  COLUMN_CREATED: 'COLUMN_CREATED',
  COLUMN_RENAMED: 'COLUMN_RENAMED',
  COLUMN_DELETED: 'COLUMN_DELETED',
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_MOVED: 'TASK_MOVED',
  TASK_DELETED: 'TASK_DELETED',
  COMMENT_CREATED: 'COMMENT_CREATED',
  COMMENT_UPDATED: 'COMMENT_UPDATED',
  COMMENT_DELETED: 'COMMENT_DELETED',
  REPOSITORY_CONNECTED: 'REPOSITORY_CONNECTED',
  REPOSITORY_DISCONNECTED: 'REPOSITORY_DISCONNECTED',
  GITHUB_ISSUE_LINKED: 'GITHUB_ISSUE_LINKED',
  GITHUB_ISSUE_UNLINKED: 'GITHUB_ISSUE_UNLINKED',
  GITHUB_ISSUE_SYNCED: 'GITHUB_ISSUE_SYNCED',
  TASK_CREATED_FROM_GITHUB_ISSUE: 'TASK_CREATED_FROM_GITHUB_ISSUE',
  ATTACHMENT_CREATED: 'ATTACHMENT_CREATED',
  ATTACHMENT_DELETED: 'ATTACHMENT_DELETED',
  WIKI_PAGE_CREATED: 'WIKI_PAGE_CREATED',
  WIKI_PAGE_UPDATED: 'WIKI_PAGE_UPDATED',
  WIKI_PAGE_DELETED: 'WIKI_PAGE_DELETED',
  WIKI_PAGE_MOVED: 'WIKI_PAGE_MOVED',
  TIME_ENTRY_CREATED: 'TIME_ENTRY_CREATED',
  TIMER_STARTED: 'TIMER_STARTED',
  TIMER_STOPPED: 'TIMER_STOPPED',
} as const;

export type RealtimeEventType =
  (typeof RealtimeEventType)[keyof typeof RealtimeEventType];

export type RealtimeEntity =
  | 'project'
  | 'project-member'
  | 'column'
  | 'task'
  | 'comment'
  | 'repository'
  | 'github-issue'
  | 'attachment'
  | 'wiki-page'
  | 'time-entry';

export interface RealtimeEventInput {
  projectId: string;
  type: RealtimeEventType;
  entity: RealtimeEntity;
  entityId: string;
  actorId: string | null;
  taskId?: string;
}

export interface RealtimeEventEnvelope extends RealtimeEventInput {
  id: string;
  occurredAt: string;
}

export interface ProjectSubscriptionResponse {
  ok: boolean;
  projectId?: string;
  error?:
    'INVALID_PROJECT' | 'FORBIDDEN' | 'UNAUTHENTICATED' | 'SUBSCRIPTION_LIMIT';
}

export interface NotificationRealtimeInput {
  notificationId: string;
}

export interface NotificationRealtimeEnvelope extends NotificationRealtimeInput {
  id: string;
  type: 'NOTIFICATION_CREATED';
  occurredAt: string;
}
