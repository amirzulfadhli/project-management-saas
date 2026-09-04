-- Align the original authentication tables with Better Auth 1.7.
ALTER TABLE "User"
ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Session"
RENAME COLUMN "sessionToken" TO "token";

ALTER TABLE "Session"
RENAME COLUMN "expires" TO "expiresAt";

ALTER TABLE "Session"
ADD COLUMN "ipAddress" TEXT,
ADD COLUMN "userAgent" TEXT;

ALTER INDEX "Session_sessionToken_key" RENAME TO "Session_token_key";

CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_issuer_accountId_key"
ON "Account"("issuer", "accountId");

CREATE INDEX "Account_userId_idx" ON "Account"("userId");

CREATE INDEX "Verification_identifier_idx"
ON "Verification"("identifier");

ALTER TABLE "Account"
ADD CONSTRAINT "Account_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
