-- Store only stable GitHub App installation metadata and short-lived OAuth
-- state. Existing repository connections remain valid and nullable until they
-- are rebound through verified GitHub App discovery.
CREATE TABLE "GithubInstallation" (
    "id" TEXT NOT NULL,
    "externalInstallationId" TEXT NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "connectedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GithubInstallation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GithubAppState" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "pendingInstallationId" TEXT,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GithubAppState_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Repository"
ADD COLUMN "githubInstallationId" TEXT;

CREATE UNIQUE INDEX "GithubInstallation_externalInstallationId_key"
ON "GithubInstallation"("externalInstallationId");

CREATE INDEX "GithubInstallation_connectedById_createdAt_idx"
ON "GithubInstallation"("connectedById", "createdAt");

CREATE UNIQUE INDEX "GithubAppState_stateHash_key"
ON "GithubAppState"("stateHash");

CREATE INDEX "GithubAppState_userId_expiresAt_idx"
ON "GithubAppState"("userId", "expiresAt");

CREATE INDEX "Repository_githubInstallationId_idx"
ON "Repository"("githubInstallationId");

ALTER TABLE "GithubInstallation"
ADD CONSTRAINT "GithubInstallation_connectedById_fkey"
FOREIGN KEY ("connectedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GithubAppState"
ADD CONSTRAINT "GithubAppState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Repository"
ADD CONSTRAINT "Repository_githubInstallationId_fkey"
FOREIGN KEY ("githubInstallationId") REFERENCES "GithubInstallation"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
