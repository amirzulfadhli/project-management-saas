# FlowPlan repository status

Last verified: 2026-09-12

## Release checkpoint

Organization Administration + RBAC, Files & Attachments, Project Wiki, and
Time Tracking are complete for development and automated verification.
The latest verified baseline is 158 backend unit tests, 105 PostgreSQL E2E
tests, 17 current migrations with no schema drift, and passing frontend
TypeScript, ESLint, and production build checks.

Consolidated browser QA has begun and the first defect-closure pass now requires
manual retesting across Realtime, Notifications, Project administration,
Comments, and Time Tracking. Organization administration, Files, and Wiki also
retain their manual acceptance backlog. Live GitHub App verification is blocked
on public HTTPS. Coolify staging deployment is paused until the external
VPS/domain prerequisites are available. These external and manual acceptance
gates are not claimed complete.

## V1 manual QA defect closure 1

### UI refinement Phase A

The approved Phase A shell/navigation and shared-interaction refinement is
implemented: conventional 4px spacing, restrained radii and semantic surfaces,
route-aware sidebar, mobile navigation, existing Organization Members access,
header Notifications and read-only Account identity/sign-out. Shared dialogs
use native modal behavior with viewport bounds, initial/return focus and nested
scroll locking. Notification read failures retain their visible error surface.
Session changes remount shell-local panels while retaining existing cache clearing.

Phase A verification passes: frontend component tests **30/30 in 5 suites**,
TypeScript, ESLint, changed-file Prettier, production build, normal clean
dependency installation and `git diff --check`. Backend/PostgreSQL suites were
not rerun because their implementation and contracts are unchanged.

See [UI refinement](ui-refinement.md) for scope and the manual acceptance checklist.
No backend, API, realtime handler, schema or database behavior changed in Phase A.
**PHASE A MANUAL UI ACCEPTANCE: PENDING.** V1 functional freeze
remains reopened; automated component checks do not restore it.

### UI refinement Phase B

The persistent Project workspace is implemented with shared context and one
Project subscription across Board, Docs, Files, Activity, Time, GitHub, Members,
and Project settings routes. Resource panels reuse their existing APIs, query
keys and mutation logic rather than opening independent feature dialogs.
Project settings consolidates owner-only edit, duplicate and archive/restore;
Column administration remains Board-local. The compact Projects list exposes
Active/Archived as URL-backed navigation, including refresh/history recovery.

Direct Project access no longer requires retained Organization membership:
explicit Project access is still checked by the existing backend. Choosing
another Organization leaves the current Project for its Project list.
The shared layout removes protected content on denied Project refetch.
Reconnect invalidation now includes Project Files, Docs and GitHub Issue caches.
Docs drafts survive section navigation in account-scoped memory only; successful
save/cancel and account changes clear them. Browser reload/close warns for dirty
drafts; no durable draft storage or concurrency/versioning system was added.

Frontend regression tests pass **67/67 in 9 suites**, including subscription
lifecycle, authority, archives, legacy Task links, resource extraction and draft
retention. TypeScript, ESLint, changed-file Prettier, production build and
`git diff --check` pass; final verification details are in the UI refinement doc.
No backend, API, database, dependency or Task/drag-and-drop contract changed.
**PHASE B MANUAL UI ACCEPTANCE: PENDING.**
Functional freeze remains reopened until manual acceptance.

### UI refinement Phase C

Task detail and Board interaction refinement is implemented: canonical Task
routes with intercepted sheets/direct pages, reading-first content, visible
Comments and timer controls, explicit editing with account-scoped draft memory,
and consistent links from Board, Home, Tasks, Time and GitHub. Legacy query links
remain supported. Structural Column controls remain owner-only and reuse the
existing manager; drag sensors, ordering, rollback and backend policy are unchanged.

Task detail reads the existing endpoint with Project/Task/user-scoped cache
identity. Deleted/inaccessible Tasks stop rendering protected content; deletion
cancels in-flight detail reads. Realtime/reconnect reconciliation includes open
Task detail and its resources. Dirty fields are not overwritten on refetch;
partial updates avoid reverting unrelated concurrent changes. Same-field writes
remain last-committed-write, not optimistic concurrency control.

Final automated verification: the full frontend suite passed **95/95 in 12
suites**. Final review then found and corrected a timer-error message hidden
inside the collapsed manual-time disclosure; the affected detail suite passes
**15/15**, including its new regression test. TypeScript, ESLint, changed-file
Prettier, production build and `git diff --check` pass.
No backend, migration, database or dependency changes. Historical backend and
PostgreSQL counts above were not rerun for this frontend-only phase.
**PHASE C MANUAL UI ACCEPTANCE: PENDING.**
V1 functional freeze remains reopened.

