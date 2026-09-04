-- Abort rather than silently accepting Comment relationships that violate
-- the Task-scoped thread invariant used by the API.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Comment" c
    LEFT JOIN "Task" t ON t."id" = c."taskId"
    WHERE t."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Comment migration aborted: orphaned task reference exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Comment" c
    JOIN "Comment" p ON p."id" = c."parentId"
    WHERE c."taskId" <> p."taskId"
  ) THEN
    RAISE EXCEPTION 'Comment migration aborted: parent belongs to another task';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Comment" WHERE "id" = "parentId"
  ) THEN
    RAISE EXCEPTION 'Comment migration aborted: self-parenting comment exists';
  END IF;
END $$;

ALTER TABLE "Comment" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "Comment" DROP CONSTRAINT "Comment_taskId_fkey";
ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Comment_taskId_createdAt_id_idx"
  ON "Comment"("taskId", "createdAt", "id");
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");
