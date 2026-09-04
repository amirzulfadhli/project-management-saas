# FlowPlan repository status

Last verified: 2026-09-04

## Production deployment foundation

Production configuration validation, Node 22 runtime declarations,
PostgreSQL-backed readiness, graceful Nest shutdown, multi-stage frontend and
backend images, a local production-like Compose topology, CI, and deployment
documentation are implemented. The misleading Calendar/Wiki/Search/
Notifications/Profile placeholders were removed and the frontend no longer
downloads Google Fonts during its build.

Local production-like Docker verification is complete. Frontend, backend, and
migration images built; PostgreSQL, backend, and frontend became healthy; the
one-shot migration container applied all seven migrations; `/health`, `/ready`,
and the frontend returned HTTP 200; and application restarts preserved
readiness and frontend availability. The stack was stopped without deleting
the persistent PostgreSQL volume. Prisma tooling stages now install OpenSSL so
Prisma can detect the correct Debian Bookworm ABI; the final runner remains
minimal.

This is deployment foundation, not proof of a public deployment. The next
milestones are Git/GitHub CI stabilization followed by a real HTTPS
staging/Coolify deployment with proxy, cookie, CORS, migration, restart, and
smoke verification.

## Git repository and CI foundation

FlowPlan now has an independent repository boundary at this directory rather
than relying on the unrelated Git repository in the developer's home folder.
Local environments, generated Prisma Client code, dependencies, build output,
logs, caches, and local database files are ignored; environment examples,
package lockfiles, the Prisma schema, and all seven migrations remain repository
inputs. GitHub Actions performs clean frontend/backend installs and builds plus
backend unit and PostgreSQL-backed E2E verification using disposable CI-only
configuration. A real GitHub-hosted workflow run remains the final remote check
before Coolify staging.

## ✅ Working

- Active top-level applications are `frontend/` (Next.js 16, React 19,
  TypeScript, Tailwind 4, TanStack Query) and `backend/` (NestJS 11, Better
  Auth 1.7, Prisma 7, PostgreSQL).
- Frontend and backend TypeScript checks and production builds pass.
- Prisma configuration is discovered automatically, the schema validates, and
  the migrations reproduce the current schema on a fresh PostgreSQL database.
- Better Auth owns `/api/auth/*` through the NestJS catch-all bridge.
- Email/password sign-up and sign-in work.
- Session cookies reach Nest from the frontend origin and all `Set-Cookie`
  headers are preserved.
- Session retrieval, protected API access, sign-out, and session invalidation
  are verified end to end.
- `OrganizationsController`, `ProjectsController`, and `TasksController`
  use `AuthGuard`; their services contain access checks, validation, and CRUD
  logic.
- Frontend sign-in/sign-up pages, session gating, and sign-out are connected to
  the Better Auth React client.
- Backend unit tests and PostgreSQL-backed e2e tests pass.
- Organization onboarding is verified end to end: creation, automatic OWNER
  membership, user-scoped listing, selected-organization retrieval, and
  non-member/unauthenticated rejection.
- The frontend organization flow loads the authenticated user's organizations,
  redirects empty accounts to onboarding, creates organizations, persists a
  validated workspace selection, and surfaces loading/error/success states.
- Project core backend lifecycle is PostgreSQL-verified: strict creation and
  update validation, transactional OWNER/Board/Column initialization,
  organization-scoped active/archive listing, consistent detail responses,
  authorization, soft archive, and duplication.
- Project frontend lists and recent Projects are scoped to the selected
  Organization, Project creation derives organizationId from OrganizationProvider,
  and Project mutations isolate or invalidate only the affected Organization
  cache.
- Project create/update/duplicate responses use the full Project detail type,
  archive wording matches soft-archive behavior, and mutation failures are
  surfaced inline.
- Task core lifecycle is PostgreSQL-verified: strict create/update/query
  validation, Project/Column boundary enforcement, assignment access checks,
  compact response contracts, same-Project movement, isolated lists, and
  authorized permanent deletion.
- Task frontend queries and mutations use Project-scoped caches, Project boards
  wait for coherent Organization/Project context, Organization-level Task views
  aggregate active Project caches, and permanent-delete/error semantics match
  the stabilized backend.
- Project Membership Administration exposes authenticated, Project-nested
  roster list/add/change-role/remove routes with strict DTOs, Organization
  eligibility, transaction-serialized owner invariants, self-removal, and
  PostgreSQL-backed lifecycle coverage.
- Project detail now provides a Project-scoped explicit-member roster with
  eligible Organization-member selection, role management, confirmed removal,
  server error feedback, and cache isolation. Task create/edit supports safe
  assignment from the complete Organization-access plus Project-roster union.
- Board/Column core backend operations are Project-nested and
  PostgreSQL-verified: strict names, server-derived Board ownership,
  transaction-serialized append positions, scoped rename/delete, explicit 409
  for non-empty deletion, and strengthened Task/Column integrity checks.
- Project detail now has frontend Column management for Project-scoped listing,
  append, rename, and confirmed empty-only deletion. Its TanStack Query cache is
  isolated by Project, Board ordering remains server-defined, and non-empty
  deletion errors preserve all Columns and Tasks.
- Activity Core Backend is PostgreSQL-verified. Project, Task, and membership
  mutations record typed Project-scoped history atomically, and authenticated
  collaborators can read deterministic cursor-paginated feeds.
- Comments Core Backend is PostgreSQL-verified. Task-nested listing, creation,
  author-only edits, owner moderation, thread integrity, tombstone deletion,
  privacy-safe Activity events, and Task-delete cascading are implemented.