### UI refinement Phase D

Resource and collaboration refinement is implemented: independent Notification
read actions and reliable Task/Project destinations; URL-selected Docs with
page-scoped session drafts; clear Project/Task file scope and recoverable paging;
live Task links from Activity; compact completed Time totals and active-timer
Task navigation; separated GitHub connection administration, explicit import
Column selection and accurate inbound-sync semantics.

Repository disconnect/replacement now reconciles the current user's known Task
Issue links in the affected Project. Cross-Organization Task sheets derive
authority from their accessible target Organization without changing the
background selection. Denied resource refetches hide protected cached content.
Backend authorization remains authoritative; no API, backend, schema, database,
dependency or Board drag-and-drop contract changes are included.

See [UI refinement](ui-refinement.md#phase-d--resource-and-collaboration-experience)
for implementation boundaries and the manual checklist.
The full frontend suite passes **118/118 in 13 suites**; after a final Docs
save-in-flight guard, affected resource suites pass **25/25 in 2 suites**.
TypeScript, ESLint, changed-file Prettier, production build and
`git diff --check` pass. Historical backend/PostgreSQL results were not rerun.
**PHASE D MANUAL UI ACCEPTANCE: PENDING. Phase E has not begun.**
V1 functional freeze remains reopened; no live GitHub/browser acceptance is claimed.

### Previous defect-closure verification

V1 functional freeze is **REOPENED** after manual acceptance found that several
implemented capabilities were either hard to discover or did not reconcile an
already-open surface. The first closure pass makes Active/Archived Projects an
explicit Projects-page choice, labels the header Notifications entry point,
and carries Task identity from the Organization Tasks list into the existing
Task dialog. The Task dialog now labels its Comments, Files, Time tracking, and
GitHub sections explicitly, so Comments and Task timers are reachable from
both the board and the top-level Tasks workflow.

Compact `TASK_DELETED` events now remove the deleted Task from the affected
Project cache immediately. An open/deep-linked Task dialog therefore closes
when the authoritative Task disappears and displays "This task is no longer
available." Project-member events explicitly refetch active Project roster and
detail queries, covering add, role-change, and remove reconciliation for other
connected clients while the gateway continues to reauthorize revoked access.

Backend persistence and privacy contracts for Comments, Notifications, and
Time Tracking were already present; this pass does not replace them. In
particular, Notification `readAt` remains PostgreSQL-backed and user-private.
Automated regression does not constitute manual acceptance. Focused realtime
E2E passes 7/7; focused Project, Comment, Notification, membership, and Time
Tracking E2E passes 36/36; the full backend unit suite passes 158/158; and the
full PostgreSQL E2E suite passes 105/105. Backend/frontend static checks and
production builds pass. The pass is therefore **MANUAL QA DEFECT CLOSURE #1
COMPLETE — RETEST REQUIRED**; functional freeze must not be restored until a
user retests the affected flows.

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

This is deployment foundation, not proof of a public deployment. The local Git
repository and CI foundation described below are now complete; the next
deployment gate is a real HTTPS staging/Coolify deployment with proxy, cookie,
CORS, migration, restart, and smoke verification, once VPS/domain access exists.

## Git repository and CI foundation

FlowPlan now has an independent repository boundary at this directory rather
than relying on the unrelated Git repository in the developer's home folder.
Local environments, generated Prisma Client code, dependencies, build output,
logs, caches, and local database files are ignored; environment examples,
package lockfiles, the Prisma schema, and all seventeen migrations remain
repository inputs. GitHub Actions performs clean frontend/backend installs and builds plus
backend unit and PostgreSQL-backed E2E verification using disposable CI-only
configuration. Local clean-checkout verification passed from both lockfiles,
and the first GitHub-hosted CI run passed. Each checkpoint remains subject to
the normal push/hosted-CI gate before staging.

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
- Tasks now have database-enforced dense ordering within each Column. The
  dedicated move endpoint is transaction-serialized per Project, and the board
  provides pointer, touch, and keyboard-capable drag-and-drop with scoped
  optimistic updates, rollback, and authoritative refetch.
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
- GitHub Integration Core Backend provides owner-authorized, Project-nested
  repository connection plus raw-body HMAC verification, repository-scoped
  event normalization, and idempotent delivery storage for push, pull request,
  and issue webhooks. No GitHub token or webhook secret is stored or returned.
- GitHub App installation is protected by FlowPlan authentication, hashed
  single-use state, and PKCE. Verified installations retain stable account
  metadata only; repository discovery and Project connection use fresh,
  short-lived installation tokens that are never stored or returned.
- Project and Task attachments use authenticated nested APIs, opaque local
  storage keys, compact PostgreSQL metadata, owner/uploader deletion policy,
  Project Activity, and scoped realtime reconciliation. Storage remains private
  behind backend authorization.
- Project detail now provides a scoped GitHub modal for App installation,
  installation selection, paginated repository discovery, verified connection,
  and confirmed disconnection. Backend authorization remains authoritative.

## ⚠️ Partially implemented

- GitHub App installation/discovery and its Project frontend exist, but live
  GitHub credentials and public HTTPS callback/webhook verification remain
  pending.
- The frontend route gate is client-side. Backend data remains securely guarded,
  but a future milestone may add server-side route redirects for faster initial
  navigation.
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
- Calendar and timeline workflows.
- Live GitHub App and Issue-sync verification.
- Column reordering; Task ordering and single-instance realtime board
  reconciliation are implemented.
- Redis-backed multi-instance Socket.IO, BullMQ, AI features, and production
  deployment.

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
scoping, assignment, Comments, and per-Column ordering are now complete.
Realtime updates, notifications, and advanced RBAC remain separate milestones.

## Task frontend scoping milestone

Task Frontend Organization/Project Scoping and Contract Alignment is safe to
mark **COMPLETE**. Safe assignee selection is also complete. Drag-and-drop
ordering, comments, notifications, realtime updates, Teams, and advanced RBAC
remain separate milestones. Task ordering and drag-and-drop are now complete.

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
  Invitations and advanced/custom RBAC remain separate future work.

## Board and Column milestone

Board/Column Core Backend Stabilization is safe to mark **COMPLETE**. The MVP
retains one Board per Project and exposes Project-nested Column list, append,
rename, and safe-delete operations. Frontend management is now complete;
Column reordering remains separate future work. Task ordering and
drag-and-drop are complete. See `docs/boards-columns.md` for the implemented
integrity boundary and the remaining database-level relationship limitation.

## Board and Column frontend milestone

Board/Column Frontend Management is safe to mark **COMPLETE**. The existing
Project board now consumes a dedicated Project-scoped Column query and provides
a compact management dialog for add, rename, and safe empty-Column deletion.
Column reordering remains intentionally unimplemented. Task ordering and
drag-and-drop now use their own verified backend contract.

## Task ordering and drag-and-drop milestone

Task Ordering + Drag-and-Drop Core is safe to mark **COMPLETE**. Migration 10
deterministically ranks existing Tasks by `createdAt, id`, rejects historical
Task/Column Project contradictions, and enforces unique `(columnId, position)`.
Create, reorder, cross-Column move, and delete serialize through a Project row
lock and preserve dense positions. The frontend uses dnd-kit and only the exact
Project Task cache for optimistic movement and rollback. Same-Column reorder is
not Activity noise; real Column movement remains `TASK_MOVED`. Column reorder
and realtime collaborative conflict presentation are explicitly out of scope.

## Task drag-and-drop browser acceptance milestone

Task Drag-and-Drop Manual Browser Acceptance + Responsive Board Polish is safe
to mark **COMPLETE**. Real Microsoft Edge acceptance covers pointer placement at
the beginning, middle, and end of a Column; cross-Column and empty-Column moves;
touch movement; keyboard pickup, arrow movement, drop, and cancellation; rapid
successive movement; and a stale destination failure. DOM order matched the
authoritative backend order after successful moves. A rejected stale move
restored the optimistic Task cache, displayed an actionable error, refetched
Tasks, and refreshed the exact Project Column cache.

The acceptance pass corrected keyboard-specific target-index calculation,
restored keyboard focus to the moved Task handle after persistence, enlarged
the drag handle to a 40-by-40-pixel touch target, and collapsed the fixed mobile
sidebar to a navigation icon rail. At a 390-pixel viewport the document has no
horizontal overflow, the board retains its own horizontal scroll area, header
actions wrap, and the Task dialog remains viewport-bound. Column reordering and
realtime conflict presentation remain intentionally out of scope.

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

## GitHub integration core backend milestone

GitHub Integration Core Backend Foundation is implemented. Repository reads
follow existing Project access; connect/disconnect requires Organization owner
or explicit Project `OWNER`. Incoming webhooks are verified against the exact
raw body, mapped by stable external repository ID, normalized without raw
payload storage, and made idempotent by GitHub delivery ID. Repository
connect/disconnect produces user-attributed Activity; webhook Activity waits for
an honest external/system-actor model. Live GitHub App credentials, discovery,
webhook registration, and Issue/Task sync were separate follow-up milestones.

GitHub Integration Core Backend Foundation is PostgreSQL-verified. The focused
GitHub suite passes 8/8 tests, the complete backend E2E suite passes 65/65 tests
across 10 suites, and all eight migrations deploy from zero to a disposable
database. The disposable database was removed after verification. Live GitHub
App/API delivery remains intentionally unverified until credentials and a
public HTTPS callback are available.

## GitHub App installation and discovery milestone

GitHub App Installation + Verified Repository Discovery is locally complete.
The backend creates a state-bound App installation URL, validates the setup
redirect under the initiating FlowPlan session, completes GitHub App user OAuth
with PKCE, verifies installation access against GitHub, and stores only stable
installation/account metadata. Installation and user access tokens remain
transient. Discovery is scoped to the FlowPlan user who connected the
installation, and Project connection accepts only an installation record ID and
external repository ID; repository names, URL, visibility, archive state, and
default branch are derived from GitHub.

The ninth additive migration is applied to development and all nine migrations
deploy from zero. GitHub E2E passes 10/10 tests and the full PostgreSQL suite
passes 67/67 across 10 suites using a mocked external GitHub boundary. Live App
creation and public HTTPS callback/webhook delivery remain pending and are not
claimed as verified.

## GitHub installation and repository frontend milestone

GitHub Installation / Repository Connection Frontend is safe to mark
**COMPLETE LOCALLY**. The Project-scoped modal consumes only verified backend
contracts, opens App installation in a popup, detects callback completion from
the authenticated installation list, supports multiple installations and
paginated repositories, and updates only the current Project repository and
Activity caches. Connected metadata is visible to collaborators; only
Organization owners or explicit Project `OWNER`s receive mutation controls.

TypeScript, ESLint, Prettier, and the Next production build are verified. Live
installation and callback behavior remain pending because a configured GitHub
App and public HTTPS backend are unavailable; no live success is claimed.

## GitHub Issue and Task synchronization milestone

GitHub Issue ↔ FlowPlan Task Sync Core is **COMPLETE LOCALLY**. Collaborators
can page through Issues from the Project's verified connected repository, link
an existing Task, or explicitly create an ordered Task in a selected Column.
The server accepts no repository metadata from the browser: installation,
owner, repository, URL, and Issue identity are derived through a transient
installation token and the stored verified connection.

The sixteenth additive migration upgrades the unused legacy `Issue` scaffold
without discarding data and enforces one Issue per Task plus repository-scoped
external-ID and number uniqueness. Project-row serialization and database
constraints protect concurrent link/import requests. Signed, idempotent Issue
webhooks update linked Task title/description and GitHub state without moving
Columns; unavailable events preserve the Task, and unlinking stops future
synchronization. FlowPlan-to-GitHub writes, automatic imports, assignee
mapping, and PR sync remain intentionally deferred.

Focused GitHub E2E passes 12/12, the complete PostgreSQL regression passes
103/103 across 16 suites, and the full backend unit suite passes 157/157 across
27 suites. All sixteen migrations deploy from zero, development and fresh
schemas have no drift, and frontend TypeScript, ESLint, formatting, and
production build pass. Live Issue synchronization remains blocked on public
HTTPS and live GitHub App credentials; no live result is claimed.

## V1 workflow correctness and authorization closure

V1 Workflow Correctness + Authorization Closure is **COMPLETE**. Project
metadata updates, archive, restore, duplication, and structural Column
mutations now require either Organization `OWNER` or explicit Project `OWNER`
authority. Ordinary inherited/explicit collaborators retain normal read and
Task collaboration access, including Task movement between owner-managed
Columns. Backend checks remain authoritative, while the frontend hides only
the administrative controls the current user cannot use.

Active and archived Project lists have distinct Organization-scoped query
keys. The Projects surface intentionally switches between the two views, and
restore preserves the original Project, Board, Columns, Tasks, membership, and
history. `PROJECT_RESTORED` is recorded atomically and published through the
existing compact post-commit realtime channel. Project-list invalidation is
limited to the cached Project's Organization.

Archive, restore, and duplication retain compact Project Activity. Structural
Column changes continue to publish cache invalidation but intentionally do not
add Activity noise. None of these administration actions creates a private
Notification.

Duplication remains conservative: basic Project metadata, optional Team,
Board name, and ordered Column names are copied into a new active Project with
the duplicator as its only explicit owner. Tasks, Comments, prior Activity,
Notifications, Files, Wiki pages, Time entries, memberships, repository/Issue
links, webhook deliveries, and other external identities are not copied.

Board Column/position is now the only writable Task workflow state. The
legacy `Task.status` database column is preserved non-destructively but removed
from create/update/list DTOs, filters, frontend types, and new Activity writes.
Historical status Activity remains renderable. The seventeenth additive
migration also makes GitHub Issue external/Project identity required and adds
a composite Repository/Project foreign key, after fail-safe checks for legacy
null or mismatched rows.

Focused Project/Column/Task/Activity/GitHub E2E passes 45/45 and focused
Activity/realtime E2E passes 13/13. The complete backend unit suite passes
158/158 across 27 suites, and the complete PostgreSQL regression passes
105/105 across 16 suites. All seventeen migrations deploy from zero;
development and fresh schemas have no drift. Backend/frontend TypeScript,
ESLint, formatting, and production builds pass. Manual consolidated browser
QA, deployment/backups, and live GitHub verification remain separate gates.

## Realtime collaboration core milestone

Realtime Collaboration Core is safe to mark **COMPLETE** for the current
single-backend MVP. The `/realtime` Socket.IO namespace authenticates Better
Auth session cookies, checks the configured frontend origin, and authorizes
strict Project subscriptions through the existing access policy. Compact
post-commit events cover Project, membership, Column, Task, Comment, and
repository mutations; every delivery rechecks current Project access.

The frontend owns one session-bound socket and reconciles only Project- or
Task-scoped TanStack Query caches. Same-Column Task reorder emits realtime
invalidation while remaining intentionally absent from Activity. Reconnect
resubscribes and refetches authoritative state, and REST remains functional
when the socket is unavailable. Focused realtime unit tests pass 7/7, the
PostgreSQL realtime suite passes 7/7, the full backend unit suite passes
103/103, and the full PostgreSQL E2E suite passes 75/75. Multi-instance
delivery requires a future shared Socket.IO adapter; notifications, presence,
chat, and durable replay remain separate work.

## Notifications core milestone

Notifications Core — Backend + Frontend is safe to mark **COMPLETE**, with
manual browser acceptance explicitly deferred. A fail-safe eleventh migration
replaces the unused legacy scaffold with private user/actor/Project scope,
compact metadata, timestamped read state, and inbox indexes. Assignment,
Comment, and membership recipient decisions are centralized, actor-suppressed,
Project-access checked, deduplicated, and written atomically with their domain
mutation.

The Better Auth protected API provides deterministic cursor listing, unread
count, idempotent single-read, and mark-all-read operations with strict
cross-user isolation. Authenticated sockets join a server-derived user room and
receive compact post-commit invalidations without Project-room leakage. The
header bell uses only notification-scoped TanStack Query caches and provides a
responsive list, read controls, and Project navigation. Backend unit tests pass
112/112, focused PostgreSQL notification E2E passes 6/6, and the complete E2E
suite passes 81/81. All eleven migrations deploy from zero with no schema drift.
Interactive browser acceptance remains reserved for the consolidated QA
milestone and is not claimed here.

## Organization administration and RBAC milestone

Organization Administration + RBAC Hardening is safe to mark **COMPLETE** for
development and automated verification. The existing OWNER/MEMBER model now
drives Organization administration through authenticated nested list,
existing-user add, role-change, and remove endpoints. Mutations serialize on
the Organization row, preserve at least one OWNER under concurrent requests,
and keep the required primary owner reference aligned with a remaining owner.

Organization membership remains distinct from explicit Project membership.
Removing it revokes inherited Project access immediately but preserves any
explicit Project access. Affected Project rooms are reauthorized after commit,
evicting only sockets that lose their final access path. Organization Activity
and Notifications are deferred because those schemas require honest Project
scope. No schema migration was required.

Backend unit tests pass 121/121. The focused Organization administration
PostgreSQL suite passes 6/6, and the complete PostgreSQL E2E suite passes
87/87. Frontend TypeScript, ESLint, formatting, and production-build checks are
verified. Manual browser acceptance for the administration dialog remains in
the consolidated QA backlog and is not claimed here.

## Files and attachments milestone

Files & Attachments Core — Backend + Frontend is safe to mark **COMPLETE** for
development and automated verification. The unused legacy `File` scaffold is
now a required-Project attachment record with optional Task scope, unique
opaque storage key, uploader metadata, and deterministic Project/Task indexes.
The twelfth fail-safe migration found zero legacy rows, deploys from zero, and
leaves no schema drift.

`FileStorage` isolates domain logic from providers; the current
`LocalFileStorage` implementation confines UUID-keyed objects to an
application-owned root. Extension/MIME checks, lightweight binary signatures,
text NUL rejection, a 10 MiB cap, authenticated downloads, safe disposition
headers, and explicit cross-resource compensation protect the local MVP path.
Uploader, explicit Project OWNER, and Organization OWNER deletion is enforced
by the backend. Upload/delete Activity is transactionally coupled to metadata,
while compact post-commit realtime events invalidate only Project/Task
attachment caches. Attachments intentionally create no Notifications.

Backend unit tests pass 136/136, focused PostgreSQL plus isolated-storage E2E
passes 5/5, and the complete PostgreSQL suite passes 92/92 across 14 suites.
Prisma validation/generation, migration status, fresh deployment of all twelve
migrations, and schema drift are verified. Frontend TypeScript, ESLint,
formatting, and production build are verified. The backend container build and
an isolated named-volume container-replacement persistence check also pass;
the disposable volume was removed afterward. Files UI manual browser acceptance
remains deferred to the consolidated QA backlog and is not claimed.

## Project Wiki / documentation milestone

Project Wiki / Documentation Core — Backend + Frontend is **COMPLETE** for
development and automated verification. The unused, empty single-page `Wiki`
scaffold now maps to a multi-page `WikiPage` model with creator metadata,
five-level hierarchy, deterministic dense sibling positions, and Project-row
serialization for hierarchy/order mutations. The thirteenth migration fails
safely rather than inventing authorship if an installation has legacy rows.

Any Project collaborator may list, read, create, edit, and move documentation.
The creator, an explicit Project OWNER, or Organization OWNER may delete a leaf;
pages with children return a conflict instead of cascading a subtree. Markdown
is limited to 96 KiB and rendered without executable raw HTML or remote image
loading. Activity is transactionally recorded without bodies, and compact
post-commit realtime events invalidate only Wiki and Activity caches. Ordinary
Wiki changes intentionally create no Notifications.

The Project **Docs** modal provides tree navigation, root/child creation,
explicit save/cancel editing, safe parent movement, creator/owner deletion
controls, and dirty-change confirmation. Automated verification is recorded
for this milestone; Wiki UI manual browser acceptance remains deferred.

Backend unit tests pass 144/144 across 24 suites. Focused Wiki PostgreSQL E2E
passes 5/5, and the complete PostgreSQL regression passes 97/97 across 15
suites. Prisma generation/validation, development migration status, fresh
deployment of all thirteen migrations, and zero schema drift are verified.
Backend TypeScript, ESLint, formatting, and production build pass. Frontend
TypeScript, ESLint, changed-file formatting, and production build pass.

## Time tracking core milestone

Time Tracking Core — Backend + Frontend is **COMPLETE** for development and
automated verification. The empty legacy `TimeLog` scaffold now maps to a
Project-scoped `TimeEntry` model with UTC intervals, integer-second duration,
and a database-enforced one-active-timer-per-user invariant. The migration
fails safely rather than guessing legacy Project scope or duration units; the
read-only preflight found zero legacy rows. A forward-only timestamp alignment
migration was added after drift verification identified legacy column-type and
default differences.

Current collaborators may record their own time and see Task/Project totals.
Task history is private to its author; Project/Organization owners receive
per-user aggregate visibility, while ordinary members do not. User-row locking
plus a PostgreSQL unique constraint protects concurrent starts. Time tracking
creates neither Activity nor Notifications. Compact post-commit realtime
events invalidate only active timer, affected Task time, and Project time
caches.

The Task **Time** tab supports start/stop, bounded manual entries, totals, and
the caller's paginated history. The Project **Time** dialog provides total,
personal, per-Task, and owner-authorized per-user summaries. Backend unit tests
pass 148/148 across 25 suites. Focused Time Tracking PostgreSQL E2E passes 4/4,
and the complete PostgreSQL regression passes 101/101 across 16 suites. All 15
migrations deploy from zero and both development and fresh schemas have zero
drift. Frontend TypeScript, ESLint, changed-file formatting, and production
build pass. Time Tracking UI manual browser acceptance remains deferred.
