# FlowPlan Board and Column architecture

Status: Board/Column core backend stabilization is PostgreSQL-verified, and
frontend Column management is complete.

## One-Board MVP policy

FlowPlan intentionally supports one Board per Project for the current MVP.
`Board.projectId` is unique, and Project creation creates a `Main Board` plus
Backlog, To Do, In Progress, Review, Testing, and Done in one Prisma
transaction. Project duplication creates a different Board and copies the
source Column names into positions starting at zero.

The Prisma relation remains `Project.board: Board?`, so the database permits a
legacy or directly inserted Project without a Board. Normal application
creation guarantees the Board at runtime. Column endpoints report HTTP 409 for
an accessible Project in that inconsistent state; they do not silently create
a replacement Board. There is no public Board CRUD API.

## Project-nested Column API

All routes require a Better Auth session and the repository's existing broad
Project access: Organization ownership, Organization membership, or explicit
Project membership.

    GET    /api/projects/:projectId/columns
    POST   /api/projects/:projectId/columns
    PATCH  /api/projects/:projectId/columns/:columnId
    DELETE /api/projects/:projectId/columns/:columnId

GET returns only rows whose `projectId` and `boardId` both match the nested
Project and its Board, ordered by `position` and then ID. POST accepts only a
strict `{ "name": string }` body. Names are trimmed, limited to 120 characters,
and cannot be blank. Project ID, Board ID, and position are server-derived.

PATCH is rename-only and uses the same strict name validation. It does not
accept relationship identifiers or an arbitrary position. A Column ID from
another Project is HTTP 404.

DELETE locks and checks the nested Column. An empty Column is removed with HTTP 204. A Column containing Tasks returns HTTP 409; Tasks are never moved,
cascade-deleted, or silently changed.

## Ownership and integrity boundary

Supported requests follow this chain:

    Better Auth session
      -> Project access
      -> Project's unique Board
      -> Column with matching projectId and boardId
      -> Prisma/PostgreSQL

Prisma cannot directly express the cross-table rule that
`Column.projectId == Column.board.projectId` with the current nullable
single-field Board relation. The service boundary therefore derives Board IDs
instead of accepting them and scopes reads/mutations by the complete chain.
Project detail and duplication also filter Board Columns by the Project ID, so
a contradictory row is neither exposed under the wrong Board nor copied into a
new Project.
`AccessService.assertColumnInProject` also requires both the Column and its
Board to identify the Task's Project, so malformed or orphaned Columns cannot
be used for Task creation, filtering, or movement.

Direct database writes could still create a contradictory or nullable
`boardId`. Fixing that at the database level would require relation and data
migration work that is not justified without auditing real deployed data. The
current change is non-destructive and prevents supported APIs from creating or
using malformed relationships.

## Column ordering and concurrency

The existing unique constraint `(projectId, position)` remains authoritative.
To append, the service starts a Prisma transaction, checks Project access with
that transaction client, locks the Project's Board row with PostgreSQL
`FOR UPDATE`, reads the highest position in the Project, and inserts at the next
integer. Concurrent supported appends therefore serialize and receive unique,
increasing positions. An unexpected database uniqueness race is translated to
HTTP 409 rather than leaking Prisma errors.

Deleting a Column may leave a gap. Gaps are valid stable ordering in this MVP;
positions are not promised to be contiguous. Duplicate Column names also
remain allowed. Reordering is not exposed, so supported APIs cannot create
negative or duplicate positions.

No `(boardId, position)` index was added. The existing unique
`(projectId, position)` index begins with the actual Project lookup key, and
there is only one Board per Project, so another ordering index would duplicate
the current access path.

## Frontend Column management

The Project detail header exposes a compact **Columns** management dialog. It
uses the Project-nested API to list the current Board's Columns, add a new
Column, rename an existing Column, and permanently delete an empty Column. The
form sends only a trimmed `name` (maximum 120 characters); relationship IDs and
positions remain server-derived.

The board's live Column source uses the query key
`["project-columns", { projectId }]`. The Columns embedded in Project detail
are used only as a same-Project loading fallback. This keeps navigation
responsive without creating a second mutable client-side ordering model.
Successful mutations update that exact Project's Column cache and then refresh
the exact Project detail plus Project-scoped Task queries. Project A mutations
therefore cannot populate or invalidate Project B's Column cache.

Column changes are intentionally non-optimistic. The server response defines
the created position and successful rename result. Delete requires explicit
confirmation and clearly states that only empty Columns can be deleted. An HTTP
409 leaves the Column and every Task visible and explains that Tasks must be
moved or permanently deleted first. HTTP 401, 403, and 404 states are also
translated into concise UI feedback; server authorization and relationship
validation remain authoritative.

The dialog has labeled controls, disabled mutation states, an ordered roster,
loading/empty/error states, and inline success/error feedback. It exposes no
Board selector because FlowPlan still has exactly one Board per Project.

## Task ordering

Tasks still have no position/rank field inside a Column. Column management does
not add Task ordering, drag-and-drop, fractional ranking, or implicit Task
movement. Those require a separate data-model and workflow milestone.

Column reordering is also still unsupported by the backend and is not simulated
in the frontend. Column order remains the deterministic order returned by the
server.

## Frontend verification

On 2026-09-02, frontend TypeScript, ESLint, Prettier, and the Next.js production
build passed. Static contract inspection confirmed that all four frontend API
helpers target the verified Project-nested routes and send no client-owned
relationship or position fields. The repository has no frontend automated test
framework, and browser automation was unavailable in the Windows environment.

The focused backend Column e2e suite was also requested as a regression check,
but its current run could not reach the configured PostgreSQL server
(`ECONNREFUSED`) during test setup. No backend or schema files changed in this
frontend milestone; the backend contract remains covered by the previously
successful PostgreSQL verification.
