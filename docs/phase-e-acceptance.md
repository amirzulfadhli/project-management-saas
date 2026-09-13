# Phase E — Cross-surface correctness and acceptance

Date: 2026-09-13. Baseline: Phase D (`bf96f8e`).

**Status: verified fixes; acceptance incomplete. Functional freeze remains reopened.**
Phase F has not started. This record distinguishes real browser observations
from component-test coverage and from checks still requiring a person/environment.

## Environment and version gate

- Windows local development, current frontend production build on port 3000;
  Docker backend on port 3001 and PostgreSQL on the private Compose network.
- The initially running backend image was stale: its compiled application lacked
  Time Tracking. The Compose database had only 13 of the checkout's 17 migrations.
  Earlier Time/GitHub unavailable states were therefore **not product defects**.
- Rebuilt the current backend/migration images, checked that the two affected
  legacy scaffolds were empty, and deployed the four existing migrations normally.
  Migration service exited 0; 17 migrations are applied; backend/database healthy.
  No new migration, reset, truncation, database deletion or volume deletion.
- Frontend was rebuilt and restarted after the two fixes below before retesting.
- Browser: Codex in-app browser. Real DOM, keyboard and pointer interaction at
  390 × 844 and 1280 × 900. These are viewport tests, **not physical-device tests**.
  Edge was unavailable; the provider exposed no independent authenticated context
  or offline/touch emulation controls. Two tabs of the same authenticated account
  were used only for the specifically labelled same-account realtime checks.
  They do not establish cross-user privacy, revocation or notification delivery.

## Demonstrated defects and bounded fixes

1. **Organization switch was undone while leaving a Project.** The switcher
   selected the new Organization and navigated to Projects, but the still-mounted
   Project workspace effect selected the old Organization again. Project context
   now adopts its accessible Organization once per Project/Organization identity,
   preserving direct links without overriding an explicit outgoing selection.
   The regression failed before the fix and passes afterward. Existing access
   checks, denied-refetch behavior and subscription gating are unchanged.
2. **Board drag live announcements spoke internal UUIDs.** Real keyboard dragging
   exposed generic library announcements naming internal draggable/droppable IDs.
   Announcements now name the Task, destination Column and target Task when present,
   with cancellation/invalid-destination messages. Sensors, collision detection,
   target-index calculation, move API, rollback and ordering are unchanged.

## Actual browser acceptance

| Surface/check          | Result and precise boundary                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication         | Existing local session used; expired session earlier restored by user. No authentication behavior changed. No credential is stored in this record or fixtures.                                                                                                                                         |
| Projects/archives      | Active/Archived links reachable; archived list route rendered at mobile width. Restore authorization remains automated coverage, not a new real-browser claim.                                                                                                                                         |
| Organization switching | PASS after fix: Projects list → select Organization → Project; inside Project → select another Organization → correct Projects list without previous Project content; direct Project URL adopts its Organization. In-Project switch also retested at 390px.                                            |
| Task route/history     | Board card opens intercepted sheet; Back closes, Forward reopens; refresh renders canonical full-page Task. Back-to-work returns to Board.                                                                                                                                                             |
| Task drafts/focus      | Unsaved title survives sheet dismissal/reopening; closing returns focus to originating card; restored original fields can cancel cleanly. Same-field concurrent writes are not version checked.                                                                                                        |
| Task mobile layout     | 390px document width with long unbroken description; sheet fills viewport with internal vertical scrolling. Initial focus on close control. No horizontal document overflow observed.                                                                                                                  |
| Comments               | Authorized QA Comment creation/read and persistence across route/refresh observed. Reply/edit, distinct-user reconciliation and denied access remain below.                                                                                                                                            |
| Time                   | Start/Stop succeed against current backend; completed 20-second entry persists after refresh and appears in Project total and caller contribution. Timer was stopped before later approved Task deletion.                                                                                              |
| Docs                   | New draft survives Docs → Files → Docs; save creates URL-selected page; direct-link reload preserves body; long inline code stays within mobile document width.                                                                                                                                        |
| Notifications          | Header entry opens empty inbox; 0 unread; panel fits 390px; Escape closes and restores bell focus. No nonempty/read-state or cross-user browser PASS is claimed.                                                                                                                                       |
| Files                  | Nonsensitive 118-byte QA text upload succeeds; Project list shows metadata; Task collection correctly excludes the Project-only file. Download click shows no application error, but provider download-event wait timed out: completed transfer/bytes remain UNVERIFIED.                               |
| GitHub                 | Task shows no connected repository; Project surface shows no installations and connection entry. No live installation/link/import/webhook action attempted.                                                                                                                                            |
| Board                  | Actual keyboard cross-Column drops at 390px and pointer cross-Column drop at desktop succeed. Updated live messages name Task/Column, not UUIDs. Keyboard focus returns to handle. Horizontal Board scrolling remains contained. Same-Column reorder and physical touch remain below.                  |
| Deleted Task           | With explicit user approval, deleted only the QA Task. Another already-open same-account tab automatically shows unavailable state without refresh. Direct URL refresh also shows unavailable, without old Comment/timer controls. Back-to-work works. This is not a distinct-user authorization test. |
| Reconnect              | Restarted backend only. Browser showed temporary live-update warning, then recovered without reload. A subsequent Docs save in the other same-account tab appeared automatically in the first. Exact socket/listener counts were not measured in browser.                                              |

