# FlowPlan Project Membership Administration

Status: backend and frontend membership administration are complete. The
backend is PostgreSQL-verified, and the frontend is typecheck/build/lint
verified against the implemented API contracts.

## Finalized policy

`ProjectMember` remains the explicit roster and role record joining a User to a
Project. It is not the sole Project-access boundary. FlowPlan keeps the current
collaboration model in which an Organization owner or Organization member
inherits access to Projects in that Organization, while an explicit
`ProjectMember` also satisfies the existing Project access check.

The administration policy is:

- an Organization `OWNER` or a `ProjectMember` with role `OWNER` may add,
  promote, demote, or remove Project members;
- a Project member may remove their own explicit membership even if they are
  not an administrator, subject to the last-owner rule;
- a user added to a Project must already be the owning Organization's owner or
  have an `OrganizationMember` row for that Organization;
- `ProjectRole` remains `OWNER | MEMBER`, and multiple owners are allowed;
- a mutation must never remove or demote the last Project `OWNER`;
- duplicate explicit memberships are conflicts;
- removing an explicit membership does not revoke access inherited from the
  Organization.

`OrganizationMember.role = OWNER` is the authoritative Organization-owner
check, and multiple Organization owners are supported. `Organization.ownerId`
remains a required primary-owner relation for schema compatibility and is
reassigned to another owner if its current user is demoted or removed.

## Implemented HTTP contract

`ProjectMembersController` is registered by `ProjectsModule` and exposes the
roster beneath the owning Project resource.

### List members

    GET /api/projects/:projectId/members

- Authentication: required.
- Authorization: ordinary Project access is sufficient to view its roster.
- Response: HTTP 200 with `ProjectMemberResponse[]`.

### Add a member

    POST /api/projects/:projectId/members
    { "userId": "better-auth-user-id", "role": "MEMBER" }

- Authentication: required.
- Authorization: Organization `OWNER` or Project `OWNER`.
- `role` is optional and defaults to `MEMBER`; valid values are `OWNER` and
  `MEMBER`.
- The target User must already belong to the owning Organization.
- Response: HTTP 201 with the created `ProjectMemberResponse`.

### Change a role

    PATCH /api/projects/:projectId/members/:memberId
    { "role": "OWNER" }

- Authentication: required.
- Authorization: Organization `OWNER` or Project `OWNER`.
- Updating to the existing role is an idempotent HTTP 200 response.
- Demoting an `OWNER` is rejected if that member is the last Project owner.
- Response: HTTP 200 with the updated `ProjectMemberResponse`.

### Remove a member

    DELETE /api/projects/:projectId/members/:memberId

- Authentication: required.
- Authorization: Organization `OWNER`, Project `OWNER`, or the member removing
  their own explicit membership.
- Removing the last Project `OWNER` is rejected, including self-removal.
- Response: HTTP 204 with no body.

`memberId` is the ProjectMember UUID. It is preferable to putting a Better Auth
User ID in the route because Better Auth identifiers are opaque strings rather
than UUID resource identifiers.

## DTOs and response shape

Both request bodies use strict Zod schemas:

- `AddProjectMemberDto`: `userId` is a trimmed, non-empty, bounded opaque
  string; `role` is optional `OWNER | MEMBER` with default `MEMBER`.
- `UpdateProjectMemberRoleDto`: exactly one required `role` field with value
  `OWNER | MEMBER`.
- `projectId` and `memberId` route parameters are UUIDs.

The shared response is intentionally compact:

    {
      "id": "project-member-uuid",
      "projectId": "project-uuid",
      "userId": "better-auth-user-id",
      "role": "MEMBER",
      "user": {
        "id": "better-auth-user-id",
        "name": "Member name",
        "email": "member@example.com",
        "image": null
      }
    }

The list should use a deterministic order: owners first, then members, with
Users ordered by name and membership ID as a final tie-breaker.

## Frontend roster administration

The Project detail header links to `/projects/:id/members`, using the extracted
`ProjectMembersPanel`. Its query key is
`["project-members", { projectId }]`, so a roster cached for Project A cannot
be rendered for Project B. The panel displays the server-ordered explicit
roster, marks the signed-in User, and exposes role/removal controls when the
current session is an Organization `OWNER` or an explicit Project `OWNER`.
Those client checks only reduce misleading controls; NestJS remains the
authorization boundary and 403/404/409 responses are shown inline.

Add-member choices come from the existing selected-Organization detail
response, which includes the primary Organization owner and all `OrganizationMember`
Users. Existing Project members are removed from the selector. FlowPlan does
not accept arbitrary IDs, imply an invitation, or show external Users. If the
Organization detail is unavailable for the active Project, the add form states
that eligible Users are unavailable rather than presenting an incomplete
selector.

Successful add/change/remove mutations update only the active Project roster
cache and revalidate that exact roster plus the matching Project detail. A
self-removal confirmation and success message explicitly say that inherited
Organization access may remain. Removal messaging also states that existing
Task assignments are retained.

## HTTP error semantics

- `400 Bad Request`: malformed UUID, invalid/unknown request fields, invalid
  role, blank User ID, or a target User who exists but does not belong to the
  owning Organization.
- `401 Unauthorized`: no valid Better Auth session.
- `403 Forbidden`: the Project exists but the caller lacks Project access, or
  the caller can access it but is not allowed to administer the requested
  membership. This preserves the repository's existing access convention.
