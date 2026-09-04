# FlowPlan deployment foundation

FlowPlan deploys as three runtime resources:

```text
Browser -> app.example.com (Next.js)
        -> api.example.com (NestJS / Better Auth) -> PostgreSQL
```

Use frontend and API domains under the same parent domain. Both public services
must use HTTPS. The frontend calls the API directly with credentialed requests;
Nest CORS allows only the configured frontend origin.

## Supported runtime

- Node.js 22
- npm 10
- PostgreSQL 17 (reference and CI version)

## Repository boundary and clean checkout

`project-management-saas/` is the repository root. The active applications,
documentation, Docker/Compose configuration, lockfiles, Prisma migrations, and
GitHub workflow all live below this boundary. The unrelated Git repository in
the developer's home directory is not part of FlowPlan.

From a clean clone, verify the tracked application inputs with:

```sh
cd backend
npm ci
npm run prisma:generate
npm run prisma:validate
npm run typecheck
npm run lint
npm test -- --runInBand
npm run build

cd ../frontend
npm ci
NEXT_PUBLIC_API_URL=https://api.example.test npm run build
npm run typecheck
npm run lint
```

`backend/generated/`, `node_modules/`, build output, logs, local databases, and
environment files are intentionally ignored. Prisma Client is regenerated from
the tracked schema; both package lockfiles and every migration are tracked.

## Required configuration

Backend runtime:

| Variable                                   | Requirement                                                   |
| ------------------------------------------ | ------------------------------------------------------------- |
| `NODE_ENV`                                 | `production`                                                  |
| `DATABASE_URL`                             | PostgreSQL URL; not localhost in production                   |
| `BETTER_AUTH_URL`                          | Exact public HTTPS API origin, e.g. `https://api.example.com` |
| `BETTER_AUTH_SECRET`                       | Stable random value of at least 32 characters                 |
| `FRONTEND_URL`                             | Exact public HTTPS frontend origin                            |
| `PORT`                                     | Optional validated port; defaults to `3001`                   |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Optional; configure both or neither                           |

Frontend build:

| Variable              | Requirement                                        |
| --------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | Exact public API URL; embedded during `next build` |

Production startup rejects missing critical variables, placeholder/short auth
secrets, local production URLs, invalid ports, and half-configured GitHub
credentials. `FLOWPLAN_ALLOW_INSECURE_LOCALHOST=true` exists only for the root
local Compose stack. It permits only `http://localhost`, `127.0.0.1`, or `::1`
public origins (and a local PostgreSQL URL); it does not permit insecure remote
origins. Never set it in staging or public production.

Keep secrets in the platform secret store. Do not put `.env` files, database
credentials, auth secrets, or OAuth credentials into source control or Docker
build arguments. `NEXT_PUBLIC_API_URL` is intentionally public.

## Images and local production-like verification

The backend Dockerfile has separate `migration` and `runner` targets. The
runtime target excludes source, tests, local environment files, and the Prisma
CLI build workflow. The frontend uses Next.js standalone output. Both images
run as the unprivileged `node` user.

The Debian tooling stage installs OpenSSL because Prisma Client generation and
the migration CLI detect the system OpenSSL ABI. The final backend runner does
not inherit that tooling layer, keeping the application image minimal.

The backend build stage supplies a syntactically valid, non-secret PostgreSQL
URL only so Prisma Client generation can load `prisma.config.ts`; it never
connects to that URL and it is not carried into the runtime or migration
stages. Runtime and migration stages receive their real `DATABASE_URL` through
environment injection.

For the local stack:

1. Copy root `.env.example` to `.env`.
2. Replace `POSTGRES_PASSWORD` with a URL-safe value and
   `BETTER_AUTH_SECRET` with a random 32+ character value.
3. Run `docker compose config` to inspect the resolved configuration.
4. Run `docker compose up --build`.
5. Open `http://localhost:3000`.

For a full local container smoke test, keep the volume intact and run:

```sh
docker compose config
docker compose build
docker compose up -d
docker compose ps
docker compose logs migrate
curl --fail http://localhost:3001/health
curl --fail http://localhost:3001/ready
curl --fail http://localhost:3000/
docker compose down
```

