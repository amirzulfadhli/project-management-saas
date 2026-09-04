-- Restrict project membership roles to the values used by the application.
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'MEMBER');

-- Refuse to silently coerce unknown historical roles.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ProjectMember"
    WHERE LOWER("role") NOT IN ('owner', 'member')
  ) THEN
    RAISE EXCEPTION 'ProjectMember contains unsupported role values';
  END IF;
END
$$;

ALTER TABLE "ProjectMember"
  ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "ProjectMember"
  ALTER COLUMN "role" TYPE "ProjectRole"
  USING (UPPER("role")::"ProjectRole");

ALTER TABLE "ProjectMember"
  ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- Support active/archived organization lists and user-based access checks.
CREATE INDEX "Project_organizationId_archivedAt_idx"
  ON "Project"("organizationId", "archivedAt");

CREATE INDEX "ProjectMember_userId_idx"
  ON "ProjectMember"("userId");
