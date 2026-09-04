# FlowPlan organization backend

## Organization and membership

An `Organization` is the workspace that owns shared resources. It has one
explicit owner through `ownerId`, plus a collection of
`OrganizationMember` rows.

`OrganizationMember` is the membership (or join) model between users and
organizations. One user can belong to many organizations, and one organization
can contain many users, so the relationship is many-to-many:

```text
User 1 --- * OrganizationMember * --- 1 Organization
```

The join row is useful because the relationship has its own data: the
`OrganizationRole` value is either `OWNER` or `MEMBER`.

## Ownership versus membership

Ownership and membership answer related but different questions:

- `Organization.ownerId` identifies the single user responsible for the
  organization.
- An `OrganizationMember` row says that a user may access the organization.
- The creator receives both: their ID becomes `ownerId`, and a membership row
  is created with role `OWNER`.

FlowPlan creates the organization and OWNER membership in one nested Prisma
`create`. Nested writes are transactional, so the database will not keep an
organization if its creator membership cannot be created.

## Database constraints and relations

- `Organization.slug @unique` makes a public-style slug globally unique.
- `@@unique([organizationId, userId])` prevents duplicate memberships.
- `OrganizationRole` is a PostgreSQL/Prisma enum, preventing arbitrary role
  strings.
- `ownerId`, `organizationId`, and `userId` are foreign keys. They prevent
  references to users or organizations that do not exist.
- Indexes on `Organization.ownerId` and `OrganizationMember.userId` support
  the list and access queries used by onboarding.

Prisma exposes these relationships as `Organization.owner`,
`Organization.members`, `User.ownedOrganizations`, and
`User.organizationMembers`.

## Authentication and authorization

Authentication answers “which user made this request?” Every organization route
uses `AuthGuard`, which resolves the Better Auth session and places the user on
the Nest request. `@CurrentUser()` passes that session-derived user to the
controller; the client cannot choose a different user ID.

Authorization answers “may that authenticated user access this organization?”
`AccessService.assertOrganizationMember` permits the explicit owner or a user
with a matching membership row. An authenticated non-member receives HTTP 403.
A request without a valid session is rejected earlier with HTTP 401.

## DTO validation

`CreateOrganizationDto` is inferred from a strict Zod schema:

- `name` is trimmed, required, and limited to 120 characters.
- An explicit `slug` is limited to 80 characters.
- Slugs contain lowercase letters or numbers separated by single hyphens.
- Unknown fields are rejected rather than silently stored.

When no slug is supplied, the service derives one from the organization name
and adds a numeric suffix if needed. PostgreSQL's unique constraint remains the
final authority; a concurrent duplicate is translated to HTTP 409.

## Request flow

```text
Authenticated request
  -> OrganizationsController
  -> AuthGuard / CurrentUser
  -> ZodValidationPipe (for create)
  -> OrganizationsService
  -> AccessService (for selected organization)
  -> Prisma
  -> PostgreSQL Organization + OrganizationMember
```

The implemented routes are:

- `POST /api/organizations` — create an organization and OWNER membership.
- `GET /api/organizations` — list organizations owned by or joined by the
  current user.
- `GET /api/organizations/:id` — retrieve one organization after membership
  authorization.

## Verification

`backend/test/organizations.e2e-spec.ts` verifies creation, OWNER membership,
user-scoped listing, selected-organization retrieval, non-member rejection,
unauthenticated rejection, duplicate slugs, and invalid slugs against
PostgreSQL.