- `404 Not Found`: Project, target User, or ProjectMember does not exist. A
  membership ID belonging to another Project is also reported as not found.
- `409 Conflict`: duplicate `(projectId, userId)` membership, or a removal or
  demotion that would leave zero Project owners.

The database `@@unique([projectId, userId])` constraint remains authoritative
for concurrent duplicate requests; Prisma `P2002` should be translated to
HTTP 409.

## Authorization helpers

`AccessService.assertProjectMembershipAdmin` permits only the Organization
owner or an explicit Project `OWNER`. `assertProspectiveProjectMember` verifies
that a target User has an `OrganizationMember`
row; it distinguishes a missing User (404) from an existing User outside the
Organization (400).

Both helpers accept an optional `Prisma.TransactionClient`. Membership
mutations pass their active transaction client, so authorization and
eligibility decisions use the same database snapshot as the mutation.

Controller code should only validate input and forward the session-derived User
ID. It should not duplicate authorization queries.

## Transactions and owner invariants

Listing is read-only and does not need an interactive transaction. Every roster
mutation uses one PostgreSQL-backed Prisma transaction:

    Authenticated request
      -> Project membership-admin authorization
      -> Organization membership validation for additions
      -> duplicate/target/last-owner invariant checks
      -> ProjectMember mutation
      -> compact response

All mutations serialize on the owning Project row before evaluating roles. A
PostgreSQL `SELECT ... FOR UPDATE` on that Project inside the transaction gives
add, role change, and removal a common lock. This prevents two concurrent
requests from each observing two owners and both removing or demoting one,
leaving zero owners.

After acquiring the lock, the service re-reads the actor and target memberships
inside the transaction. For an owner demotion or removal, it counts `OWNER`
rows and returns HTTP 409 when the count is one. Only then does it update or
delete the row.

Self-removal is an authorization exception only for `DELETE`: a `MEMBER` may
remove their own row, while they may not change roles or remove another member.
An `OWNER` may demote or remove themselves only when another owner remains.

## Task-assignment decision

The existing Task rule considers an assignee valid when they have Project
access: Organization `OWNER`, Organization `MEMBER`, or explicit Project member.
Task points to `User`, not to `ProjectMember`.

Therefore:

- removing an explicit ProjectMember while the User remains an Organization
  member leaves existing Task assignments unchanged; the User still has
  inherited Project access and remains eligible for future assignment;
- if a future Organization-membership workflow causes the User to lose all
  Project access, existing assignments should still remain as historical work
  attribution. They do not grant access. The User must be rejected for new
  assignments until access is restored;
- membership removal must not silently clear, reassign, or delete Tasks. A
  future UI may mark an assignee as no longer having access, but that is not a
  database cascade requirement.

This matches the current foreign key: deleting a ProjectMember does not touch
`Task.assigneeId`; only deletion of the User sets Task assignment to null.

The Task create/edit modal now builds the assignable-user list from the union
of:

- the selected Organization's owner;
- Users in that Organization's membership list; and
- the current Project's explicit `ProjectMember` roster.

This union mirrors the backend Project-access predicate instead of incorrectly
assuming that the explicit roster is the entire access boundary. IDs remain
opaque Better Auth User IDs. Create can assign a User, edit can change or clear
the assignee, and all mutations continue to update the existing Project-scoped
Task cache. A historical assignee who no longer appears in the eligible union
is still displayed, but cannot be selected again; leaving that value unchanged
does not resubmit it for validation.

## Database and index review

No schema migration was required for this milestone:

- `ProjectMember(projectId, userId)` is unique and supports Project-first
  membership lookup and duplicate prevention;
- `ProjectMember(userId)` supports explicit-member access queries;
- `OrganizationMember(organizationId, userId)` is unique and supports target
  eligibility checks;
- `ProjectRole` already constrains roles to `OWNER | MEMBER`.

An additional `(projectId, role)` index is not justified for the expected small
rosters. The existing Project-first unique index can support the owner count;
indexing should be reconsidered only with measured roster/query growth.

## Verification and remaining work

`backend/test/project-members.e2e-spec.ts` verifies authentication, scoped
listing, both administrator types, all denied roles, Organization eligibility,
duplicate conflicts, promotion/demotion and idempotency, self-removal,
final-owner protection, cross-Project member IDs, successful deletion,
retained Task assignments, inherited Organization access, and concurrent owner
mutations against PostgreSQL.

Frontend verification includes TypeScript, full ESLint, changed-file Prettier,
and a Next.js production build. Browser automation was unavailable in the
Windows environment; the running production frontend returned the dynamic
Project route successfully, while the PostgreSQL membership and Task E2E suites
verified 20 API scenarios used by this UI.

Remaining work is intentionally separate: invitations, Organization membership
administration, and advanced RBAC. If a future workflow removes a User's last
source of Project access, it should retain historical Task assignments while
rejecting new assignments.

## Membership Activity integration

Successful add, role-change, and remove operations record Project-scoped
Activity through the membership mutation's existing locked transaction.
Same-role PATCH, duplicate membership, final-owner conflicts, and authorization
failures create no Activity. Removal metadata keeps the target User and former
role without changing Task assignments or inherited Organization access.
