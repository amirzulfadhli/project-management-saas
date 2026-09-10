# FlowPlan Activity backend

Status: Activity Core Backend Stabilization is complete and PostgreSQL-verified.

## Purpose and scope

Activity is a Project-scoped collaboration history/feed. It helps collaborators
understand important Project, Task, and roster changes. It is not a
compliance-grade audit log: it has no cryptographic integrity, retention policy,
administrator export, or immutable external storage.

Every Activity has a required Project, an actor, a typed application event name,
a human-readable description, optional JSON metadata, and an optional Task.
Task deletion sets `taskId` to null while retaining Project scope and snapshot
metadata. Projects currently archive rather than hard-delete; their Activity FK
uses `RESTRICT`.

## Event taxonomy

Prisma keeps `Activity.type` as `String`, while `activity.types.ts` provides the
only application-level event constants:

- Project: `PROJECT_CREATED`, `PROJECT_UPDATED`, `PROJECT_ARCHIVED`,
  `PROJECT_RESTORED`, `PROJECT_DUPLICATED`
- Membership: `PROJECT_MEMBER_ADDED`, `PROJECT_MEMBER_ROLE_CHANGED`,
  `PROJECT_MEMBER_REMOVED`
- Task: `TASK_CREATED`, `TASK_RENAMED`, `TASK_UPDATED`, `TASK_MOVED`,
  historical `TASK_STATUS_CHANGED`, `TASK_ASSIGNEE_CHANGED`,
  `TASK_PRIORITY_CHANGED`, `TASK_DELETED`
- Comment: `COMMENT_CREATED`, `COMMENT_UPDATED`, `COMMENT_DELETED`
- Attachment: `ATTACHMENT_UPLOADED`, `ATTACHMENT_DELETED`
- Wiki: `WIKI_PAGE_CREATED`, `WIKI_PAGE_UPDATED`, `WIKI_PAGE_DELETED`

Metadata stores small before/after values and identity snapshots needed to
render an event without parsing its description. It avoids credentials, session
data, and large Task descriptions.

Comment events store only `commentId`, optional `parentId`, and content lengths.
They never copy Comment bodies into the Project Activity feed.

Attachment events store compact identity, scope, display filename, MIME type,
and byte length. File contents, storage keys, and server paths are never copied
into Activity.

Wiki events store only page identity/title, parent identity where useful, and
changed-field names. They never copy Markdown bodies into Activity.

Project archive, restore, and duplication are meaningful lifecycle events.
Column definition changes remain realtime collaborative state but do not create
Activity or Notifications; Task movement continues to provide the relevant
semantic board history.

## Transaction guarantee

`ActivitiesService.record` is an internal mutation helper. Domain services must
pass their active `Prisma.TransactionClient`; there is no public Activity write
endpoint. Project, Task, or ProjectMember mutation and Activity insertion
therefore commit or roll back together.

Project update/archive and Task create/update/delete now use interactive
transactions. Project and Task rows are locked before capturing mutable
before-state. Task relationship and assignee checks use the same transaction
client. Membership mutations reuse their existing Project-row lock.

A Task PATCH compares only supplied fields against the stored result. Rename,
Column movement, assignee, and priority changes receive specialized events.
`TASK_STATUS_CHANGED` remains renderable for historical rows, but status is no
longer writable. Other real field changes share one `TASK_UPDATED` event. A no-op PATCH
creates no Activity; a multi-field PATCH may create several distinct events.

For permanent Task deletion, the service records `TASK_DELETED` with the final
title, Column, priority, and assignee, then deletes the Task in the same
transaction. PostgreSQL clears the Activity `taskId`, while `projectId` and
metadata preserve useful history.

## Read API

    GET /api/projects/:projectId/activities?cursor=<activity-id>&limit=30

Better Auth is required. Organization owners, Organization members, and
explicit Project members can read the feed through the existing Project access
policy. Outsiders are denied. There are no POST, PATCH, or DELETE routes.

`limit` defaults to 30 and is capped at 100. Rows are ordered by `createdAt DESC,
id DESC`. The response is `{ items, nextCursor }`; a cursor must belong to the
nested Project. Each item exposes the actor summary and an optional compact Task
reference. The `(projectId, createdAt, id)` index supports this access path.

## Frontend activity feed

Project detail exposes Activity through a compact header action and modal rather
than adding a permanent dashboard panel. The modal uses the Project-scoped
`["project-activities", { projectId }]` infinite-query key, loads 30 newest
events at a time, and offers an explicit **Load more** action. Loaded pages are
deduplicated while retaining the backend's newest-first order.

A centralized presentation helper maps every current Project, Task,
membership, and Comment event to a readable category/fallback. The UI prefers
the backend's compact description, shows the actor, timestamp, and related Task
when available, and never renders raw metadata. Unknown future event types fall
back to their description instead of breaking the feed.

Initial, empty, pagination-error, and retry states use the existing FlowPlan
patterns. Project and Task/member/Comment mutations invalidate only the current
Project Activity key. Backend Project authorization remains the security
boundary.

## Limitations and future integration

- Activity types are application-typed rather than database-enum constrained.
- Direct database writes can bypass Task/Project consistency; supported writers
  always derive Project scope from the domain mutation.
- Actor deletion remains restricted until account anonymization is designed.
- Realtime delivery is best-effort cache invalidation; event buses and an
  outbox remain intentionally absent.
- Comment create/edit/delete use the internal recorder in the same transaction.
- Activity filtering, search, realtime delivery, and notifications remain
  future work.
