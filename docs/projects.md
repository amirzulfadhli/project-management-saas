# FlowPlan Project backend

## Project and ProjectMember

A Project is work owned by an Organization. Project.organizationId is required,
while Project.teamId remains optional and is not exposed by the current Project
DTOs.

ProjectMember is the join model between User and Project:

    User 1 --- * ProjectMember * --- 1 Project

The join row records relationship-specific data through ProjectRole. The
database accepts only OWNER or MEMBER. Creating a Project gives the requesting
organization member an OWNER ProjectMember row; membership administration is
not part of this milestone.

## Transactional creation

ProjectsService.create first checks organization access, then uses one Prisma
transaction for the Project workflow:

    Authenticated request
      -> ProjectsController
      -> strict Zod validation
      -> AccessService.assertOrganizationMember
      -> ProjectsService
      -> Prisma transaction
      -> Project + OWNER ProjectMember + Main Board + six Columns
      -> full Project detail response

The first nested write creates the Project, creator membership, and Main Board.
The same transaction then inserts Backlog, To Do, In Progress, Review, Testing,
and Done columns. If any operation fails, PostgreSQL rolls back the entire
workflow, preventing partially initialized Projects.

## Strict validation

Create and update request schemas are strict. Unknown fields receive HTTP 400.
Project names are trimmed before validation and storage, limited to 120
characters, and whitespace-only names are rejected. Description and
organizationId retain their existing behavior; Team input is intentionally not
part of the current API.

The list query accepts only:

- organizationId: an optional Organization UUID;
- archived: optional true or false.

## Active and archived Projects

DELETE /api/projects/:id is a soft archive. It sets archivedAt and does not
delete the Project, Board, Columns, or related history.

GET /api/projects returns active Projects by default. The equivalent explicit
query is archived=false. Passing archived=true returns archived Projects only.
Both forms can be combined with organizationId. `POST /api/projects/:id/restore`
clears `archivedAt`; there is no hard-delete route.

## Response contracts

Project mutation responses now match the detail route:

- POST /api/projects returns full Project detail.
- GET /api/projects/:id returns full Project detail.
- PATCH /api/projects/:id returns full Project detail.
- POST /api/projects/:id/duplicate returns full Project detail.
- POST /api/projects/:id/restore returns full Project detail.
- DELETE /api/projects/:id returns HTTP 204.

Full detail includes Organization, optional Team, ProjectMembers with their
Users, and the Main Board with ordered Columns and task counts. GET
/api/projects remains a lighter summary list with Organization, optional Team,
task/member counts, and only the current user's explicit Project role for
owner-control presentation.

This keeps a single mutation/detail contract without extra follow-up requests:
Prisma includes the detail relations in the create, update, and duplicate
queries that already produce the response.

## Roles, indexes, and relations

ProjectRole is a PostgreSQL/Prisma enum rather than an unrestricted string. The
migration converts existing lowercase owner/member values to OWNER/MEMBER and
refuses to silently convert unknown historical roles.

The current query-backed indexes are:

- Project(organizationId, archivedAt), supporting organization-scoped active
  and archived lists;
- ProjectMember(userId), supporting explicit-member access and cross-project
  membership lookups.

The existing unique ProjectMember(projectId, userId) constraint already indexes
project-first membership checks, so a duplicate projectId index is unnecessary.
No teamId index was added because current Project queries do not filter or join
through Team for access.

## Authorization boundary

All Project routes use AuthGuard. AccessService preserves FlowPlan's existing
organization collaboration model:

- the Organization owner has Project access;
- any Organization member has Project access;
- an explicit ProjectMember has Project access.

Read access uses any inherited Organization membership or explicit Project
membership. Structural administration is narrower: update, archive, restore,
and duplicate require Organization `OWNER` or explicit Project `OWNER`.
Ordinary collaborators retain Task collaboration access but cannot administer
the Project merely through inherited access. See `docs/authorization.md`.

## Membership administration

Organization-level inherited access remains distinct from explicit
`ProjectMember` roster/role records. Organization owners and explicit Project
`OWNER`s administer the roster; self-removal is allowed only when it does not
remove the final Project owner, and additions are limited to users already
belonging to the owning Organization. Full contracts and verification are in
`docs/project-membership.md`.

