-- Extend the existing, unused Issue scaffold into the verified Issue-to-Task
-- link record. Legacy rows, if any, keep their data and receive opaque legacy
-- identity values rather than fabricated GitHub IDs.
ALTER TABLE "Issue"
ADD COLUMN "externalIssueId" TEXT,
ADD COLUMN "projectId" TEXT,
ADD COLUMN "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "unavailableAt" TIMESTAMP(3);

UPDATE "Issue" AS issue
SET
  "externalIssueId" = 'legacy:' || issue."id",
  "projectId" = repository."projectId"
FROM "Repository" AS repository
WHERE repository."id" = issue."repositoryId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Issue"
    WHERE "taskId" IS NOT NULL
    GROUP BY "taskId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one GitHub Issue per Task: duplicate legacy Task links exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Issue"
    GROUP BY "repositoryId", "number"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce GitHub Issue identity: duplicate legacy repository/number rows exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "Issue_taskId_key" ON "Issue"("taskId");
CREATE UNIQUE INDEX "Issue_repositoryId_externalIssueId_key"
ON "Issue"("repositoryId", "externalIssueId");
CREATE UNIQUE INDEX "Issue_repositoryId_number_key"
ON "Issue"("repositoryId", "number");
CREATE INDEX "Issue_projectId_updatedAt_idx"
ON "Issue"("projectId", "updatedAt");

ALTER TABLE "Issue"
ADD CONSTRAINT "Issue_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
