# FlowPlan

FlowPlan is a focused project-management SaaS portfolio application. It
supports authenticated multi-organization workspaces, Projects, Kanban
Columns, Tasks, explicit Project rosters, Task assignment, Activity history,
and threaded Task Comments.

## Architecture

```text
Browser -> Next.js frontend -> NestJS API -> PostgreSQL
                              -> Better Auth
                              -> Prisma
```

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS, TanStack Query
- Backend: NestJS 11, Better Auth, Prisma 7
- Database: PostgreSQL 17 for the reference container topology
- Runtime: Node.js 22 and npm 10

## Implemented product scope

- Email/password authentication and cookie-backed sessions
- Organization onboarding and workspace selection
- Organization-scoped Project lifecycle
- Project membership roles and administration
- Single-board Kanban workflow with managed Columns
- Task creation, editing, assignment, movement, and permanent deletion
- Project Activity feed
- Task Comments, replies, editing, moderation, and tombstones

## Local development

1. Install Node.js 22 and PostgreSQL.
2. Copy `backend/.env.example` to `backend/.env` and use a unique local auth
   secret.
3. Copy `frontend/.env.example` to `frontend/.env.local`.
4. In `backend/`, run `npm ci`, `npm run prisma:generate`,
   `npm run prisma:deploy`, and `npm run start:dev`.
5. In `frontend/`, run `npm ci` and `npm run dev`.

The default local URLs are `http://localhost:3000` for the frontend and
`http://localhost:3001` for the API.

## Production-like Docker run

Copy the root `.env.example` to `.env`, replace both placeholder secrets, then
run:

```sh
docker compose up --build
```

The Compose stack persists PostgreSQL data and runs `prisma migrate deploy`
before the backend starts. See [docs/deployment.md](docs/deployment.md) for the
production/Coolify procedure and smoke checklist.

## Verification

Backend checks include Prisma validation, TypeScript, ESLint, unit tests,
PostgreSQL E2E tests, and the Nest production build. Frontend checks include
TypeScript, ESLint, and the Next production build. CI provisions PostgreSQL and
runs those checks from clean installs.

The repository root is this directory. From a clean clone, both applications
use their committed `package-lock.json` files through `npm ci`; Prisma Client is
generated rather than committed, and all seven production migrations remain in
source control. GitHub Actions uses only disposable CI configuration and a
PostgreSQL service—no production or staging secrets are required.

## Screenshots

Screenshots are not committed yet. A future portfolio-polish milestone should
capture the Organization, Project board, Activity, and Comments flows from the
staging deployment.

## Known limitations

- Organization invitations and administration are not implemented.
- Column and Task ordering/drag-and-drop are not implemented.
- Project access intentionally includes Organization-level inherited access.
- GitHub repository integration, Notifications, realtime updates, Wiki,
  Calendar, AI features, Teams, and advanced RBAC are future work.
- `backend/project-management-saas/` is a preserved legacy starter copy. It is
  excluded from repository and container contexts and is not part of either
  active application.
