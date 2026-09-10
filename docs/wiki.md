# Project documentation

Status: **PROJECT WIKI / DOCUMENTATION CORE — BACKEND + FRONTEND is complete for automated verification. Manual browser acceptance is deferred.**

## Scope and model

Each Wiki page belongs to exactly one Project and stores Markdown as its canonical content. Pages have a title, creator, optional parent, dense sibling position, and timestamps. The legacy unused single-page `Wiki` scaffold was empty and has been evolved in place into the `WikiPage` model mapped to the same physical table.

Hierarchy is limited to five levels. Parents must belong to the same Project. Explicit moves reject self-parenting, ancestry cycles, cross-Project parents, invalid target indexes, and moves that would make descendants exceed the depth limit.

New pages append to their sibling group. The move endpoint supports safe reparenting/reordering with zero-based target indexes. Dense integer positions are normalized after moves and deletions. Project-row locking serializes all Wiki hierarchy/order mutations; reads use `position` and `id` as deterministic tie breakers.

## API and authorization

```text
GET    /api/projects/:projectId/wiki
POST   /api/projects/:projectId/wiki
GET    /api/projects/:projectId/wiki/:pageId
PATCH  /api/projects/:projectId/wiki/:pageId
PATCH  /api/projects/:projectId/wiki/:pageId/move
DELETE /api/projects/:projectId/wiki/:pageId
```

All IDs and bodies use strict validation; the Project comes only from the route. Any current Organization-inherited or explicit Project collaborator may list, read, create, edit, and move pages. A page may be deleted by its creator, an explicit Project `OWNER`, or an Organization `OWNER`.

Deleting a page with children returns `409 Conflict`. Children are never cascade-deleted or silently promoted; callers must deliberately move or delete them first. Sibling positions close after a successful leaf deletion.

## Content and rendering security

Titles are trimmed, non-empty, and limited to 200 characters. Markdown bodies are limited to 96 KiB, below the application's existing 100 KiB JSON parser ceiling so the DTO layer provides consistent validation.

The database stores Markdown, never generated HTML. The frontend uses `react-markdown` with GFM and without `rehype-raw`; raw HTML is skipped. URL handling permits only HTTP, HTTPS, mailto, root-relative, and fragment links. Images render as inert text rather than loading remote resources. New-tab links use `noopener noreferrer`.

Wiki Markdown has no special attachment syntax. Existing authenticated attachment downloads remain private; durable inline attachment references are deferred. No base64 content, public files, or duplicate storage is used.

## Transactions and collaboration

Create, update, move, and delete run in interactive Prisma transactions under a Project row lock. Activity persistence happens inside the same transaction. No-op updates/moves emit no Activity or realtime event. Activity metadata contains page identity/title and changed-field names, never Markdown bodies.

After commit the controller publishes compact `WIKI_PAGE_CREATED`, `WIKI_PAGE_UPDATED`, `WIKI_PAGE_MOVED`, or `WIKI_PAGE_DELETED` Project events. The frontend invalidates only that user's Project Wiki list, affected page detail, and Project Activity cache. Wiki edits intentionally create no Notifications.

## Frontend and limitations

The Project header's **Docs** action opens a responsive modal with page tree and selected page. It supports root/child creation, safe parent moves, Markdown reading, explicit edit/save/cancel, creator/owner deletion controls, and loading/empty/error states. Dirty editor state requires confirmation before page selection, cancel, or modal close.

Query keys include Project, page, and current-user scope. Concurrent saves use last-committed-write semantics; this is not live character-level collaboration. Rich text, CRDTs, version history, Wiki comments/notifications, public sharing, search, AI, tree drag-and-drop, stable inline attachment embedding, and browser acceptance remain deferred.
