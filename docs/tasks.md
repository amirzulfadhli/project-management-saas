# FlowPlan Task backend

## Existing lifecycle

The Task module keeps the repository's established REST lifecycle:

- POST /api/tasks creates a Task.
- GET /api/tasks lists accessible Tasks with optional Project, Column,
  assignee, priority, and status filters.
- GET /api/tasks/:id returns Task detail.
- PATCH /api/tasks/:id updates fields and is also the current move operation
  when columnId changes.
- DELETE /api/tasks/:id permanently deletes the Task and returns HTTP 204.

There is no Task archive model or restore route. Delete remains a hard delete
because that behavior already existed in both backend and frontend. Comments
are now part of the Task aggregate and cascade when their Task is deleted;
subtasks, checklists, and other related models remain separate work.

Create, detail, update, and list items use the same compact response shape:
the Task scalar fields plus small assignee, reporter, Column, and Project
references. They do not return the full Project, Organization, or Board graph.

## Ownership and authorization chain

A Task belongs to both a Project and a Column. The Project belongs to an
Organization:

    Task -> Project -> Organization
       \-> Column -> Project

Every route first requires a Better Auth session through AuthGuard. TaskService
then checks Project access using the existing collaboration policy: an
Organization owner, Organization member, or explicit ProjectMember can read and
mutate the Project's Tasks.

The request flow is:

    Frontend request
      -> Better Auth session
      -> NestJS TasksController
      -> strict Zod validation
      -> Project access and relationship checks
      -> TasksService
      -> Prisma/PostgreSQL
      -> compact Task response

Frontend state is not an authorization boundary. Supplying a known Task,
Project, Column, or assignee ID does not bypass the backend checks.

## Why valid IDs are not enough

projectId and columnId are each valid foreign keys on their own, but that does
not prove they describe the same Project. Without a relationship check, a
request could combine Project A with a Column from Project B.

Create and update call assertColumnInProject before writing. A Project-scoped
list that also supplies columnId performs the same check. The assertion now
requires both `Column.projectId` and the related `Board.projectId` to match the
Task Project, so an orphaned or contradictory Column cannot be used. Cross-
Project substitution receives HTTP 400, and a failed move leaves the stored
Task unchanged.

Assignment has a similar cross-resource rule. A syntactically valid assigneeId
must identify a user who can access the Task's Project. Better Auth user IDs in
this repository are not UUIDs, so Task DTOs validate them as bounded,
non-empty identifiers. Task, Project, and Column IDs remain UUID-validated.

## DTO and date validation

Create, update, and list-query schemas are strict, so unknown fields receive
HTTP 400. Titles are trimmed before validation and storage; empty and
whitespace-only titles are rejected.

Task date inputs accept either a real ISO calendar date such as 2026-09-30 or
an ISO datetime with an offset such as 2026-09-30T12:30:00.000Z. Invalid
calendar dates such as 2026-02-30 are rejected before Prisma receives them.

Priority remains the existing integer scale from 1 through 4. Status remains a
trimmed, non-empty string with a 50-character limit. No Prisma status enum was
introduced because the repository establishes Columns as the canonical Kanban
workflow and does not define one complete status domain. Converting the
partially used status metadata to a guessed enum would be speculative.

## Listing semantics

A Project-scoped request first verifies access to that Project and returns only
its Tasks. Combining projectId and columnId additionally verifies that the
Column belongs to the Project.

An unscoped GET /api/tasks returns Tasks from all active Projects the user can
access. Tasks from archived Projects are excluded from this broad default list.
An explicitly Project-scoped request can still retrieve Tasks for an archived
Project, matching the existing ability to open archived Project detail.

Assignee, priority, and status filters narrow the already authorized result;
they never expand its Project boundary.

## Kanban movement and ordering

Moving a Task is a PATCH that changes columnId after validating the destination
Column belongs to the Task's existing Project. The update is one atomic
PostgreSQL row update. Repeating the same move is idempotent and cannot create a
cross-Project relationship.

Task has no position or rank field. The current MVP orders query results by
createdAt and the frontend groups them by Column. Therefore movement is
correct but does not support user-defined ordering within a Column. Fractional
ranking, drag-and-drop ordering, and concurrent reorder conflict handling are
future workflow concerns.

