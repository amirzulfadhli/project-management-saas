# UI refinement — Phase A

Phase A implements the approved shell, navigation, spacing and interaction
foundation only. Project section routes, Task-detail redesign and resource
extraction (Phase B onward) have **not** started.

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
Project navigation destination and realtime invalidation remain unchanged.
Read/unread labels supplement color. Count failure is not presented as zero.
A failed mark-read keeps its error visible instead of closing and navigating.
Separate item actions, new categories, inbox routes and preference controls are
not introduced.

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
