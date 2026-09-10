# GitHub integration backend

## Architecture

FlowPlan uses a GitHub App for repository integration. The App provides
repository-scoped installation consent, short-lived installation tokens,
verified discovery, and one authenticated webhook channel without storing
long-lived personal access tokens. Better Auth's optional GitHub provider is
sign-in-only; its OAuth token is never reused by this module.

The backend flow is locally tested against a deterministic mocked GitHub
boundary, and the Project-level frontend passes its static production checks.
Live App creation and public HTTPS callback/webhook delivery remain pending.

## Installation and token flow

```text
POST /api/github/app/install-url
  -> hashed 10-minute state + PKCE verifier
  -> GitHub App installation page
  -> GET /api/github/app/setup?installation_id=...&state=...
  -> GitHub App user authorization with PKCE
  -> GET /api/github/app/callback?code=...&state=...
  -> verify user access to the installation
  -> verify the installation belongs to this App
  -> persist stable installation/account metadata
```

Setup and callback require the same authenticated FlowPlan user that initiated
the flow. Only one active flow is kept per user. Raw state is never stored;
only its SHA-256 digest is retained. The PKCE verifier is deleted when callback
processing finishes.

`GithubInstallation` stores a stable GitHub installation/account identity and
the FlowPlan user who connected it. It never stores App JWTs, user tokens, or
installation tokens. Discovery and connection request a fresh short-lived
installation token, use it in memory, and discard it.

The authenticated App API is:

```text
POST /api/github/app/install-url
GET  /api/github/app/setup
GET  /api/github/app/callback
GET  /api/github/app/installations
GET  /api/github/app/installations/:installationId/repositories?page=1&perPage=30
```

Repository pagination accepts 1–100 items and returns `items`, `page`,
`perPage`, `totalCount`, and `nextPage`. A user can list or use only the local
installation records they connected.

## Verified Project repository connection

The Project-nested API is:

```text
GET    /api/projects/:projectId/repository
POST   /api/projects/:projectId/repository
DELETE /api/projects/:projectId/repository
```

Any current Project collaborator may read the connection. Only the owning
Organization owner or an explicit Project `OWNER` may connect or disconnect.
The strict POST body is:

```json
{
  "installationId": "a-flowplan-installation-uuid",
  "externalRepositoryId": "123456789"
}
```

The server verifies installation ownership, obtains a fresh installation token,
fetches the repository from GitHub, and derives owner, name, full name, URL,
and default branch. Discovery also reports current visibility and archive state,
but the existing connection model does not persist those two advisory values.
Client-supplied metadata cannot override stored values. One Project may have at
most one repository, and the same GitHub repository cannot be connected twice.
Conflicts return HTTP 409.

Existing foundation-era connections remain readable because
`Repository.githubInstallationId` is nullable. Reconnecting through the App
creates the verified relationship. No token or secret appears in an API
response.

## GitHub client behavior

The focused client uses Node's built-in `fetch` and `crypto`; no large SDK is
required. App JWTs are RS256-signed and short-lived. GitHub requests time out
after ten seconds and are not automatically retried. The client normalizes
authentication, permission, missing-resource, rate-limit, timeout, and
malformed-response failures without exposing credentials or GitHub response
bodies.

## Webhook security and ingestion

GitHub sends App events to:

```text
POST /api/github/webhooks
```

The endpoint requires `X-Hub-Signature-256`, `X-GitHub-Delivery`, and one of
the supported `X-GitHub-Event` values (`push`, `pull_request`, `issues`). Nest
retains the exact raw body for HMAC SHA-256 verification before payload parsing
or database lookup. Repository mapping uses GitHub's stable repository ID, not
a Project ID from the payload.

Each accepted delivery creates one `GithubWebhookDelivery`. Its unique delivery
ID makes matching retries idempotent; reuse for a different event/repository is
a conflict. Only compact normalized metadata is stored. Raw payloads, bodies,
commit arrays, credentials, and secrets are not stored.

