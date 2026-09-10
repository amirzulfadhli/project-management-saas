-- Preserve the original Repository scaffold while adding stable GitHub
-- identity and connection metadata. Nullable identity fields keep this
-- migration safe if an earlier environment contains unused scaffold rows;
-- the public connection service always writes all of them.
ALTER TABLE "Repository"
ADD COLUMN "externalRepositoryId" TEXT,
ADD COLUMN "owner" TEXT,
ADD COLUMN "defaultBranch" TEXT,
ADD COLUMN "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "Repository_provider_externalRepositoryId_key"
ON "Repository"("provider", "externalRepositoryId");

CREATE TABLE "GithubWebhookDelivery" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metadata" JSONB,
    "projectId" TEXT NOT NULL,
    "repositoryId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "GithubWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GithubWebhookDelivery_deliveryId_key"
ON "GithubWebhookDelivery"("deliveryId");

CREATE INDEX "GithubWebhookDelivery_projectId_receivedAt_idx"
ON "GithubWebhookDelivery"("projectId", "receivedAt");

CREATE INDEX "GithubWebhookDelivery_repositoryId_receivedAt_idx"
ON "GithubWebhookDelivery"("repositoryId", "receivedAt");

ALTER TABLE "GithubWebhookDelivery"
ADD CONSTRAINT "GithubWebhookDelivery_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GithubWebhookDelivery"
ADD CONSTRAINT "GithubWebhookDelivery_repositoryId_fkey"
FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
