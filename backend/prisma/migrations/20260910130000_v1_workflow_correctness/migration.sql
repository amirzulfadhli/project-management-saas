-- Tighten the GitHub Issue link identity after the compatibility migration
-- backfilled every legacy row. The composite foreign key makes Project scope
-- authoritative at the database boundary as well as in the service.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Issue"
    WHERE "externalIssueId" IS NULL OR "projectId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot tighten GitHub Issue links while incomplete legacy rows remain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Issue" AS issue
    INNER JOIN "Repository" AS repository ON repository."id" = issue."repositoryId"
    WHERE repository."projectId" IS DISTINCT FROM issue."projectId"
  ) THEN
    RAISE EXCEPTION 'Cannot tighten GitHub Issue links with mismatched Projects';
  END IF;
END $$;

ALTER TABLE "Issue"
ALTER COLUMN "externalIssueId" SET NOT NULL,
ALTER COLUMN "projectId" SET NOT NULL;

CREATE UNIQUE INDEX "Repository_id_projectId_key"
ON "Repository"("id", "projectId");

ALTER TABLE "Issue" DROP CONSTRAINT "Issue_repositoryId_fkey";
ALTER TABLE "Issue"
ADD CONSTRAINT "Issue_repositoryId_projectId_fkey"
FOREIGN KEY ("repositoryId", "projectId") REFERENCES "Repository"("id", "projectId")
ON DELETE RESTRICT ON UPDATE CASCADE;
