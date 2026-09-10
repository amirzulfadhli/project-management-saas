# FlowPlan authorization policy

FlowPlan keeps Organization membership and explicit Project membership as
separate access paths. Backend services are authoritative; frontend control
visibility is only a convenience.

## Access and administration

| Capability                                         | Organization OWNER | Organization MEMBER | explicit Project OWNER | explicit Project MEMBER |
| -------------------------------------------------- | ------------------ | ------------------- | ---------------------- | ----------------------- |
| Read Project data                                  | Yes                | Yes, inherited      | Yes                    | Yes                     |
| Create and move Tasks                              | Yes                | Yes, inherited      | Yes                    | Yes                     |
| Edit/archive/restore/duplicate Project             | Yes                | No                  | Yes                    | No                      |
| Create/rename/delete Columns                       | Yes                | No                  | Yes                    | No                      |
| Administer Project roster or repository connection | Yes                | No                  | Yes                    | No                      |

Organization access is inherited by every Project in that Organization.
Explicit Project membership is an independent access path: removing an
Organization membership revokes inherited access but preserves access granted
by an explicit Project membership. Losing both paths removes REST access and
causes the realtime gateway to evict the user's Project-room subscriptions.

Creating a Project remains available to an Organization member and creates an
explicit Project `OWNER` row for the creator. That explicit role, rather than
ordinary inherited membership, grants structural Project administration.

## Structural versus collaborative mutations

Project metadata, archive state, duplication, and Column definitions are
structural administration. They require either Organization `OWNER` or
explicit Project `OWNER` authority through
`AccessService.assertProjectOwnerAuthority`.

Task creation, editing, assignment, ordering, and movement remain normal
collaboration operations for any user with legitimate Project access. Moving a
Task between Columns does not grant authority to create, rename, or delete the
Columns themselves.

## Archive and duplication

Archive is soft: it sets `archivedAt`, removes the Project from active lists,
and preserves the Board, Columns, Tasks, membership, integrations, Activity,
Files, Wiki, and Time entries. Archived Projects have a separate intentional
list and remain readable. An owner can restore the same Project and all of its
relationships.

Duplication is deliberately conservative. It copies only Project name and
description, optional Team association, Board name, and ordered Column names.
The new Project is active and gives the duplicating user one explicit Project
`OWNER` membership. It does not copy Tasks, Comments, Activity history,
Notifications, Files, Wiki pages, Time entries, other memberships, GitHub
repository connections, Issue links, webhook deliveries, or any external
identity.

## Workflow state

The Task's Board Column and Column-local position are the canonical workflow
state. The legacy database `Task.status` column remains temporarily for
non-destructive compatibility, but create/update/list DTOs no longer accept or
filter it and the frontend contract no longer exposes it. Moving a Task changes
its Column/position only. Historical `TASK_STATUS_CHANGED` Activity rows remain
renderable, but supported current writes no longer create them.

## Privacy boundary

Supplying known IDs never bypasses authorization. Nested Project/Column/Task
and GitHub Issue operations derive their Project scope on the server and reject
cross-Project substitution. Organization and Project owners do not gain access
to another user's private Notification inbox or private time-entry history
beyond the documented aggregate view.
