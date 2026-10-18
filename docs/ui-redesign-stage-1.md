# Visual redesign — Stage 1

Date: 2026-10-18. Review baseline: `5604c1d` (preserved).

This stage implements the approved shared-shell, Dashboard and Projects
composition only. The user has authorized a development checkpoint with the
remaining audit items deferred, followed by Stage 2 scope review. This is not
full Stage 1 acceptance. Phase E remains OPEN; functional freeze is not restored.

## Checkpoint decision — 2026-10-18

- Preserve `5604c1d` as the review baseline; create a normal scoped checkpoint
  without rewriting history or pushing. Reference images remain untracked.
- Non-admin visual acceptance is deferred and still requires a legitimate
  MEMBER browser session with neither Organization OWNER nor Project OWNER
  authority. Owner observations and component tests do not satisfy that gate.
- The default Turbopack production-build failure remains unresolved. The prior
  webpack build pass is historical supplementary evidence; neither production
  build nor browser acceptance was rerun for this checkpoint.
- Fresh checkpoint checks: full frontend regression **133/133 in 15 suites**,
  TypeScript including generated development types, full frontend ESLint,
  changed-file Prettier and `git diff --check`: pass.
- The root layout correction is type-only: `task?: React.ReactNode` becomes
  `task: React.ReactNode`, matching the existing `@task` slot. No runtime JSX,
  routes, generated files or build configuration changed.
- No numbered Stage 2 scope/acceptance document exists in the repository.
  The next Project-header/Board direction requires a concrete milestone proposal
  before application implementation; it is not replaced by the older Phase A–F
  refinement or broad engineering roadmap.

## Composition

- Shared canvas: a soft neutral background, white navigation and panels, blue
  links/selection/focus, and charcoal primary buttons. The existing dark palette
  has matching action/foreground tokens. Primary-button and canvas colors apply
  globally; other surfaces have not been recomposed.
- Shared presentation rules cover 24px page titles, secondary descriptions,
  panel borders/radii, and panel-header alignment. Touch-target sizing, focus,
  reduced motion and numeric spacing rules remain intact.
- Sidebar: Organization management is grouped with Organization Members,
  directly below primary navigation. Existing routes, Organization selection,
  member panel and mobile navigation callbacks are retained.
- Header: existing Notifications and Account triggers share padding and hover
  treatment. Their panels, queries and behavior are unchanged.
- Dashboard: existing counts form a compact three-column strip. Scheduled Tasks
  lead in a wider panel, with Recent Projects alongside at desktop widths and
  below on narrow screens. Existing five-item limits, due-date sorting, Project
  order, exact Task links, loading, error/retry and empty states are retained.
- Projects: title and New Project share a header; Active/Archived occupy a
  separate URL-backed navigation row. Project identity, counts and owner actions
  have aligned columns, with stacked metadata at narrow widths. Descriptions
  occupy one preview line. Existing native Actions disclosures place their
  contents in a bordered floating surface without changing handlers, available
  actions, confirmations, authorization or cache invalidation. Rows without
  administration controls now use one full-width grid column, reclaiming the
  unused Actions space; owner rows retain their original two-column layout.

## Verification and review boundary

- Audit follow-up focused checks: 17/17 tests in three suites. Existing tests
  are retained. Dashboard coverage checks five-item limits, existing Project
  order, scheduled Task due-date order, exact destinations, empty states and
  hiding cached work on load failure with recoverable retry.
- Full frontend regression: 133/133 tests in 15 suites. The real New Project
  modal is exercised through the Projects page, including disabled empty submit,
  Cancel/reset, selected Organization and successful creation. Real Project-row
  controls cover Archive confirmation/cancellation, Archive/Duplicate success,
  failures, notices and Organization-scoped cache changes. Only API,
  authentication and browser/router boundaries are stubbed for these Project tests;
  the modal, row, query client and Organization provider are not replaced.
- TypeScript initially caught unsupported `exact` options in six new test
  queries. These were removed; string role names retain exact matching.
- TypeScript, ESLint, changed-file Prettier and `git diff --check` pass.
- The default Turbopack production build fails when its CSS worker process
  exits before connecting, including outside the sandbox. Production verification
  passes with Next.js's supported `--webpack` option without editing build
  scripts, dependencies or configuration. The default build remains unresolved;
  its root cause has not been established or attributed to this redesign. These
  are the previous Stage 1 build results; neither build was rerun for the audit
  follow-up, and no build configuration or scripts were changed to hide failure.
- Subsequent actual desktop/390px browser review is recorded in
  [Stage 1 visual acceptance](ui-redesign-stage-1-visual-acceptance.md).
  Owner-context Dashboard, Projects, creation and shell checks were observed;
  one reproduced long-name status-notice overflow received a minimal wrapping
  fix. Non-admin browser acceptance remains blocked by the unavailable user
  context. The generated-development-type mismatch was traced to the baseline's
  optional `task` slot annotation versus Next's required parallel-slot contract.
  Only that annotation was corrected; current TypeScript and 60 focused tests
  pass. The record preserves the original failure, unchanged Header observer
  diagnostic, zero eligible non-admin contexts found by a read-only role audit,
  and exact remaining browser checks. This is not an all-green acceptance claim.

The remaining audit items are deferred by user decision, not marked accepted.
Stage 2 application implementation has not started. Phase E remains OPEN;
functional freeze is not restored.

No backend, database, API, permissions, realtime, routing, draft, Task or Board
interaction contracts changed. No dependencies or reference assets were added
to application bundles. The supplied `design-references/` files remain untouched.
