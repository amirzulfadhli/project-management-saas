# FlowPlan organization frontend

## Route and request flow

The protected /organizations route is the entry point for organization
onboarding. AuthBoundary first resolves the Better Auth session. Authenticated
pages then render inside OrganizationProvider, which requests the current
user's organizations through the existing API client:

    Browser session cookie
      -> GET /api/organizations (credentials: "include")
      -> NestJS AuthGuard
      -> current user's Organization rows
      -> OrganizationProvider
      -> onboarding, selector, or selected workspace

The frontend never sends a user ID. NestJS derives the user from the Better
Auth session, and the backend remains responsible for membership authorization.

## Controlled creation form

CreateOrganizationForm keeps name and slug in React state. Each input receives
its value from that state and updates it through onChange, making it a
controlled form.

The slug is initially derived from the name, but it becomes independently
editable after the user changes it. On submit, validateOrganizationForm applies
the same visible limits used by the backend:

- name is trimmed, required, and at most 120 characters;
- an optional slug is at most 80 characters;
- a slug uses lowercase letters or numbers separated by single hyphens.

This client validation gives immediate, accessible feedback. It is not a
security boundary. POST /api/organizations still runs the strict backend Zod
schema and PostgreSQL's unique constraint. HTTP 400 and 409 responses are shown
from the shared ApiError instead of being replaced with generic success UI.

## Loading, empty, error, and success states

OrganizationProvider owns the organization list's loading and request-error
states before the application shell is shown.

- A signed-in user with an empty list is redirected to /organizations.
- The page explains that no organizations exist and shows the creation form.
- A failed list or selected-organization request shows ErrorState with retry.
- A pending create disables the submit button and changes its label.
- A successful create updates the TanStack Query cache and shows a confirmation
  screen before the user enters the workspace.

The creation response includes the new OWNER membership because that behavior
belongs to the existing NestJS/Prisma service, not the form.

## Organization selection state

OrganizationProvider is the single source of frontend selection state. It:

- selects the first available organization when no valid selection exists;
- stores the selected organization ID in
  flowplan.selected-organization-id;
- checks the stored ID against the authenticated user's fresh organization
  list before using it;
- retrieves the selected organization through GET /api/organizations/:id, so
  backend membership authorization still applies;
- exposes the selection to the header switcher and organization list.

The ID in local storage is only a UI preference. It grants no access. An
unauthenticated request receives HTTP 401, and a non-member selected-
organization request receives HTTP 403 from NestJS.

TanStack Query data is cleared when the authenticated user identity changes.
This prevents a client-side sign-out/sign-in from briefly displaying the
previous user's cached organizations.

## Navigation responsibilities

After sign-in, the existing auth pages navigate to /. If the organization query
is empty, OrganizationProvider replaces that route with /organizations.
Existing members keep their selected organization (or receive the first valid
one) and can enter the workspace immediately.

Frontend redirects improve the experience, but they do not authorize access.
The NestJS AuthGuard, session-derived user, membership checks, DTO validation,
and database constraints remain authoritative.
