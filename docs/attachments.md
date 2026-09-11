# Files and attachments

Status: **FILES & ATTACHMENTS CORE — BACKEND + FRONTEND is complete for automated verification. Manual browser acceptance is deferred.**

## Product scope

FlowPlan supports private attachments at two scopes:

- Project attachments are listed in the **Files** section at `/projects/:id/files`.
- Task attachments are listed from the existing Task dialog's **Attachments** tab.

There are no public links, folders, versions, thumbnails, rich document tools,
or third-party drive integrations. Task deletion does not delete stored files:
the database sets their nullable `taskId` to `NULL`, retaining them as
Project-scoped attachments instead of leaking an object or blocking Task
deletion.

## Storage architecture

`FileStorage` is the domain-facing provider boundary. It exposes store, read,
delete, and existence operations over opaque storage keys. `LocalFileStorage`
is the first provider and confines every object to the configured
application-owned root. Attachment authorization, metadata, APIs, Activity,
and realtime behavior do not depend on filesystem paths, so a later S3-compatible
provider can replace it without changing those domain rules.

Configuration:

```env
FLOWPLAN_STORAGE_DRIVER=local
FLOWPLAN_STORAGE_PATH=/absolute/persistent/path
```

Development defaults to `.flowplan-storage` beside the backend directory.
Production requires an explicit absolute path. The directory is ignored by
Git. It is never exposed as a static directory; every download traverses the
authenticated API.

The Docker runner owns `/data/uploads`, and Compose mounts the persistent
`flowplan-uploads` named volume there. `docker compose restart` and ordinary
`docker compose down` preserve objects. `docker compose down -v` is explicitly
destructive to both database and upload volumes and is not part of normal
operation.

The backend image build and an isolated named-volume container-replacement
smoke test are verified. The second non-root backend container read the object
written by the first, and the disposable verification volume was removed
without touching the normal Compose volume.

Local storage is appropriate for one backend instance. Object storage is
required before horizontal backend scaling because a local volume is not a
shared object namespace.

## Metadata and database policy

The existing unused Prisma `File` scaffold is now the attachment metadata
record. Prisma maps clearer domain field names onto its original physical
columns, avoiding an unnecessary table replacement:

- required `projectId`
- optional `taskId` with `ON DELETE SET NULL`
- `uploaderId`
- `originalName` for display only
- unique opaque `storageKey`
- validated `mimeType`, `sizeBytes`, and `createdAt`

The Project FK uses `RESTRICT`. Indexes support deterministic newest-first
Project and Task listing. The migration first validates legacy Task/Project
consistency, backfills missing Project scope only from a linked Task, and
aborts if an unscoped or contradictory row would remain. No legacy rows existed
in the verified development database.

## API and authorization

Project scope:

```text
GET    /api/projects/:projectId/attachments?cursor=<uuid>&limit=50
POST   /api/projects/:projectId/attachments       multipart field: file
GET    /api/projects/:projectId/attachments/:attachmentId/download
DELETE /api/projects/:projectId/attachments/:attachmentId
```

Task scope mirrors those routes below `/api/tasks/:taskId/attachments`.
Listing is `createdAt DESC, id DESC`, defaults to 50, and caps at 100. Cursors
must belong to the nested Project/Task.

Any current Project collaborator may list, upload, and download. The uploader,
an explicit Project `OWNER`, or an Organization `OWNER` may delete. Ordinary
members cannot delete another user's attachment. Task authorization always
derives the actual Project from the Task, and nested attachment IDs must match
the requested scope.

Responses expose metadata and a compact uploader summary, never `storageKey`,
absolute paths, or object bytes. Downloads set a server-validated content type,
injection-safe RFC 5987 `Content-Disposition`, `X-Content-Type-Options: nosniff`,
and private/no-store caching.

## Upload policy

The maximum file size is 10 MiB. The allowlist is PNG, JPEG, WebP, PDF, plain
text, and CSV. Extension and declared MIME type must agree. PNG/JPEG/WebP/PDF
also pass lightweight signature checks; text/CSV rejects NUL bytes. Executable
and script extensions are not accepted.

This validation reduces common accidental and spoofed uploads but is not
antivirus or full content disarm/reconstruction. A production environment that
accepts untrusted external users should add malware scanning at the storage
boundary before expanding the allowlist.

Original filenames are normalized for display, stripped of path components,
bounded to 255 characters, and rejected if they contain control characters.
They never participate in a filesystem path. Local object paths use only
server-generated UUID keys.

## Consistency and collaboration

Upload validates first, writes storage, then creates metadata and
`ATTACHMENT_UPLOADED` Activity within one Prisma transaction. If that transaction
fails, the stored object is deleted as compensation.

Delete locks metadata, reads the object for rollback, deletes storage, then
deletes metadata and creates `ATTACHMENT_DELETED` Activity in one transaction.
A storage failure leaves metadata untouched. A database/Activity rollback
attempts to restore the same opaque object. There remains an unavoidable small
cross-resource failure window if both the database operation and its storage
compensation fail; this is logged for operator repair rather than hidden.

Activity metadata contains only attachment identity, scope, display filename,
MIME type, and size—never file bytes or storage keys. After a committed
mutation, the controller publishes compact `ATTACHMENT_CREATED` or
`ATTACHMENT_DELETED` Project realtime events. The frontend invalidates only the
relevant Project/Task attachment key plus that Project's Activity key.
Attachments intentionally create no Notifications.

## Frontend and verification status

The Project Files page and Task attachment surface reuse the existing button, empty/error, and
TanStack Query patterns. They provide upload pending state, deterministic
pagination, authorized delete confirmation, authenticated download, compact
metadata, and narrow-layout-safe rows. Project and Task query keys include the
respective resource ID and current user ID, preventing account-switch cache
reuse while retaining targeted realtime invalidation.

Automated backend unit, PostgreSQL/storage E2E, complete PostgreSQL regression,
Prisma migration/drift, and frontend static/build checks are recorded in
`project-status.md`. Browser upload/download/delete and responsive interaction
acceptance is intentionally deferred to the consolidated manual QA milestone.
