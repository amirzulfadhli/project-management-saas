# FlowPlan Comments backend

Status: Comments Core Backend Stabilization is complete and PostgreSQL-verified.

## Model and API

A Comment belongs to one Task, and the Task's Project supplies the access
boundary. Replies use `parentId`, but the API returns a flat list so a future
frontend can reconstruct threads without requiring a recursive server payload.

The authenticated, Task-nested contract is:

    GET    /api/tasks/:taskId/comments?cursor=<comment-id>&limit=50
    POST   /api/tasks/:taskId/comments
    PATCH  /api/tasks/:taskId/comments/:commentId
    DELETE /api/tasks/:taskId/comments/:commentId

Create accepts only `{ content, parentId? }`; update accepts only `{ content }`.
Content is trimmed, must contain 1–5000 characters, and unknown fields are
rejected. Task, Comment, parent, and cursor IDs are UUID-validated. The server
derives the author and Task/Project relationship from the session and route.

## Access and ownership

Every operation resolves `Task -> Project` and applies the existing Project
access policy. Organization owners, Organization members, and explicit Project
members can read and create Comments. Losing Project access prevents later
read, create, edit, or delete requests without removing stored history.

Only the author can edit a Comment. Another user's Comment may be deleted by a
Project `OWNER` or the owning Organization's owner, but those moderators cannot
edit it. Ordinary Organization or Project members receive no moderation power.
This is enforced by NestJS; client-side controls are only future UX.

## Threads, pagination, and deletion

A reply's parent must belong to the same Task. `parentId` is accepted only at
creation, so supported APIs cannot reparent a thread or construct a cross-Task
relationship. Server-generated IDs make self-parenting impossible on create.

Listing is deterministic and oldest-first by `createdAt ASC, id ASC`. The
default page size is 50 and the maximum is 100. Cursors are checked against the
nested Task before use. The `(taskId, createdAt, id)` and `(parentId)` indexes
support feed and reply lookups.

Individual deletion is a soft delete: the row and its `parentId` remain,
`deletedAt` is set, and stored content is erased. API responses expose
`content: null`, so deleted text never leaves the backend. Replies remain
attached to the tombstone. Editing a tombstone returns HTTP 409; repeated
authorized DELETE is idempotent (HTTP 204) and creates no duplicate event.

Task deletion remains permanent. Task is the aggregate root, so PostgreSQL
cascade-deletes its Comments. It does not cascade Activity: the pre-existing
`TASK_DELETED` event survives, its `taskId` becomes null, and required
`projectId` plus snapshot metadata preserve useful history.

## Activity and transactions

Create, real content update, and first deletion emit `COMMENT_CREATED`,
`COMMENT_UPDATED`, and `COMMENT_DELETED`. Each Comment mutation and Activity
insert share one interactive Prisma transaction. Rejected mutations and no-op
edits emit nothing; an Activity failure rolls back the Comment change.

Activity metadata contains only IDs, parent ID, and content lengths. Full
Comment bodies are deliberately excluded, and Activity has no Comment foreign
key. Descriptions are compact and non-sensitive.

## Current limitations

- There is no rich text, mentions, reactions, attachments, search, edit
  history, restore operation, or realtime delivery.
- The database cannot express “parent belongs to the same Task” as a simple
  Prisma relation constraint; the Task-nested service enforces it. Direct SQL
  outside the application could bypass that invariant.
- User deletion remains restricted by the author foreign key until a separate
  account anonymization/deletion policy is designed.

## Frontend Task conversation

Opening an existing Task now provides **Details** and **Comments** tabs inside
the established Task modal. New-Task creation remains focused on details;
Comments become available only after the Task exists.

Comments use the Task-scoped `["task-comments", { taskId }]` infinite-query
key, request 50 oldest-first rows per page, deduplicate loaded pages, and expose
an explicit **Load more Comments** action. A newly created Comment is merged
into that Task's cache and sorted by the backend's `createdAt, id` contract;
edits and tombstones replace only the matching cached row.

The frontend reconstructs a compact, one-level visual thread from the flat
`parentId` relationship. Replies retain their real parent ID, while indentation
is deliberately capped for narrow-screen safety. Deleted rows show a tombstone
and never render content; replies stay in place.

The composer is plain text, trims submissions, enforces the 5000-character
limit, and supports root Comments and replies. Authors receive inline edit
controls. Delete is shown to the author and to users known from current Project
context to be Project/Organization owners, with confirmation explaining the
tombstone behavior. These controls are convenience only: NestJS authorization
remains authoritative, and 401/403/404/409 responses are surfaced in the modal.
