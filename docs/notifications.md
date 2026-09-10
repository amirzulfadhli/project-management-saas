# Notifications

FlowPlan notifications are a private, persistent inbox for collaboration events
that reasonably require one user's attention. They are deliberately narrower
than Activity: Task reorder, ordinary edits, Column changes, and the actor's own
actions do not generate notifications.

## Policy and recipients

- `TASK_ASSIGNED_TO_YOU`: the new assignee, when another user assigns them.
- `TASK_UNASSIGNED_FROM_YOU`: the previous assignee when another user removes
  or replaces their assignment.
- `COMMENT_REPLY_TO_YOU`: the parent Comment author.
- `COMMENT_ON_YOUR_TASK`: the Task reporter and current assignee.
- `PROJECT_MEMBER_ADDED_YOU`: the affected explicit Project member.
- `PROJECT_MEMBER_ROLE_CHANGED_YOU`: the affected member after a real role
  change; an idempotent same-role request produces nothing.

The actor is always suppressed. Comment recipients are deduplicated by user;
reply notification takes precedence when the parent author is also the reporter
or assignee. Before persistence, the centralized `NotificationsService`
confirms each candidate still has current Project access. No Comment body,
secret, GitHub payload, or full entity snapshot is stored.

Organization membership changes do not currently create Notifications.
Notification.projectId is required, so assigning an arbitrary Project to an
Organization-wide action would be misleading. Organization-scoped
notifications remain deferred until the scope model can represent them
honestly.

## Persistence and history

Each Notification stores its recipient, actor, Project, type, compact entity
identity, compact JSON metadata, `readAt`, and `createdAt`. Scalar entity IDs
are intentionally not foreign keys, so Task or Comment deletion does not erase
the inbox history. The Project and both users remain authoritative relations.

The migration refuses to upgrade a non-empty legacy Notification scaffold
because those rows did not contain enough actor/Project scope to backfill
without guessing. The verified development database contained zero such rows.

Domain mutation and Notification creation share the same interactive Prisma
transaction. Rejected or rolled-back mutations therefore leave no Notification.
Socket publication happens after commit and is best effort; a realtime failure
never rolls back an already committed REST mutation.

## API and privacy

All endpoints are Better Auth protected and implicitly use the current user:

- `GET /api/notifications?cursor=<uuid>&limit=30` (maximum 100)
- `GET /api/notifications/unread-count`
- `PATCH /api/notifications/:notificationId/read`
- `POST /api/notifications/read-all`

Listing is deterministic (`createdAt DESC`, then `id DESC`). Cursors and IDs
must belong to the current inbox; a cross-user ID behaves as not found. Read
operations are idempotent. Organization and Project owners have no override for
another user's inbox.

## Realtime and frontend

Every authenticated socket joins a server-derived `user:<userId>` room. Clients
cannot select this room. After commit, the backend emits only a compact
`NOTIFICATION_CREATED` invalidation containing the Notification ID and event
timestamp to the recipient room; it is never broadcast to a Project room.

The application header contains a keyboard-accessible bell, a visible
**Notifications** label at normal desktop widths, and an unread badge.
Its responsive panel lists newest items first, supports cursor-based “Load
more”, individual read, mark-all-read, retry/error/empty states, and Project
navigation. Unknown or deleted targets degrade to stable historical messages.
Realtime events invalidate only the inbox and unread-count caches.
Individual and bulk read actions persist `readAt` through the authenticated
backend; refresh and account switching never depend on client-only read state.

## Intentional limitations

There are no email, browser/mobile push, digests, preferences, per-event mute,
scheduled jobs, Redis, or BullMQ. Navigation targets the containing Project
rather than opening a Task/Comment deep link. Manual notification discovery,
read-state refresh, and two-account isolation must be retested after V1 manual
QA defect closure 1; automated verification does not claim that acceptance.

Organization membership changes do not currently create notifications.
Notification.projectId is required, and assigning an arbitrary Project to an
Organization-wide event would misrepresent its scope. Supporting those events
requires a future explicit Organization notification scope.
