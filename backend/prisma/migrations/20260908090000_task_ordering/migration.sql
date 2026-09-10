-- Task ordering is Column-local. Refuse to rank historically contradictory
-- Task/Column rows rather than silently assigning them to the wrong scope.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Task" AS task
    JOIN "Column" AS column_record ON column_record."id" = task."columnId"
    WHERE task."projectId" <> column_record."projectId"
  ) THEN
    RAISE EXCEPTION 'Cannot add Task ordering: a Task belongs to a different Project than its Column';
  END IF;
END $$;

ALTER TABLE "Task" ADD COLUMN "position" INTEGER;

-- Preserve the prior deterministic board behavior while creating an explicit
-- stable order: older Tasks first, with UUID as the tie-breaker.
WITH ranked_tasks AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "columnId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) - 1 AS new_position
  FROM "Task"
)
UPDATE "Task" AS task
SET "position" = ranked_tasks.new_position
FROM ranked_tasks
WHERE task."id" = ranked_tasks."id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Task" WHERE "position" IS NULL) THEN
    RAISE EXCEPTION 'Cannot add Task ordering: at least one Task could not be ranked';
  END IF;
END $$;

ALTER TABLE "Task" ALTER COLUMN "position" SET NOT NULL;

-- This unique index replaces the former Column-only lookup index because its
-- leading column supports the same access path while enforcing integrity.
DROP INDEX "Task_columnId_idx";
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_columnId_position_key" UNIQUE ("columnId", "position");