The PostgreSQL volume is persistent. `docker compose down` stops resources;
do not use `docker compose down -v` unless deleting local data is intentional.

The local production-like topology was verified on 2026-09-04: all three
images built, PostgreSQL and both applications became healthy, the migration
job applied all seven committed migrations, `/health`, `/ready`, and the
frontend returned HTTP 200, and application-container restarts preserved
database readiness and frontend availability. The stack was stopped with
`docker compose down`, preserving the PostgreSQL volume.

## Health and readiness

- `GET /health` is process liveness and does not touch PostgreSQL.
- `GET /ready` performs a lightweight `SELECT 1`; database failure returns 503.

Use `/ready` for traffic admission and rolling deployment health checks. Nest
shutdown hooks disconnect both application and Better Auth Prisma clients on
container termination.

## Prisma production migrations

Committed migrations under `backend/prisma/migrations/` are the source of
truth. Run exactly once per release, before new API instances receive traffic:

```sh
npm run prisma:deploy
```

This invokes `prisma migrate deploy`. Never use `prisma migrate dev`, `db push`,
or reset commands against production. The Compose `migrate` service is a
one-shot release job and the backend waits for it to succeed.

Before migration, take or verify a database backup and review the new SQL.
Application rollback does not automatically reverse a migration. Prefer
backward-compatible schema changes; for an unsafe migration, restore from a
verified backup or deploy an explicit forward repair migration.

## Dependency security assessment

The backend pins audited transitive overrides for `qs` 6.16.0 and `mysql2`
3.24.3. This removes the runtime query-parser and unused MySQL-driver findings
without changing the PostgreSQL architecture. `prisma` is a development and
migration-image dependency; its current `deepmerge-ts` advisory remains in the
full lockfile audit because npm installs optional Prisma peers while developing.
The production runner uses `npm ci --omit=dev --omit=optional` and does not run
the Prisma CLI. Re-evaluate the advisory when Prisma publishes a compatible
patched release; do not downgrade the Prisma 7 schema/client to satisfy npm's
currently suggested Prisma 6 remediation.

## Coolify topology

Create one PostgreSQL resource and two application resources from this repo:

1. Backend: Dockerfile `backend/Dockerfile`, target `runner`, port `3001`,
   health path `/ready`.
2. Frontend: Dockerfile `frontend/Dockerfile`, target `runner`, port `3000`,
   build argument `NEXT_PUBLIC_API_URL=https://api.example.com`.
3. Migration release job: backend Dockerfile target `migration`, with the same
   `DATABASE_URL`, run before backend rollout.

Attach `app.example.com` and `api.example.com`, enable platform TLS, and inject
runtime secrets through Coolify. Do not expose PostgreSQL publicly. If proxy
behavior changes, verify that forwarded protocol/host headers and the Nest
Better Auth request bridge still produce the public HTTPS origin.

## First-deployment smoke checklist

- CI succeeds from clean `npm ci` installs.
- Migration job exits successfully and reports no pending migrations.
- `/health` returns 200.
- `/ready` returns 200 and returns 503 when database access is intentionally
  unavailable in staging.
- Untrusted browser origins are rejected by CORS/Better Auth.
- Sign up, session retrieval, sign out, and session invalidation work over
  HTTPS in Chrome and Safari.
- Create an Organization, Project, Column, and Task.
- Assign/move/edit/delete a Task.
- Add/edit/delete a Comment and inspect Project Activity.
- Restart both application containers and verify sessions/data survive.
- Confirm logs contain no secrets or raw credentials.

CI in `.github/workflows/ci.yml` is verification only; it does not hold
deployment credentials or perform continuous deployment.

The backend job starts an isolated PostgreSQL 17 service, injects test-only
configuration, runs all committed migrations with `prisma migrate deploy`, and
then runs the complete E2E suite serially. The frontend job uses a non-routable
example API URL at build time. CI proves clean installation, schema migration,
static quality, tests, and production builds; it does not prove public DNS,
TLS, reverse-proxy headers, secure browser cookies, backups, or staging restart
behavior.
