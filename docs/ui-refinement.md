# UI refinement — Phases A–D

Phase A implements the approved shell, navigation, spacing and interaction
foundation. Phase B adds the persistent Project workspace described below.
Phase C adds reading-first Task detail and Board interaction refinement.
Phase D refines resource and collaboration workflows. Phase E has not started.

## Implemented

- Conventional Tailwind 4 numeric spacing (4px base); `h-10` now means 40px,
  not 96px. Compact radius tokens and semantic navigation/raised/selected,
  strong-border and focus colors supplement the existing palette.
- Shared controls have semantic minimum dimensions, coarse-pointer touch
  sizing, visible focus and reduced-motion rules. Existing drag handles retain
  their previous 40px minimum explicitly; their listeners and ordering logic
  are unchanged. Upload controls use the shared target sizing.
- A 224px desktop sidebar with real icons, Home/Projects/Tasks selection,
  Organization switcher, existing Organization Members surface and Manage
  organizations destination. No placeholder settings or search controls.
- Below 768px, labeled workspace navigation opens a native modal drawer.
  Destination selection, browser history and crossing the desktop breakpoint
  dismiss it. A skip link targets the main content.
- A restrained 56px-minimum sticky header retains Notifications and provides an
  Account panel with current session name/email and recoverable sign-out.
  The panel is read-only; profile editing, preferences and a standalone Account
  route are not introduced. Project breadcrumbs remain generic until Phase B's
  shared Project shell can supply authoritative contextual identity.
- Session-keyed shell remounting clears local open-panel state when accounts
  change, alongside the existing AuthBoundary query-cache clearing.

## Shared dialogs and Notifications

`Modal` retains its existing open/onClose/title/size contract and adds optional
header/navigation placement. Native `dialog.showModal()` supplies the top layer,
background inertness and keyboard focus containment. The close control receives
initial focus (avoiding automatic mobile text-input focus), close restores the
connected trigger, and reference-counted scroll locking supports nesting.
Escape and outside clicks call the parent's close/discard policy; a nested
cancel does not dismiss its parent. Headers remain outside the scrollable body,
and dialogs have viewport bounds using dynamic viewport units.

Notifications use this same primitive in a compact header panel. The existing
private list/count keys, lazy list loading, pagination, read/read-all endpoints,
realtime invalidation remain unchanged. Phase D adds the navigation refinements below.
Read/unread labels supplement color. Count failure is not presented as zero.
A failed mark-read keeps its error visible instead of closing and navigating.
Phase A did not introduce separate item actions. Phase D adds independent read
actions; new categories, inbox routes and preference controls remain excluded.

## Verification boundary

The frontend has focused Jest + Testing Library component tests, using jsdom
without launching a browser or connecting to a backend. CI runs them before the
frontend build. Dialog open/close are emulated only in tests: native inertness,
Tab containment, layout and assistive-technology behavior are **not** claimed
browser-verified. Spacing tests compile representative Tailwind utilities.

Final automated verification: 30/30 frontend tests in 5 suites, TypeScript,
ESLint, changed-file Prettier, production build (local API URL), and
`git diff --check` pass. A normal `npm ci` also passed. No existing dependency
version or runtime dependency declaration changed. The attempted Vitest setup
was removed; tests use Jest, consistent with the backend. The dependency audit
reported two pre-existing high-severity advisories (`js-yaml` and `sharp`),
not resolved by this UI-only phase; dependency remediation remains separate.

Backend code, API contracts, query keys, realtime handlers, schema and database
are unchanged. Previously reported backend/PostgreSQL results are historical,
not rerun for this presentation-only phase.

## Required manual acceptance — NOT YET PASSED

- Desktop and approximately 390px: long names, header sizing, sidebar/drawer,
  Organization selection, active navigation, account identity and sign-out.
- Open/close all existing feature dialogs: keyboard Tab/Shift+Tab containment,
  Escape, backdrop, initial focus, trigger restoration, long-title wrapping,
  viewport limits, nested confirmation and background scroll isolation.
- Wiki discard confirmation must still be honored. Task editing retains its
  existing draft/close semantics; improving these belongs to the Task phase.
- Notifications: private account switch, count errors, list pagination, read
  failure/retry, read-all and persistence after refresh. Realtime delivery must
  still reconcile while the panel is open.
- Board pointer/keyboard/touch drag, horizontal scroll, and rollback; inspect
  all shared buttons/forms/upload controls after the spacing normalization.
- Mobile resize/history navigation, screen reader labels and reduced motion.

No manual acceptance or restored functional freeze is claimed by automated
verification. Broader V1 QA and external HTTPS/GitHub/deployment gates remain.

## Phase B — Persistent Project workspace

