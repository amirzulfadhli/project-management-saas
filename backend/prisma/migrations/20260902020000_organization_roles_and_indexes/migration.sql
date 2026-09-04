-- Constrain organization membership roles to the values supported by the
-- onboarding authorization model.
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'MEMBER');

ALTER TABLE "OrganizationMember"
ALTER COLUMN "role" DROP DEFAULT,
ALTER COLUMN "role" TYPE "OrganizationRole"
USING (UPPER("role")::"OrganizationRole"),
ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- PostgreSQL does not automatically index foreign-key columns. These indexes
-- support the owner and membership lookups used by the organization routes.
CREATE INDEX "Organization_ownerId_idx" ON "Organization"("ownerId");

CREATE INDEX "OrganizationMember_userId_idx"
ON "OrganizationMember"("userId");
