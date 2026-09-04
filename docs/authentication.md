# FlowPlan authentication

## What Better Auth owns

Better Auth is FlowPlan's authentication system. It validates email/password
credentials, hashes and stores passwords in the `Account` table, creates and
revokes database-backed sessions, signs the browser session cookie, and exposes
the standard auth endpoints.

The Nest controller at
`backend/src/auth/auth.controller.ts` forwards every request below
`/api/auth/*` to `auth.handler`. Better Auth therefore owns routes such as:

- `POST /api/auth/sign-up/email`
- `POST /api/auth/sign-in/email`
- `GET /api/auth/get-session`
- `POST /api/auth/sign-out`

Nest should not recreate that route table. Better Auth can add or change routes,
and its handler must keep control of its validation, response status, headers,
and `Set-Cookie` values. The Nest controller is a transport bridge, not a
second authentication implementation.

## NestJS pieces used here

- A **controller** receives HTTP requests and selects the handler method.
- `@Controller('api/auth')` gives every method in `AuthController` the
  `/api/auth` prefix.
- `@All('{*path}')` is NestJS 11's named catch-all route. It accepts every HTTP
  method and every nested Better Auth path.
- `@Req()` supplies the Express request. The bridge converts it to the web
  standard `Request` expected by Better Auth.
- `@Res()` supplies the Express response. The bridge copies Better Auth's
  status, body, normal headers, and each `Set-Cookie` header back to it.
- Express body parsing runs before the controller. The original request stream
  has already been consumed, so the bridge forwards `req.body` as the new web
  request body.

`Request` and `Response` can mean two different APIs in this file: Express
objects are used by Nest, while web-standard objects are used by Better Auth.
The explicit `ExpressRequest` and `ExpressResponse` aliases make the boundary
clear.

## Authentication concepts in FlowPlan

- **Sign-in** proves the supplied credentials and creates a session. **Session
  retrieval** checks an existing cookie; it does not sign the user in again.
- A **session** is a database record linking an opaque token to a user until an
  expiry time.
- A **cookie** stores the signed session token in the browser. It is
  `HttpOnly`, so application JavaScript cannot read it, but requests send it
  when `credentials: "include"` is enabled.
- A **protected route** uses `AuthGuard`. The guard asks Better Auth for the
  session and rejects missing or invalid sessions with HTTP 401.
- **Authentication** answers “who is this user?” **Authorization** answers “may
  this user access this organization, project, or task?” The guard handles the
  first question; `AccessService` handles the second.

## Actual request flow

```text
Next.js page / Better Auth React client
  -> http://localhost:3001/api/auth/*
NestJS AuthController catch-all
  -> Better Auth handler
  -> Prisma adapter
  -> PostgreSQL User + Account + Session tables
  <- Better Auth response and Set-Cookie
NestJS preserves status, headers, body, and all cookies
  <- browser stores the cookie
  -> later API request includes that cookie
NestJS AuthGuard -> Better Auth getSession -> protected controller
```

The frontend client is `frontend/src/lib/auth-client.ts`. Its base URL is the
same `NEXT_PUBLIC_API_URL` used by the domain API client. Better Auth sends
credentials automatically; `frontend/src/lib/api.ts` explicitly uses
`credentials: "include"` for organization, project, and task requests.

For local development, Nest listens at `http://localhost:3001`, Next.js runs
at `http://localhost:3000`, CORS allows that exact frontend origin with
credentials, and Better Auth lists the frontend in `trustedOrigins`.

## Verification

`backend/test/auth.e2e-spec.ts` exercises the critical path against PostgreSQL:
unauthenticated rejection, sign-up, cookie creation, database records, session
retrieval, protected access, sign-out/invalidation, sign-in, and protected
access again. Run it after applying migrations:

```powershell
cd backend
npx prisma generate
npx prisma migrate deploy
npm run test:e2e -- --runInBand
```