The shared `/projects/[id]/layout.tsx` loads the existing authorized Project
snapshot and owns `useProjectRealtime`. Its Project ID key resets local state
when changing Projects; navigation between sections retains the same subscription.
The session-bound Socket.IO provider, envelopes and backend authorization are
unchanged. Project access errors unmount all protected section content and
unsubscribe, even when a previously successful snapshot remains cached.

| Destination      | Route                    | Implementation                                     |
| ---------------- | ------------------------ | -------------------------------------------------- |
| Board            | `/projects/:id`          | Existing Kanban, Task dialog and `?task=` links    |
| Docs             | `/projects/:id/docs`     | Extracted Markdown/tree/editor panel               |
| Files            | `/projects/:id/files`    | Existing Project-scoped AttachmentsPanel           |
| Activity         | `/projects/:id/activity` | Extracted cursor-paginated feed                    |
| Time             | `/projects/:id/time`     | Existing totals and authorized breakdown           |
| GitHub           | `/projects/:id/github`   | Existing connection/discovery/import workflows     |
| Members          | `/projects/:id/members`  | Existing explicit roster and owner controls        |
| Project settings | `/projects/:id/settings` | Existing owner-only edit/duplicate/archive/restore |

The persistent header identifies the Project and Organization, preserves the
archive badge, and separates Members/settings from everyday section navigation.
Short descriptions remain visible; longer descriptions expand. Section links use
real URLs and native navigation/history, with horizontal overflow and active-link
visibility on narrow screens. Global breadcrumbs observe only the matching
Project cache and never initiate another Project fetch.

The Projects surface uses one compact list, not a new view system. Active and
Archived are links (`/projects` and `/projects?view=archived`) mapped to the
existing scoped list API. Owner quick actions remain available under each row's
Actions disclosure. Restore remains owner-only. Archiving from settings returns
to the archived list. Duplication copies existing Project/Board structure and
makes the caller its owner; it does not copy source members, Tasks, resource
history, time or external identities.

### Preserved access and cache boundaries

- Explicit Project membership can outlive Organization membership. The
  Organization setup gate now permits direct Project routes, without bypassing
  Project REST authorization or granting administrative authority.
- An explicit Organization switch navigates to Projects; it no longer competes
  with the Project layout's automatic adoption of a selectable Organization.
- Resource queries mount only for the selected section. Shared Project,
  membership and Column snapshots support the workspace; Task lists remain
  Board-local. No per-card resource queries or new endpoints were added.
- Resource query keys, paging, write payloads, file security, Markdown rendering,
  timer privacy and GitHub installation/token handling are unchanged.
- Reconnect invalidation additionally covers that user's Project attachments,
  Docs list/detail and GitHub Issue lists. Membership events still refresh
  authoritative shared permissions, and revocation triggers REST reauthorization.
- Members remain an explicit roster, not a claim to enumerate all inherited
  collaborators. Frontend controls remain UX, never the security boundary.

### Docs draft lifecycle

Extracting Docs from its modal would otherwise lose drafts on section navigation.
Its small account-keyed React-memory store retains editor identity, title and
Markdown when the route unmounts. Returning restores the draft; page selection
and Cancel still require discard confirmation. Successful saves clear stored
drafts, including when their response arrives after route unmount. A deleted
page never silently retargets an editing draft to a sibling.

Dirty drafts register a native before-unload warning. Drafts are **not** written
to localStorage, sessionStorage, the query cache or the backend. Reloading/closing
after accepting that warning, signing out or switching accounts discards them.
This is navigation protection, not durable recovery or optimistic concurrency.
Wiki saves retain the existing last-committed-write behavior.

### Phase B verification and manual gate

Final automated results: **67/67 frontend tests in 9 suites** pass. After
correcting the Time-summary fixture's required fields and removing an unsupported
Testing Library query option, the affected resource suite also passes **12/12**,
TypeScript passes, and the Next.js production build passes with the local
`NEXT_PUBLIC_API_URL=http://localhost:3001`. ESLint, changed-file Prettier and
`git diff --check` pass. No dependency installation, database mutation or
backend/PostgreSQL regression rerun was needed for this phase.

Automated coverage includes persistent sections/subscriptions, owner and ordinary
member controls, retained explicit access, final access revocation, archive/list
scoping, restore, duplication, legacy Task links/deletion, inline resource loading,
GitHub non-owner restrictions, reconnect isolation, breadcrumbs and Docs drafts.
No backend/schema/API changes require PostgreSQL reruns for this frontend phase.

Manual acceptance is still required for:

- Every section via direct URL, refresh, Back/Forward and cross-Project navigation.
- Active/Archived restoration, owner actions, explicit-only access and two-user
  membership changes/revocation on both Board and resource pages.
- Reconnect while viewing Docs, Files, Activity, Time and GitHub.
- Docs dirty navigation, Cancel, remote deletion and browser unload warnings.
- Project names/descriptions, section overflow, Actions disclosure, native focus
  behavior and full workflows at desktop and approximately 390px.