The mutation flow is:

    Authenticated request
      -> Project membership-admin authorization
      -> Organization membership validation
      -> invariant checks
      -> transaction
      -> ProjectMember mutation

Existing Task assignments are not silently cascaded when an explicit
membership is removed. A User who remains an Organization member keeps both
the assignment and inherited Project access.

## Verification

backend/test/projects.e2e-spec.ts exercises the Project lifecycle against
PostgreSQL: authentication, organization membership, transactional
initialization, active listing, authorized detail, non-member rejection, strict
validation, update, soft archive, archived listing, and safe duplication.

## Frontend organization scoping

OrganizationProvider is the frontend source of truth for the current workspace.
The Project list and creation modal consume selectedOrganizationId from that
provider instead of loading Organizations again.

The concrete list flow is:

    OrganizationProvider
      -> selectedOrganizationId
      -> ["projects", { organizationId }] query key
      -> GET /api/projects?organizationId=...
      -> NestJS access check
      -> PostgreSQL organization filter
      -> organization-specific Query cache
      -> Project cards

The query is disabled until a valid selection exists. Changing the header
switcher changes both the key and the request parameter, so Organization A and
Organization B never share one cached Project list. The Overview page uses the
same scoped key for its recent Projects.

### Context instead of refetching shared data

CreateProjectModal previously loaded the Organization list itself, displayed a
second selector, and contained a second Organization-onboarding branch. That
duplicated state already owned by OrganizationProvider. The modal now displays
the selected Organization as read-only context and derives organizationId for
POST /api/projects from the provider.

Accounts with no Organizations are still handled by the existing
/organizations onboarding gate. The Project feature does not recreate that
workflow.

### Cache updates and invalidation

Create, update, and duplicate return ProjectDetail. The frontend stores that
response under the individual Project detail key and invalidates only the list
for the affected organization.

Archive is slightly different. DELETE /api/projects/:id returns no body, so the
active list cache first removes the archived Project directly for immediate UI
feedback. Archive and restore then invalidate the affected Organization's
active and archived list variants. Project-list keys include the archive mode,
so the two views cannot reuse stale results.

### Detail navigation and selection

GET /api/projects/:id remains the source for Project detail. After an authorized
detail loads, ProjectBoard synchronizes the global selection when the Project's
Organization is present in the user's Organization list. This keeps the header
workspace and the Project being viewed coherent without a full-page reload.

An explicit ProjectMember could theoretically have Project access without an
Organization membership. In that case the Organization is not selectable, so
the detail remains visible without writing an invalid global selection.

The selected Organization is frontend state, not authorization. A changed
local-storage value or query parameter cannot grant access; NestJS still
derives the authenticated user from the session and applies its access checks.

### Archive language, response typing, and errors

The UI uses Archive, Archived, and Restore because the backend performs a soft
archive and has no hard-delete route. The Projects screen exposes an explicit,
labelled **Active / Archived** selector and changes its heading to match the
selected view. Archived detail remains retrievable, and owner-only structural
controls match backend authorization.

ProjectMember.role is typed as OWNER or MEMBER, matching the database enum.
Create, detail, update, and duplicate are typed as the shared ProjectDetail
response, while the organization list uses the lighter ProjectSummary shape.

Create and update errors remain next to their forms. Duplicate and archive
errors appear beside the action that failed. Successful duplicate/archive
actions use the existing inline status styling rather than introducing a new
notification dependency.

The frontend currently has no automated test runner or test dependencies.
TypeScript, ESLint, production build, source-level cache-key inspection, and a
live two-Organization HTTP flow cover this milestone; browser click-through
should be repeated when browser automation is available.

## Project Activity integration

Project creation writes `PROJECT_CREATED` inside the existing Board/Column
creation transaction. Update and archive lock the Project and record only real
state transitions. Duplication locks and reads the source inside the destination
transaction and records `PROJECT_DUPLICATED` on the new Project. A failed
Activity insert rolls back the Project mutation.