A GitHub App owns one App-level webhook. Installed repositories deliver the
events subscribed in App settings, so FlowPlan does not create redundant
per-repository hooks.

## Activity boundary

Repository connect/disconnect Activity is committed in the same transaction as
the domain mutation because it has an authenticated FlowPlan actor. Webhook
deliveries do not create Activity yet: GitHub actors are external while the
current Activity schema requires a FlowPlan user. Inventing an Organization
owner as actor would create misleading history.

Explicit Issue link, unlink, and create-Task-from-Issue actions do create
compact, user-attributed Project Activity. Routine webhook synchronization does
not create Activity or Notifications. See
[GitHub Issue and FlowPlan Task synchronization](github-issue-task-sync.md).

## Configuration and secrets

GitHub App discovery is an all-or-nothing backend configuration group:

```text
GITHUB_APP_ID
GITHUB_APP_SLUG
GITHUB_APP_CLIENT_ID
GITHUB_APP_CLIENT_SECRET
GITHUB_APP_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET
```

`GITHUB_WEBHOOK_SECRET` must be at least 32 characters. The private key accepts
a multiline RSA PEM or literal `\n` separators; startup normalizes and
cryptographically validates it. Partial App configuration fails fast. Store all
secrets in the deployment secret store. They must never be frontend variables,
Docker build arguments, logs, API output, or committed files. These credentials
are separate from Better Auth's optional `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET`.

## Deferred work and limitations

- live GitHub App/public HTTPS callback and webhook verification
- installation deletion/suspension lifecycle handling
- external/system actors in Activity
- FlowPlan-to-GitHub writes and automatic Issue import
- pull request/branch linking and automation
- background retries and durable webhook processing

The callback returns a compact verified installation record. The Project modal
opens installation in a popup and polls the authenticated installation list;
after the backend stores a new or updated installation, it closes the popup and
continues to repository discovery. This avoids arbitrary return URLs and keeps
the fixed callback contract. Blocked popups, cancellation, expiry, and callback
failure are reported in the original Project modal.
Authorization is verified when an installation is connected. Installation
revocation/suspension events are not yet used to retire the local record.

## Frontend Project integration

Project detail exposes a compact `GitHub` action beside Members, Columns, and
Activity. Disconnected collaborators see that an owner must connect;
administrators can install the App, select one of their installations, page
through verified repositories, and connect one. All collaborators can view the
connected repository, while only Organization owners or explicit Project
`OWNER`s receive the confirmed disconnect control.

The repository picker sends only the installation record ID and external
repository ID. It displays GitHub-derived name, visibility, default branch,
archive state, and link but never tokens or raw payloads. Archived repositories
are labelled and remain selectable because the backend does not prohibit them.

TanStack Query cache boundaries are explicit:

```text
["github-installations"]
["github-repositories", { installationId, page, perPage }]
["project-repository", { projectId }]
["github-issues", { projectId, userId, page, perPage, state }]
["task-github-issue", { taskId, userId }]
```

Connection and Issue-link mutations update only their current Project/Task
GitHub caches and the affected Project Task/Activity scopes. Frontend role
checks control visible actions only; NestJS remains the authorization boundary.

## Verification

All sixteen migrations apply to development and deploy from zero to a
disposable database that is removed after verification. Prisma reports the
development schema current with no drift.

GitHub E2E passes 12/12 tests and the complete PostgreSQL E2E suite passes
103/103 across 16 suites. The full backend unit suite passes 157/157 across 27
suites. Tests cover state/PKCE flow, installation persistence and isolation,
repository and Issue discovery, verified metadata, authorization, strict input,
connection/link/import conflicts, concurrent duplicate protection, webhook
signatures/mapping/normalization/idempotency/synchronization, unlink/replay,
realtime invalidation, Notification silence, and secret-safe responses.

External GitHub HTTP calls are mocked in automated tests. These results do not
claim live GitHub App installation or public webhook delivery.
