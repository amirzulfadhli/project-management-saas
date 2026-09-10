# Realtime collaboration

FlowPlan uses one authenticated Socket.IO connection per signed-in browser to
keep collaborators viewing the same Project converged with committed REST
mutations. Realtime is a cache-reconciliation channel, not a second mutation
API and not an authorization boundary.

## Architecture

The NestJS `RealtimeGateway` exposes the `/realtime` Socket.IO namespace. The
handshake must come from the configured `FRONTEND_URL` and carry a valid Better
Auth session cookie. Better Auth resolves the user from handshake headers just
as it does for REST; the client cannot supply a trusted user ID.

An authenticated socket also joins a server-derived `user:<userId>` room for
private Notification invalidations. Clients cannot request or name user rooms.
Before private delivery the gateway revalidates the Better Auth session;
Notification events are never sent through Project rooms.

The browser emits only `project:subscribe` and `project:unsubscribe`, each with
a strict UUID `projectId`. `AccessService.assertProjectAccess` authorizes every
subscription. Room names are derived on the server as `project:<uuid>`;
clients cannot choose arbitrary rooms or broadcast domain events. A socket is
limited to 20 simultaneous Project subscriptions.

## Event envelope and taxonomy

Successful committed mutations produce a compact `project:event` envelope:

```json
{
  "id": "event UUID",
  "projectId": "Project UUID",
  "type": "TASK_UPDATED",
  "entity": "task",
  "entityId": "Task UUID",
  "taskId": "Task UUID when relevant",
  "occurredAt": "ISO-8601 timestamp",
  "actorId": "Better Auth user ID"
}
```

The implemented event types cover Project update/archive, Project-member
add/role-change/remove, Column create/rename/delete, Task
create/update/move/delete, Comment create/update/delete, and repository
connect/disconnect and attachment create/delete. `TASK_MOVED` deliberately covers both cross-Column movement
and same-Column ordering changes for realtime reconciliation. Wiki create,
update, move, and delete use compact `WIKI_PAGE_*` events. Same-Column
reordering still creates no Activity entry, preserving the existing low-noise
Activity policy.

No Comment/file body, GitHub payload, secret, storage key, token, full database
record, or Activity metadata is sent through this channel.

## Commit and delivery boundary

Controllers publish only after their domain service promise resolves. Those
services complete their Prisma transaction before returning, so a rolled-back
or rejected mutation never publishes a successful realtime event. Publication
failures are isolated from the committed REST response: PostgreSQL remains
authoritative and the client can still refetch normally.

This is intentionally a single-instance, best-effort design. There is a small
crash window after commit and before emission, and Socket.IO events are not a
durable replay log. Reconnect always resubscribes and invalidates exact Project
caches. A future multi-instance backend must add a shared Socket.IO adapter such
as Redis; the current single-backend MVP does not require Redis.

## Frontend reconciliation

`RealtimeProvider` owns one socket for the authenticated application session.
`ProjectBoard` subscribes only after its Organization/Project context is
coherent and unsubscribes on navigation. One provider listener maps events to
Project-scoped TanStack Query keys:

- Task -> that Project's Tasks, detail, and Activity
- Column -> that Project's Columns and detail
- Project member -> that Project's roster, detail, and Activity
- Comment -> that Task's Comments and that Project's Activity
- repository -> that Project's repository and Activity
- attachment -> that Project's attachment list, the affected Task attachment
  list when present, and Activity
- Wiki page -> that user's Project Wiki list, affected page detail, and Activity
- Time entry -> that user's active timer, affected Task time, and Project time
  summary
- Project -> that Project detail

The originating browser may receive its own event. Realtime never inserts
domain objects into cache; it only invalidates authoritative queries, so
self-delivery cannot duplicate Tasks or Comments. On reconnect, the provider
invalidates the subscribed Project scope, including Comment caches for Tasks
already known in that Project.

If the socket is unavailable, REST remains fully functional and the board shows
a quiet refresh fallback message instead of blocking work or producing noisy
per-mutation notifications.

## Revocation and security

The gateway rechecks current Project access before every delivery. Project or
Organization membership removal also triggers immediate room reauthorization
after commit. This preserves access whenever another explicit or inherited
path remains, while evicting a socket once all access paths are gone.
An evicted client receives `project:access-revoked`, leaves the room, and
refetches authoritative REST state.

REST controllers and domain services remain authoritative for every mutation.
Realtime adds no new Project, Task, Column, membership, Comment, or repository
write permission.

## Known limitations

- Delivery is best effort and has no durable replay or sequence number.
- One backend instance is supported until a shared Socket.IO adapter is added.
- Project-list pages do not subscribe; realtime begins on Project detail.
- Organization administration reauthorizes every affected Project room after
  commit. PostgreSQL E2E covers eviction after inherited access disappears and
  retained subscription when explicit Project membership remains.
- Presence, cursors, chat, and typing indicators are excluded.
- Notification invalidation is implemented, while browser interaction
  acceptance remains part of the consolidated manual QA follow-up.
- Time tracking publishes compact aggregate invalidations only; notes,
  timestamps, and duration values are never broadcast.
