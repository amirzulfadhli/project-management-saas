BEGIN;

-- The legacy File scaffold was never exposed by the application. Task-linked
-- rows can be scoped deterministically; permanently unscoped or contradictory
-- rows must be repaired deliberately rather than guessed or deleted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "File" f
    JOIN "Task" t ON t."id" = f."taskId"
    WHERE f."projectId" IS NOT NULL AND f."projectId" <> t."projectId"
  ) THEN
    RAISE EXCEPTION 'File migration found contradictory File.projectId and Task.projectId values';
  END IF;
END $$;

UPDATE "File" f
SET "projectId" = t."projectId"
FROM "Task" t
WHERE f."projectId" IS NULL AND f."taskId" = t."id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "File" WHERE "projectId" IS NULL) THEN
    RAISE EXCEPTION 'File migration found permanently unscoped rows';
  END IF;
  IF EXISTS (
    SELECT "url" FROM "File" GROUP BY "url" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'File migration found duplicate storage keys';
  END IF;
END $$;

ALTER TABLE "File" DROP CONSTRAINT "File_projectId_fkey";
ALTER TABLE "File" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "File"
  ADD CONSTRAINT "File_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "File_url_key" ON "File"("url");
CREATE INDEX "File_projectId_createdAt_id_idx" ON "File"("projectId", "createdAt", "id");
CREATE INDEX "File_taskId_createdAt_id_idx" ON "File"("taskId", "createdAt", "id");

COMMIT;