- Existing pointer/keyboard/touch drag, Task dialogs, attachment transfers,
  timer operations, notifications and GitHub mock/local flows.

No browser automation or manual acceptance was performed. Live GitHub remains
blocked on public HTTPS/live App credentials. Deployment remains outside scope.
Phase B is checkpointed; V1 functional freeze is not restored.

## Phase C — Task detail and Board interaction

### Identity and presentation

`/projects/:projectId/tasks/:taskId` is the canonical Task destination. Board
opening uses a history push; Home due Tasks, global Task rows, Project Time and
linked GitHub Issues use the same URL. An intercepted root parallel slot presents
in-app navigation as a wide native-dialog sheet, full-width at mobile sizes.
Direct visits and reloads render the same content inside the Project workspace.
Sheet Close/Back returns through history; a direct page has a safe Board fallback.

The slot has explicit default, root and catch-all dismissals, plus a current-path
guard. This prevents a retained parallel slot showing a previous Task after
navigation. Legacy `/projects/:id?task=:taskId` remains supported as a full detail
presentation at that URL, without a second local selected-Task snapshot or a
forced reload. This compatibility handling deliberately does not redirect through
an intercepted replacement that could lose its safe close destination.

Task detail uses the existing authenticated `GET /api/tasks/:id`, checking the
returned Project ID before rendering. Its new query key includes Project, Task
and current user. Direct Task reading does not download the Board's entire Task
list. Sheets reuse the Project permission/query boundary; their subscription
references share the existing session connection and server Project room with
the background workspace. A sheet does not change the background Organization
selection. Backend authorization remains authoritative.

### Reading and editing

Task detail opens read-first: title, Column, assignee, priority, due date and
plain-text description, then the existing Comments and timer controls. Files are
an explicitly opened disclosure. GitHub linkage is visible, with Issue discovery
deferred until the user chooses to link. Manual time/history is a disclosure;
its form stays mounted so collapsing it does not lose input. Project Activity
remains a Project link, not an invented Task feed.

Edit is explicit, with the existing form, Save/Cancel, select-based Column move,
validation and confirmed permanent deletion. Create remains a small dialog with
an explicit destination Column. Cards remain compact, with separate open/drag
targets. Column names wrap, counts remain visible and owner-only contextual
controls open the existing manager at that Column. There is no Column reordering.

Metadata drafts and plain Comment/manual-time inputs survive route unmounts in
account-keyed React memory. Cancel confirms metadata discard; successful saves
clear their drafts, including completed responses after navigation. Browser unload
warns while drafts remain. Account changes/sign-out clear all draft memory.
Nothing is persisted to browser storage, query caches or a draft API. File-input
selections and GitHub chooser state are not durable drafts.

Realtime updates refresh read mode but do not replace a metadata draft. An
updated timestamp warns when the server snapshot changed; saves send only fields
the user changed, so editing a title does not undo a concurrent Column move.
Concurrent writes to the **same field remain last-committed-write**: there is no
backend version check, locking or claim of conflict-free editing.

### Deletion, revocation and reconciliation

A compact Task deletion event cancels in-flight detail fetches and tombstones the
matching detail cache before list reconciliation. A late old response cannot
resurrect the displayed Task. Confirmed local deletion follows the same approach.
Missing/mismatched Tasks and 403/404 reads show only “This task is no longer
available.” Definitively unavailable Tasks discard their Task-scoped drafts.
Transient read failures hide stale detail and offer Retry. Project access failure
continues to remove protected content through the Phase B workspace boundary.

Task/GitHub events invalidate the matching user-scoped detail. Reconnect now
covers opened detail and related Comment, Files, Time and GitHub caches even
when no Board Task list has been loaded. Compact backend event envelopes,
membership reauthorization, Notifications and API mutation contracts are unchanged.

### Verification and remaining acceptance

The full frontend suite passed **95/95 in 12 suites**. Final review corrected
one presentation regression: timer mutation errors now remain visible outside
the collapsed manual-time disclosure. The affected detail suite passes **15/15**
with that additional regression test. TypeScript, ESLint, changed-file Prettier,
the production build and `git diff --check` pass. Backend/PostgreSQL tests were
not rerun because their implementation and contracts are unchanged.
Component tests cover route wrappers/entry points, default reading, edit drafts,
account reset, missing/denied/deleted Tasks, cancellation of stale fetches,
reconnect scoping, Comments/timers, and Board move/index/rollback contracts.
DnD sensors are emulated for contract tests; they do **not** prove physical
pointer/touch/keyboard behavior. Native interception/history, dialog focus and
layout also require manual acceptance.

Required manual retest:

- Board, Tasks, Home, Time and GitHub entry points; direct canonical and legacy
  links; refresh, Back/Forward, sheet dismissal and Project navigation.
