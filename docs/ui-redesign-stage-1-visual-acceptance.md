# Stage 1 visual acceptance — 2026-10-18

Baseline: `5604c1dfdbec61db684c34cc62c20c290ed1b5c6` (unchanged).
Status: observed owner-context checks completed with one minimal wrapping fix;
remaining audit items are deferred by user decision for a development checkpoint,
not fully accepted. Non-admin browser acceptance still needs a legitimate MEMBER
session. The generated-layout type mismatch has been traced and corrected with
a type-only annotation change. Stage 2 application implementation has not started.
Phase E remains OPEN and functional freeze remains unrestored.

## Environment diagnosis and recovery

- Initially neither 3000 nor 3001 had a listening server. HTTP requests outside
  the sandbox were actively refused. The existing FlowPlan PostgreSQL and backend
  containers were stopped. The earlier sandbox socket restriction was a separate
  limitation, not evidence that a working application was reachable.
- Started the current frontend outside the sandbox with
  `node ./node_modules/next/dist/bin/next dev --webpack --hostname 0.0.0.0 --port 3000`.
  Startup reported ready in 1.7 seconds. The first `/` compilation/request took
  17.3 seconds, exceeding the initial browser navigation wait; subsequent requests
  succeeded. No application/build configuration was changed for connectivity.
- Started only the existing `flowplan-postgres-1` and `flowplan-backend-1`
  containers. Both became healthy. Frontend and the backend auth endpoint returned
  HTTP 200. No image rebuild, migration, database reset, or credential retrieval.
- The user signed in through the browser. This account had no Organizations,
  so an isolated local QA Organization and fixtures were created through real UI.
  Frontend 3000 and backend 3001 are left running for review.

## Actually observed

Browser: Codex in-app browser, real rendered pages at 1280 × 900 and 390 × 844.
Screenshots were inspected, supplemented by read-only DOM bounds/focus checks.
These are viewport checks, not physical-device or assistive-technology tests.

| Surface                 | Observations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard, desktop      | Empty and populated states rendered. Compact count strip; populated fixture showed 2 Projects / 2 Tasks / 2 Scheduled. Scheduled Tasks was first and about 585px wide; Recent Projects about 403px. Due dates Oct 20 then Oct 22 aligned at the right. Long Task/Project titles truncated within rows. Document width 1280px.                                                                                                                                                                                                    |
| Dashboard, 390px        | Counts stayed in one strip. Scheduled Tasks stacked above Recent Projects. Long titles truncated, metadata/dates remained legible and aligned. Document width 390px.                                                                                                                                                                                                                                                                                                                                                             |
| Projects, desktop       | New Project was the dominant charcoal action on the title row; Active/Archived were separate links. Owner counts and Actions aligned. A long unbroken name wrapped; description stayed a single preview line. Keyboard-opened last-row Actions floated below the row without clipping.                                                                                                                                                                                                                                           |
| Projects, 390px         | New Project stacked beneath the description. Owner rows, long names, metadata, first-row Actions, archived badge and archived Actions fitted. The longest archived name wrapped across several lines, increasing row height without horizontal overflow. Active/Archived changed URL and current-page state; creation action was absent in Archived.                                                                                                                                                                             |
| Creation modal          | Opened by keyboard with visible close-button focus. Empty submit disabled. Name and Description cleared after desktop Cancel and mobile Escape, with focus restored to New Project. Real submissions succeeded at both widths, closed the modal and restored focus. Desktop modal width 512px; mobile width about 366px, within the 390px viewport. Input focus outline and charcoal Create / quiet Cancel hierarchy were visible.                                                                                               |
| Modal keyboard boundary | Tab visited Name → Description → Cancel → Create Project. The following Tab exposed BODY/browser-chrome focus, then returned to Close; no background application control received focus in this traversal. This is not a claim of a complete cross-browser focus-trap certification.                                                                                                                                                                                                                                             |
| Sidebar/header          | Brand/switcher, primary navigation and Organization administration were visibly grouped. Desktop sidebar links and header Account had visible keyboard focus; Tab moved Notifications → Account. Skip to content focused `main-content`. Mobile drawer opened with visible close focus; Escape restored the hamburger trigger, and Projects navigation dismissed the drawer. Notifications and Account opened by keyboard; Escape restored each trigger. Desktop Account panel fitted; mobile Notification loading panel fitted. |