## Indexes

Task(projectId, createdAt) supports the dominant Project board/list query and
its newest-first ordering. Task(columnId) supports the existing Column filter
and foreign-key lookup path.

No assignee index or status/priority indexes were added because current
repository usage does not establish those as frequent selective queries.

## Response and permissions decisions

Create, detail, and update return the same Task representation used by list
items. Column moves use the update route and therefore return that same
representation. Delete returns no body.

The broad Organization/Project collaboration policy is preserved for Task
mutation. Task-specific owner/editor roles and advanced RBAC are intentionally
deferred.

## Frontend Project and Organization scoping

ProjectBoard treats its authorized ProjectDetail response as the current
Project context. It waits until that Project is loaded and, when the
Organization is selectable, until OrganizationProvider is synchronized before
requesting Tasks.

The board flow is:

    OrganizationProvider
      -> current Project detail
      -> ["tasks", { projectId }] query key
      -> GET /api/tasks?projectId=...
      -> NestJS authorization and relationship checks
      -> Prisma/PostgreSQL
      -> Project-specific Query cache
      -> board Columns and Task cards

Navigating from Project A to Project B changes the query key and remounts
ProjectBoard state. No previous Project Task array is used as placeholder data.
The board shows a loading state until the new request completes.

The Tasks page and Overview are Organization-level views, but they no longer
call the backend's unscoped Task list. They load the selected Organization's
active Projects and compose their Tasks from one Project-scoped query per
Project. Those calls share the same cache entries used by Project boards.

## Frontend-derived IDs and Columns

TaskModal receives projectId and organizationId from the loaded current Project,
not from editable form controls. Its Column options are filtered so every
option has the same projectId. This prevents a stale or mixed Column array from
being offered in the UI.

These checks improve state correctness but do not authorize the operation.
NestJS still validates the session, Project access, and Task/Column relationship
for every mutation.

Better Auth user IDs remain ordinary strings in the frontend Task contract.
Task, Project, and Column resource IDs are UUIDs on the backend, but the client
does not incorrectly apply that assumption to assigneeId.

## Task mutation caches

Create inserts the backend's Task response into only the current Project cache.
Update replaces that Task with the returned response. Create and delete also
invalidate the selected Organization's Project list so Task counts refresh.

Column movement uses a small optimistic update: columnId and the compact Column
reference change together. The previous Project Task array is retained and
restored if the request fails; the exact Project cache is then refetched from
the backend. No position or ranking state is invented.

Permanent deletion from the board modal is optimistic because the modal stays
mounted and can restore the previous cache on failure. Deletion from the
Organization Tasks page waits for success before removing the row, ensuring an
inline backend error remains visible. Both paths invalidate only the affected
Project Task cache.

## Forms, dates, and destructive actions

Create and edit disable submission for whitespace-only titles and send trimmed
titles. Backend validation errors appear in the modal with an alert role.

The date input produces a YYYY-MM-DD ISO calendar date, which is one of the
formats accepted by the Task DTO. Existing ISO response timestamps remain
strings in TypeScript.

Delete controls say Delete permanently and require confirmation that the action
cannot be undone. The frontend does not imply archive or restore behavior
because DELETE /api/tasks/:id performs a real deletion.

The frontend Task type now mirrors the compact backend response, including
Project and Column references, reporter, nullable assignee, workflow/time
fields, and the existing GitHub/deployment scalar fields. Assignment and status
editing were not added because those controls did not previously exist.

The frontend has no dedicated automated test runner. This milestone uses
TypeScript, ESLint, formatting, production build, source-level query inspection,
and a live two-Project HTTP lifecycle. Browser click-through remains a manual
follow-up when browser automation is available.

## Task Activity integration

Task create, update, movement, and permanent deletion now write Project-scoped
Activity in the same interactive Prisma transaction. Update locks the Task,
validates Column/assignee relationships through that transaction, compares the
stored before/after values, and emits only real semantic changes. No-op PATCH
requests create no Activity.

Deletion records the final Task snapshot before deleting it. PostgreSQL then
sets the Activity `taskId` to null, while required `projectId` and metadata keep
the history readable. Task deletion also cascade-deletes its Comments while
leaving `TASK_DELETED` Activity intact. This does not change the existing
permanent Task deletion contract.
