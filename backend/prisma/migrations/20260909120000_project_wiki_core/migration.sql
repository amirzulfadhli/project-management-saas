-- The legacy Wiki scaffold did not record an author. Refuse to invent one if
-- an installation used that otherwise-unimplemented table.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Wiki") THEN
    RAISE EXCEPTION 'Cannot migrate legacy Wiki rows safely: createdById has no trustworthy source';
  END IF;
END $$;

DROP INDEX "Wiki_projectId_key";

ALTER TABLE "Wiki"
  ADD COLUMN "parentId" TEXT,
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "createdById" TEXT NOT NULL,
  ALTER COLUMN "content" SET DEFAULT '',
  ALTER COLUMN "content" SET NOT NULL;

ALTER TABLE "Wiki"
  ADD CONSTRAINT "Wiki_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Wiki_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Wiki"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Wiki_projectId_parentId_position_id_idx"
  ON "Wiki"("projectId", "parentId", "position", "id");
CREATE INDEX "Wiki_createdById_idx" ON "Wiki"("createdById");
