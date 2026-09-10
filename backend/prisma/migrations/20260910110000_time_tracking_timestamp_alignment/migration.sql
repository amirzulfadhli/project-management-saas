-- Align the evolved legacy table with the Prisma model without rewriting the
-- already-deployed time-tracking migration.
ALTER TABLE "TimeLog"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" DROP DEFAULT;
