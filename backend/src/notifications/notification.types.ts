export const NotificationType = {
  TASK_ASSIGNED_TO_YOU: 'TASK_ASSIGNED_TO_YOU',
  TASK_UNASSIGNED_FROM_YOU: 'TASK_UNASSIGNED_FROM_YOU',
  COMMENT_REPLY_TO_YOU: 'COMMENT_REPLY_TO_YOU',
  COMMENT_ON_YOUR_TASK: 'COMMENT_ON_YOUR_TASK',
  PROJECT_MEMBER_ADDED_YOU: 'PROJECT_MEMBER_ADDED_YOU',
  PROJECT_MEMBER_ROLE_CHANGED_YOU: 'PROJECT_MEMBER_ROLE_CHANGED_YOU',
} as const;

export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export type NotificationEntityType = 'task' | 'comment' | 'project-member';

export interface NotificationDelivery {
  notificationId: string;
  userId: string;
}
