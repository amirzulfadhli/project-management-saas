-- Add structured, optional event details without rewriting existing rows.
ALTER TABLE "Activity" ADD COLUMN "metadata" JSONB;

-- Support deterministic Project feed pagination.
CREATE INDEX "Activity_projectId_createdAt_id_idx"
  ON "Activity"("projectId", "createdAt", "id");

-- The linked Task is authoritative when an old Activity lacks Project scope.
UPDATE "Activity" AS activity
SET "projectId" = task."projectId"
FROM "Task" AS task
WHERE activity."taskId" = task."id"
  AND activity."projectId" IS NULL;

-- Never silently overwrite contradictory historical scope.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Activity" AS activity
    INNER JOIN "Task" AS task ON task."id" = activity."taskId"
    WHERE activity."projectId" <> task."projectId"
  ) THEN
    RAISE EXCEPTION 'Activity contains Task/Project scope contradictions';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Activity" WHERE "projectId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Activity contains permanently unscoped rows';
  END IF;
END
$$;

ALTER TABLE "Activity"
  DROP CONSTRAINT "Activity_projectId_fkey";

ALTER TABLE "Activity"
  ALTER COLUMN "projectId" SET NOT NULL;

ALTER TABLE "Activity"
  ADD CONSTRAINT "Activity_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