## Observed defect and minimal fix

Reproduction: at 390px, create a Project with the unbroken name below, open its
Actions and Archive it. The success notice repeated the name without wrapping.
The document expanded to **930px** and horizontally scrolled.

Added only `break-words` to the existing Projects `role="status"` notice in
`frontend/src/app/projects/page.tsx`. The notice already existed at the baseline;
no handlers, API calls, permissions, ordering or confirmation policy changed.
Rechecked the same mounted notice after hot reload: document width **390px**,
computed `overflow-wrap: break-word`, complete message visible. Desktop also
remained at 1280px. Before/after screenshots are retained.

Fixture date entry initially changed the native date display without updating
the controlled React form through the browser provider's `fill` operation.
Native date-control arrow input committed the values; saved Task detail/list
and Dashboard dates were then observed. This was not treated as a demonstrated
application date-persistence defect.

## Remaining limits and diagnostics

- **Non-admin rows remain UNVERIFIED and deferred:** the user confirmed no suitable existing
  account/session is available. Permissions were not changed and owner controls
  were not hidden artificially to simulate this state. A subsequent read-only
  local database check found three users, three Organizations and 14 Projects,
  but **zero** legitimate non-admin Project access relationships across those
  users, including zero in the Stage 1 QA Organization. The query used the same
  policy as AccessService: Organization membership or explicit Project access,
  with neither Organization OWNER nor explicit Project OWNER authority. It read
  aggregate counts only, not credentials, account tokens or session data. The
  retained QA Organization still has two active Projects and one archived Project.
  Component fixtures are in-memory test data; E2E test users are created for tests
  and cleaned up afterward. Neither supplies an existing browser login. No user,
  membership, session or database content was changed for this check.
- Physical touch/coarse-pointer behavior, on-screen keyboard resizing and
  screen-reader speech were not exercised. The viewport capability changes size,
  not device input characteristics.
- Browser console repeatedly reported the unchanged Header cache observer's
  missing `queryFn` for `["project", "none"]`; Next dev-tools showed an issue badge.
  The Header observer differs from baseline only in unrelated wrapper styling.
  No nonvisual query behavior was changed in this acceptance pass.
- The original visual pass's TypeScript failure was reproduced and then fixed
  as described below. Its earlier green results did not override that failure.
- The **default Turbopack production CSS-worker startup failure remains
  unresolved**. Its cause has not been established or attributed to this redesign.
  The earlier webpack build pass is supplementary evidence, not a claim that the
  default build is fixed. No build configuration was changed and no production
  build was rerun during this acceptance follow-up.

## Original checks after the wrapping fix

- 39/39 tests in five suites: Dashboard, Project discovery, Project rows, shell,
  and shared Modal.
- Changed-file ESLint and Prettier: pass. `git diff --check 5604c1d`: pass.
- TypeScript at that point: FAIL as detailed above. Full regression and production builds were
  not repeated for this one-class visual fix; earlier results remain historical.
- No commit/push. All pre-existing uncommitted changes are retained.

## TypeScript investigation and follow-up verification

The failing check was reproduced at `.next/dev/types/app/layout.ts:39`:
`Diff<LayoutProps, FirstArg<TEntry['default']>, 'default'>` requires the root
layout's declared props to extend the generated local `LayoutProps` interface.
That interface requires `task: React.ReactNode`.

The installed Next.js webpack type generator discovers named slot directories
next to each layout (`collectNamedSlots` in
`next/dist/build/webpack/plugins/next-types-plugin/index.js`) and emits them as
required properties. FlowPlan has `src/app/@task`, so this is the expected slot,
not a spurious resource or an accidental Stage 1 route. Both generated route maps
also identify the root's `task` slot. The existing tsconfig includes development
and production generated types, so regenerating development guards exposes the
mismatch with the baseline's `task?: React.ReactNode` annotation.

