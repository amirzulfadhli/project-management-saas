-- The legacy TimeLog scaffold documented duration in minutes and did not
-- carry Project scope. Refuse to reinterpret or attribute any unexpected rows.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "TimeLog") THEN
    RAISE EXCEPTION 'Cannot migrate legacy TimeLog rows safely: duration units and Project scope are ambiguous';
  END IF;
END $$;

ALTER TABLE "TimeLog" DROP CONSTRAINT "TimeLog_taskId_fkey";

ALTER TABLE "TimeLog"
  ADD COLUMN "projectId" TEXT NOT NULL,
  ADD COLUMN "activeMarker" BOOLEAN,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "startTime" TYPE TIMESTAMPTZ(3) USING "startTime" AT TIME ZONE 'UTC',
  ALTER COLUMN "endTime" TYPE TIMESTAMPTZ(3) USING "endTime" AT TIME ZONE 'UTC';

ALTER TABLE "TimeLog"
  ADD CONSTRAINT "TimeLog_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "TimeLog_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TimeLog_active_state_check"
    CHECK (
      ("activeMarker" = TRUE AND "endTime" IS NULL AND "duration" IS NULL)
      OR
      ("activeMarker" IS NULL AND "endTime" IS NOT NULL AND "duration" IS NOT NULL
       AND "endTime" > "startTime" AND "duration" > 0)
    );

CREATE UNIQUE INDEX "TimeEntry_userId_activeMarker_key"
  ON "TimeLog"("userId", "activeMarker");
CREATE INDEX "TimeLog_taskId_startTime_id_idx"
  ON "TimeLog"("taskId", "startTime", "id");
CREATE INDEX "TimeLog_projectId_startTime_id_idx"
  ON "TimeLog"("projectId", "startTime", "id");
CREATE INDEX "TimeLog_userId_startTime_id_idx"
  ON "TimeLog"("userId", "startTime", "id");
