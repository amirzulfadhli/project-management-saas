# Time tracking

## Scope and source of truth

FlowPlan supports manual Task time entries, one running Task timer per user,
Task totals, and Project totals. It intentionally does not implement billing,
rates, payroll, approvals, attendance, overtime, or productivity scoring.

`TimeEntry` maps to the legacy physical `TimeLog` table. Completed entries
store integer `durationSeconds` derived from UTC `startedAt`/`endedAt`
timestamps; floating-point hours are never authoritative. Active entries have
`activeMarker=true`, no end timestamp, and no duration. A PostgreSQL composite
unique constraint on `(userId, activeMarker)` makes a second global active
timer impossible while allowing unlimited completed rows (whose marker is
NULL). Starting another timer returns 409 and never silently stops prior work.

The migration deliberately aborts if it finds legacy `TimeLog` rows: the old
scaffold had no Project scope and its duration was documented in minutes, so
silently interpreting it as seconds would be unsafe. The preflight found zero
rows. A forward-only alignment migration corrects legacy timestamp types
without rewriting applied migration history.

## API

- `POST /api/tasks/:taskId/time/start` — start the caller's timer; optional
  trimmed note, maximum 500 characters.
- `POST /api/tasks/:taskId/time/stop` — stop the caller's timer on that Task.
- `POST /api/tasks/:taskId/time` — add a completed manual UTC interval.
- `GET /api/tasks/:taskId/time?cursor=&limit=` — Task aggregate and the
  caller's newest-first entry history; default 30, maximum 100.
- `GET /api/projects/:projectId/time` — Project aggregate, per-Task totals,
  and caller contribution.
- `GET /api/time/active` — the caller's current global timer.

Manual intervals must be at least one second, no longer than 24 hours, and may
not end in the future (a one-minute clock-skew tolerance is allowed). Timer
stops round a positive subsecond run up to one second. All timestamps are
stored as PostgreSQL `TIMESTAMPTZ`, serialized as ISO values, and displayed by
the frontend in the browser's local timezone.

## Authorization and privacy

Current Project collaborators may track their own time and see Task/Project
aggregates. Task history returns only the current user's entries. Project and
Organization owners additionally receive per-user aggregate totals; ordinary
collaborators do not receive identities or individual histories. There is no
arbitrary `userId` request input and no cross-user edit/delete API.

Starting and manually recording time requires current Project access. A user
may still discover and stop their own already-running timer after losing
access, avoiding an uncloseable global timer; that narrow path reveals only
their own previously created record and does not grant Project access.

## Transactions, concurrency, and consistency

Task scope is resolved server-side and `projectId` is derived from the Task.
Start/stop operations serialize on the user's PostgreSQL row. The database
unique constraint provides the final concurrent-start guard, with unique
violations normalized to 409. Completed-state checks require end-after-start
and a positive duration. Task deletion cascades its time entries; Project and
User relations remain restrictive.

No Activity or Notification is created for time tracking. These records are
operational state and would make collaboration feeds noisy.

## Realtime and frontend

Successful committed mutations publish compact `TIMER_STARTED`,
`TIMER_STOPPED`, or `TIME_ENTRY_CREATED` Project events containing only IDs.
No notes or durations are broadcast. The frontend invalidates only the
affected user's active-timer cache, affected Task time cache, and Project time
summary. Realtime failure never prevents REST persistence.

The existing Task dialog has an explicit **Time tracking** tab for totals,
start/stop, manual entry, and the caller's recent history. Task links from the
top-level Tasks page preserve Task identity and open this same dialog. The
Project header uses a labelled **Time tracking** action for total, caller
contribution, per-Task totals, and owner-only collaborator totals. Manual
browser retesting remains required after the first V1 QA defect-closure pass.

## Known limitations

- Running elapsed time is presented from its start timestamp but is not a
  continuously synchronized server counter.
- Completed entries cannot yet be edited or deleted.
- Project summaries are all-time totals; date filtering and timesheets are out
  of scope.
- Socket delivery remains best effort and single-backend-instance until a
  shared adapter is introduced.