Next's installed Parallel Routes documentation declares slot props required;
its renderer passes named slots to the layout. FlowPlan already renders `{task}`
and has `@task/default.tsx`, `@task/page.tsx` and the catch-all dismissal returning
null when a Task sheet is not active. Optional rendered content does not require
an optional slot property.

The sole application correction is removing `?` from the root layout's `task`
prop annotation. JSX, runtime behavior, routes, metadata, slot files and drafts
are unchanged. No generated file was edited or excluded, and no type was widened,
suppressed or cast to force a pass. This corrects a pre-existing annotation
mismatch exposed by type generation, rather than attributing it to the redesign.

- Initial `npm run typecheck`: failed with the reproduced required/optional error.
- After the annotation correction: **TypeScript passes with both generated type
  trees included**.
- Relevant regression: **60/60 tests in seven suites** (the five original visual
  pass suites plus Task navigation and Task detail). Existing full-suite
  **133/133 in 15 suites** remains a historical Stage 1 result, not a fresh run.
- ESLint, changed-file Prettier and `git diff --check`: pass.
- Reviewed retained Dashboard desktop/mobile and archive-notice before/after
  screenshots and the existing `break-words` change. No owner visual check was
  repeated; this type-only correction cannot change their rendered composition.
  Original 1280px/390px measurements above remain recorded evidence, not new
  measurements. Broader keyboard, touch and accessibility limits still apply.

## Checkpoint verification — 2026-10-18

The user authorized a scoped development checkpoint while deferring the remaining
audit items. Full Stage 1 acceptance and Phase E closure are not implied.

- Fresh full frontend suite: **133/133 tests in 15 suites**.
- Fresh TypeScript with generated development types included: pass.
- Fresh full frontend ESLint, changed-file Prettier and `git diff --check`: pass.
- No new browser, role/database audit, backend suite or production-build run.
  Prior owner screenshots and prior webpack build results remain historical.
- Non-admin visual acceptance still requires a legitimate MEMBER browser session.
  The default Turbopack production-build failure remains unresolved. Existing
  Header console, physical-touch and accessibility limits remain recorded above.

## Exact non-admin acceptance still needed

Use a legitimately authenticated account with MEMBER access to an Organization
containing Projects for which it has **neither** Organization OWNER nor explicit
Project OWNER authority. No such eligible context currently exists locally.
Providing a usable account and normal sign-in/access setup is required; source
fixtures, hiding controls, injected cookies and owner-session impersonation do
not satisfy this gate.

At desktop 1280px and approximately 390px, verify on real Active and Archived
Projects pages:

1. Long names, descriptions and counts use the full row width with no reserved
   Actions column and no document overflow.
2. Actions, Archive, Duplicate and Restore are absent for those non-admin rows;
   Project links still open authorized Projects normally.
3. Active/Archived links, URL state and refresh remain coherent; archived badges
   and long-name wrapping remain readable.

The existing component tests cover role-derived visibility and the one-column
CSS contract, not actual non-admin browser geometry or real-session authority.
Owner results do not substitute for this verification. Phase E stays OPEN and
functional freeze remains unrestored.

## Retained local QA data and evidence

Organization: **Stage 1 Visual QA 2026-10-18**.

- Active: **Stage 1 QA — release planning**, with two Tasks due Oct 20 and Oct 22.
- Active: **Stage 1 QA — mobile creation**.
- Archived: **Stage1QA_UnbrokenProjectName_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_LongName**.
- No existing Project was edited or deleted. No QA data was permanently deleted.

Local screenshots are in
`C:/Users/amirk/.codex/visualizations/2026/10/18/01a14de6-e39f-7543-b2cd-fe9098c232c1/flowplan-stage1/`:
Dashboard desktop/mobile, Projects desktop/mobile, mobile creation and drawer,
Actions, archived rows, and archive-notice before/after. These local artifacts
are evidence of this run, not bundled application assets.