- Project detail now exposes a Project-scoped, cursor-paginated Activity modal,
  and existing Task dialogs provide scoped Comment threads with create, reply,
  author edit, confirmed moderation/delete, and tombstone UX.

## ⚠️ Partially implemented

- GitHub credentials/provider configuration exists, but there is no GitHub
  sign-in control or verified OAuth callback flow yet.
- The frontend route gate is client-side. Backend data remains securely guarded,
  but a future milestone may add server-side route redirects for faster initial
  navigation.
- Task features are implemented beyond the original checklist, but they have
  not yet received milestone-level running e2e verification.
- A duplicate starter scaffold remains under
  `backend/project-management-saas/`. It is not imported by either active
  application and was left untouched pending a deliberate repository cleanup.
- Backend lint has pre-existing unsafe-mock warnings in task service unit tests.
  There are no lint errors.
- The legacy nullable `User.password` column is not used by Better Auth
  (password hashes live in `Account.password`). It was preserved until any
  historical user data can be audited, avoiding a destructive migration.

## ❌ Broken

- No known authentication blocker remains after this milestone.

## ⬜ Not implemented

- Team UI/API and most collaboration features.
- Notifications, files, wiki, calendar, and timeline workflows.
- GitHub integration beyond provider configuration.
- Redis, Socket.io/WebSockets, BullMQ, AI features, and production deployment.

## Authentication milestone

Authentication is safe to mark **COMPLETE** for the current local
email/password scope. GitHub OAuth remains a separate, later verification
milestone.

## Organization backend milestone

Organization onboarding is safe to mark **COMPLETE** for backend/database
scope.

## Organization frontend milestone

Organization onboarding is safe to mark **COMPLETE** for frontend scope. The
combined Organization onboarding milestone is complete. Invitations, membership
management, teams, and advanced RBAC remain separate future milestones.

## Project core backend milestone

Project Core Backend Stabilization is safe to mark **COMPLETE**. Frontend
organization scoping and Project membership administration are now complete.
Teams, further task workflows, and advanced RBAC remain separate milestones.

## Project frontend organization-scoping milestone

Project Frontend Organization Scoping is safe to mark **COMPLETE**. The
remaining Project work is separate: Teams, further task workflows, board
interaction, realtime updates, and advanced RBAC.

## Task core backend milestone

Task Core Backend Stabilization is safe to mark **COMPLETE**. Frontend Task
scoping and workflow UX, per-Column Task ordering, realtime updates, comments,
notifications, and advanced RBAC remain separate milestones.

## Task frontend scoping milestone

Task Frontend Organization/Project Scoping and Contract Alignment is safe to
mark **COMPLETE**. Safe assignee selection is also complete. Drag-and-drop
ordering, comments, notifications, realtime updates, Teams, and advanced RBAC
remain separate milestones.

## Project membership milestones

- Project Membership Audit — ✅ COMPLETE. The Prisma model, access inheritance,
  role behavior, Task-assignee assumptions, frontend surface, and security
  risks were inspected without implementation changes.
- Membership Design/Preparation — ✅ COMPLETE. The nested API contract,
  authorization policy, error semantics, last-owner/self-removal invariants,
  transaction strategy, Task-assignment behavior, index decision, and
  PostgreSQL e2e matrix are finalized in `docs/project-membership.md`.
- Membership Administration Backend — ✅ COMPLETE. Project-nested
  list/add/change-role/remove routes are implemented and PostgreSQL-verified.
- Membership Frontend + Safe Task Assignee UX — ✅ COMPLETE. Project-scoped
  roster administration and eligible-assignee selection are implemented.
  Invitations, Organization membership administration, and advanced RBAC
  remain separate future work.

## Board and Column milestone

Board/Column Core Backend Stabilization is safe to mark **COMPLETE**. The MVP
retains one Board per Project and exposes Project-nested Column list, append,
rename, and safe-delete operations. Frontend management is now complete;
Column reordering, Task ordering, and drag-and-drop remain separate future
work. See `docs/boards-columns.md` for the implemented integrity boundary and
the remaining database-level relationship limitation.

## Board and Column frontend milestone

Board/Column Frontend Management is safe to mark **COMPLETE**. The existing
Project board now consumes a dedicated Project-scoped Column query and provides
a compact management dialog for add, rename, and safe empty-Column deletion.
Column reordering, Task ordering, and drag-and-drop remain intentionally
unimplemented because no supporting backend contracts exist.

## Activity core backend milestone

Activity Core Backend Stabilization is safe to mark **COMPLETE**. Activity has
required Project scope, optional structured metadata, a feed index, an internal
transaction-compatible recorder, and a read-only Project-nested API. Project,
Task, and membership events are committed atomically with their domain change.
Notifications, realtime delivery, filtering/search, and compliance-grade audit
requirements remain separate milestones.

## Comments core backend milestone

Comments Core Backend Stabilization is safe to mark **COMPLETE**. Comments are
Task-nested, Project-authorized, strictly validated, transactionally integrated
with Activity, and soft-deleted as content-free tombstones. Permanent Task
deletion cascade-removes Comments while preserving Task deletion Activity.
Notifications, mentions, reactions, and realtime delivery remain separate
milestones.

## Activity and Comments frontend milestone

Activity / Comments Frontend Collaboration UI is safe to mark **COMPLETE**.
Project Activity uses a Project-scoped infinite query and compact modal; Task
Comments use a Task-scoped infinite query inside the existing Task dialog.
Pagination, thread reconstruction, author/moderator controls, mutation errors,
and deleted tombstones align with the verified backend contracts. Browser
automation was unavailable in the verification environment, so interactive
click-through remains a manual follow-up; TypeScript, ESLint, formatting, and
the Next.js production build are verified.