## Automated verification

- Focused Board/workspace suites: **25/25 tests, 2 suites**.
- Full frontend suite after fixes: **121/121 tests, 13 suites**.
- TypeScript, ESLint, changed-file Prettier, production build with the local API
  URL and `git diff --check`: PASS.
- Existing tests continue covering denied Project refetch/unmount/unsubscribe,
  explicit versus inherited authority, account-scoped resources/drafts, Task
  missing/deleted state, notification read errors/persistence, realtime cache
  contracts and Board move/rollback semantics. These are automated results only.
- No backend/domain code or schema changed. Backend unit/PostgreSQL E2E suites
  were not rerun; their previous documented results are not new Phase E results.
  Fresh-database deployment/schema drift were not rerun for this frontend phase.

## Outstanding acceptance gates — not green by inference

Use two **different users in independent authenticated browser profiles**, with
a disposable shared Project and another isolated Project. Do not reuse the two
same-account tabs above as privacy evidence.

1. Notifications: assign/reply as A to notify B; verify non-recipient silence,
   read one/read all, refresh persistence, paging/retry and account-switch isolation.
2. Membership: add/role-change/remove and reconcile roster/assignees/owner controls;
   remove B's final access path, verify room eviction, denied REST/refetch and no
   subsequent Project state. Repeat with retained explicit access.
3. Task/Comment changes: bidirectional create/edit/move/delete, reply/edit/delete,
   dirty drafts during remote updates and missing/denied deep links. Finish every
   entry point (Home/Tasks/Activity/Time/GitHub), not only Board/direct routes.
4. Files: confirm actual downloaded bytes, Task upload/download, denied/cross-Project
   transfer, pagination and late transfer/account-change behavior. Current in-app
   download outcome is unresolved, not a confirmed product defect.
5. Mobile/accessibility: physical touch drag, same-Column reorder, long-board scroll,
   keyboard-only nested dialogs and complete focus cycle, screen-reader speech,
   Docs history/discard/unload and pagination/error/empty states across resources.
6. Offline: interrupt one client's network, mutate via the other, restore and verify
   authoritative Task/Docs/File/time/notification reconciliation; check repeated
   reconnect/navigation does not accumulate listeners/connections.
7. GitHub: live verified repository discovery/link/import/unlink/disconnect and
   inbound updates. **BLOCKED ON PUBLIC HTTPS / LIVE GITHUB APP CREDENTIALS.**

Remaining checks prevent declaring Phase E fully accepted or restoring functional
freeze. They do not justify Phase F, new product features or backend redesign.

## QA data retained

The local Project **Phase E QA — 2026-09-13**, page **Phase E acceptance notes**,
and Project attachment **phase-e-transfer.txt** remain for follow-up.
The user explicitly approved permanent deletion of the QA Task and its Comment/
time history; this deletion has no product recovery flow. Existing user Projects
were not edited or deleted. The upload source was a Git-ignored temporary text
fixture containing only test copy, not application source or personal data.