- New Task creation, Edit/Save/Cancel, dirty navigation, browser unload, account
  change, Comment/reply/edit drafts and manual-time drafts.
- Two clients: Task update/move/delete, GitHub inbound sync, membership changes,
  final access loss and reconnect while detail is open.
- Pointer/keyboard/touch reorder and cross-Column movement, rollback, focus return,
  empty Columns, contextual administration and horizontal Board scroll.
- Desktop and approximately 390px: long text, sheet viewport bounds, focus,
  Comments/timer discoverability and nested confirmations.

No browser automation/manual acceptance, backend/schema/database changes,
new dependencies, or Phase D implementation were performed.
Functional freeze remains reopened pending manual acceptance.

## Phase D — Resource and collaboration experience

Existing Project sections are refined without new domains, endpoints, schema,
dependencies or backend changes. Phase A–C navigation and Task/Board contracts
remain in place.

- Notifications have independent **Mark read** actions. Opening still awaits
  persisted read state, then follows an existing Task identifier (or a Comment's
  existing Task metadata); otherwise it opens the Project. Read errors keep the
  panel open. Pagination retains loaded items on transient next-page failure,
  but authorization failure hides cached inbox content. A late read response
  after session teardown cannot navigate the new session. List loading stays lazy.
- Docs selection uses `/projects/:id/docs?page=:pageId`, with a collapsible
  document navigator and shareable page link. Drafts are keyed by Project/page
  in account-scoped memory; history restores the matching draft, and returning
  to bare Docs resumes the most recently retained draft. Page selection/Cancel
  keep discard confirmation. Only the selected body is fetched; new-page mode
  does not fetch another body. Pending editor inputs and local edit transitions
  are disabled so an earlier save cannot clear a newly started draft. Late creation
  responses clear saved drafts without redirecting a different section. Access
  denial hides cached content and controls. Markdown security is unchanged.
- Files distinguish Project-only and Task-only collections, wrap filenames and
  display type/size/uploader/date. Existing authenticated transfers and confirmed
  authorized deletion remain intact. Transient pagination errors retain rows and
  offer Retry; access denial removes cached rows and upload controls.
- Activity links only existing live Task relations. Deleted targets stay history,
  without per-row existence requests. Pagination remains bounded and recoverable.
  Task Comments use the surrounding detail scroll instead of a nested scroller.
- Time distinguishes completed totals from running timers. An active timer on
  another Task names and links that Task; it never silently starts a second
  timer. Project totals and the caller's contribution are compact, with existing
  owner-only breakdowns supplied by the backend. No notes become public.
- GitHub separates owner connection management from Issue work. Import requires
  explicit destination Column selection. Link selection clears on pagination;
  mismatched repository snapshots cannot be used. Legacy connections do not
  initiate unsupported Issue discovery. Copy explains no initial Task rewrite
  on linking, later inbound title/body replacement, no automatic Column moves,
  and no outbound Task-edit sync. Disconnect preserves Tasks but removes links.
- Repository changes invalidate only the current user's known Issue links in
  the affected Project plus its discovery queries. Cross-Organization Task
  sheets load target Organization authority only when that Organization remains
  accessible, without switching the background workspace. Membership copy
  distinguishes explicit Project roles from inherited Organization access.

No new Notifications, eager global timer polling, public files, generic resource
graph, durable drafts, or write-conflict architecture is introduced. Same-field
Task and Wiki edits still follow their existing last-committed-write semantics.

### Phase D automated verification

The full frontend suite passed **118/118 tests in 13 suites**. Final review
then protected Docs local edit transitions during a pending save and strengthened
its regression assertion; the affected resource suites pass **25/25 in 2 suites**.
TypeScript, ESLint, changed-file Prettier, the production build with local
`NEXT_PUBLIC_API_URL=http://localhost:3001`, and `git diff --check` pass.
Tests cover private read persistence and late responses, resource paging/errors,
Docs URL/draft isolation, repository cache scope, explicit import selection,
cross-Organization authority and retained A–C workflows. Backend/PostgreSQL
suites were not rerun: their code, schemas and contracts are unchanged.

### Phase D manual acceptance — pending

Retest desktop and approximately 390px: Notifications read/open/read-all,
pagination failure/retry and account switching; Docs direct links, refresh,
Back/Forward, section changes, dirty discard and late saves; Project/Task file
transfers and denied access; Activity historical links; active timer navigation
between Organizations; explicit GitHub import/link/unlink/disconnect and inbound
sync. Two clients must exercise membership changes, access loss and reconnect.
Recheck Phase C sheet history, native focus and Board pointer/keyboard/touch drag.
Component tests do not substitute for these browser checks. Live GitHub remains
blocked on public HTTPS/live App credentials. Functional freeze is not restored.
