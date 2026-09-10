# GitHub Issue and FlowPlan Task synchronization

## Product boundary

FlowPlan supports an explicit, verified relationship between one GitHub Issue
and one FlowPlan Task. It never imports every Issue automatically. A
collaborator must either link an existing Task or explicitly create a Task from
an Issue in the Project's connected repository.

Synchronization is deliberately one-way in this release:

- GitHub Issue changes update an already-linked FlowPlan Task.
- FlowPlan Task edits are not pushed to GitHub.
- closing or reopening an Issue updates GitHub state metadata but does not move
  the Task between Columns.
- deleting or transferring an Issue marks the link unavailable and preserves
  the Task.

## Verified discovery and API

All GitHub reads use a fresh, short-lived installation token held only in
backend memory. The server derives owner, repository, URL, installation, and
Issue identity from the Project's verified repository connection.

```text
GET    /api/projects/:projectId/github/issues?page=1&perPage=30&state=open
POST   /api/projects/:projectId/github/issues/:issueNumber/create-task
GET    /api/tasks/:taskId/github
POST   /api/tasks/:taskId/github/link
DELETE /api/tasks/:taskId/github/link
```

The strict link body accepts only `issueNumber`. Import accepts only the
destination `columnId`; the route supplies Project and Issue identity. Issue
discovery is bounded to 100 results per page and omits Issue bodies from list
responses.

Any authenticated Project collaborator may discover Issues, link a Task,
import an Issue, view link state, or unlink. Existing repository
connect/disconnect administration remains restricted to Organization owners
and explicit Project owners. Backend Project access remains authoritative.

## Link and import semantics

Linking preserves the current FlowPlan Task title and description. The link
stores verified GitHub identity and state; later supported webhook updates
synchronize the title and bounded body.

Creating a Task from an Issue maps the GitHub title and body to the new Task,
uses the caller-selected same-Project Column, appends through the existing
dense Task ordering model, and creates the Task/link/Activity in one
transaction.

The `Issue` link record enforces:

- at most one link per Task;
- one external Issue ID per connected repository;
- one Issue number per connected repository;
- an authoritative Repository and Project relationship for all new writes.

Project-row locking serializes link/import operations. Database unique
constraints provide the final concurrent duplicate guard and conflicts return
HTTP 409.

## Webhook synchronization

The existing raw-body HMAC, delivery-ID idempotency, and stable repository-ID
mapping remain the security boundary. Supported `issues` actions are:

- `opened`, `edited`, `reopened`, and `closed`: refresh link metadata
  and Task title/description;
- `deleted` and `transferred`: mark the link unavailable without deleting
  or moving the Task.

An unlinked Task has no `Issue` record, so later deliveries cannot update it.
Webhook retries reuse the existing unique delivery ID and do not create
duplicate domain effects.

## Activity, notifications, and realtime

Explicit user actions record compact Project Activity:

- `GITHUB_ISSUE_LINKED`
- `GITHUB_ISSUE_UNLINKED`
- `TASK_CREATED_FROM_GITHUB_ISSUE`

Routine webhook refreshes create no Activity and no Notifications. Compact
post-commit realtime events invalidate the affected Project Task, Issue-link,
Issue-discovery, and Activity queries. They contain IDs only—never Issue
bodies, private keys, JWTs, installation tokens, or webhook secrets.

## Unlink and lifecycle behavior

Unlink removes only the FlowPlan relationship. The Task and GitHub Issue remain
untouched, historical Activity remains, and future Issue webhooks no longer
sync that Task. Disconnecting the Project repository removes its Issue links
before deleting the repository record while preserving Tasks. Deleting a Task
also removes its link.

## Verification and limitations

Automated GitHub tests use deterministic mocked GitHub HTTP responses and real
PostgreSQL. They cover discovery, authorization, strict DTOs, link/import,
concurrent conflicts, repository isolation, signed/idempotent webhook updates,
unlink behavior, realtime invalidation, compact Activity, and absence of
Notification spam.

Live GitHub Issue sync verification is **blocked on public HTTPS and live
GitHub App credentials**. Pull-request sync, GitHub assignee mapping, label
mapping, automatic Column movement, and FlowPlan-to-GitHub writes are not
implemented.
