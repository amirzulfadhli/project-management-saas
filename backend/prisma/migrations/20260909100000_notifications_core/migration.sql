-- The legacy Notification model was unused scaffold with no Project or actor
-- scope. It cannot be migrated safely without inventing ownership. Abort before
-- changing the table if any legacy rows exist.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Notification" LIMIT 1) THEN
    RAISE EXCEPTION 'Notification migration requires an empty legacy Notification table';
  END IF;
END $$;

ALTER TABLE "Notification"
  DROP COLUMN "title",
  DROP COLUMN "message",
  DROP COLUMN "isRead",
  ADD COLUMN "projectId" TEXT NOT NULL,
  ADD COLUMN "actorId" TEXT NOT NULL,
  ALTER COLUMN "entityType" SET NOT NULL,
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "readAt" TIMESTAMP(3);

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Notification_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Notification_userId_createdAt_id_idx"
  ON "Notification"("userId", "createdAt", "id");
CREATE INDEX "Notification_userId_readAt_createdAt_idx"
  ON "Notification"("userId", "readAt", "createdAt");
CREATE INDEX "Notification_projectId_createdAt_idx"
  ON "Notification"("projectId", "createdAt");

COMMIT;
