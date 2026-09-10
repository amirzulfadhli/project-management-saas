# FlowPlan Organizations

Status: Organization onboarding and membership administration are implemented
and PostgreSQL-verified. The administration UI is statically verified; manual
browser acceptance remains part of the consolidated QA backlog.

## Role and authorization model

OrganizationMember is the authoritative membership record. Its existing
OrganizationRole remains intentionally small:

- OWNER can list, add, promote, demote, and remove Organization members.
- MEMBER can use the Organization and its Projects but cannot administer
  Organization membership.

Both roles inherit access to every Project owned by the Organization. Explicit
ProjectMember rows are a separate access path and retain their independent
ProjectRole (OWNER or MEMBER). Organization roles never silently become
Project roles.

Organization.ownerId is retained as the required primary-owner relation for
schema compatibility. Authorization is based on the matching
OrganizationMember.role, not merely on ownerId. When the primary owner is
demoted or removed, the service atomically points ownerId at another existing
Organization OWNER.

## API

All routes require a Better Auth session. Route IDs are strict UUIDs and
request bodies are strict Zod objects.

- POST /api/organizations creates an Organization and its initial OWNER
  membership together.
- GET /api/organizations lists the current user's memberships.
- GET /api/organizations/:organizationId returns one accessible Organization.
- GET /api/organizations/:organizationId/members lists the compact roster for
  any current Organization member.
- POST /api/organizations/:organizationId/members accepts an email field from
  an OWNER and adds that existing FlowPlan user as MEMBER.
- PATCH /api/organizations/:organizationId/members/:memberId accepts only an
  OWNER or MEMBER role field from an OWNER.
- DELETE /api/organizations/:organizationId/members/:memberId removes the
  member when initiated by an OWNER.

The roster response contains only membership ID, Organization ID, user ID,
role, and the user's name/email/image summary. It never exposes accounts,
sessions, passwords, provider tokens, or auth internals. OrganizationMember
currently has no joined timestamp, so the API does not invent one.

## Existing-user addition

FlowPlan does not yet have invitation tokens or email delivery. The add form is
therefore explicit: it accepts the normalized email of an account that already
exists and always adds it initially as MEMBER. An owner can promote the new
member separately.

Authorization runs before account lookup, so unauthorized callers cannot use
the endpoint to probe account existence. A missing account returns 404 to an
authorized owner, duplicate membership returns 409, and malformed or unknown
fields return 400.

## Transactions and owner invariant

Every add, role-change, and removal mutation locks the Organization row with
PostgreSQL SELECT FOR UPDATE. Authorization and target lookup are then repeated
through the active transaction client.

A demotion or removal of an OWNER must find another owner while holding that
lock. Otherwise it returns HTTP 409. This protects against concurrent
demotion/removal requests leaving the Organization ownerless. Same-role PATCH
is idempotent and performs no update.

An owner may remove themselves only when another owner remains. Ordinary
members cannot remove themselves through the administration API; an owner must
remove them.

## Inherited and explicit Project access

Removing an Organization membership removes only the inherited access path:

- Organization access only: Project access ends immediately.
- Organization membership plus explicit ProjectMember: explicit Project access
  remains.
- Removing Organization membership does not delete explicit Project
  memberships, Tasks, assignments, Comments, Activity, or other Project data.

AccessService remains the policy boundary for REST and realtime access.
Organization removal gathers the Organization's Project IDs inside the
transaction and reauthorizes their connected rooms only after commit. Sockets
with no remaining access are evicted; sockets with explicit Project access
remain authorized.

## Activity and Notifications

Activity and Notification rows currently require projectId. Organization
administration is Organization-scoped, so this milestone deliberately does not
write misleading records against an arbitrary Project. Honest Organization
Activity or Notifications require a future scope-model decision.

## Frontend administration

The Organizations page opens a scoped members dialog. Any member can inspect
the roster. Owners additionally receive add, role, and confirmed remove
controls. Demotion explains the loss of administration rights; removal
explains inherited versus explicit Project access.

The TanStack Query key includes the exact organizationId. Mutations update or
invalidate only that Organization's roster, detail, list entry, and Project
list. Backend authorization remains authoritative.

## Verification

The focused Organization administration E2E suite covers listing, existing-user
addition, strict validation, owner/member/outsider isolation, promotion,
idempotency, safe demotion, final-owner conflicts, owner self-removal, primary
owner reassignment, concurrent owner demotion, inherited access loss, explicit
access preservation, and realtime eviction or retention.

No schema migration was required. Before switching authority to membership
roles, the development database was checked: all four Organizations had a
matching OWNER membership for their ownerId.
