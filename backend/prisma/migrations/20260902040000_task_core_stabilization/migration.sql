-- Support the current Task list and board lookup paths.
CREATE INDEX "Task_projectId_createdAt_idx"
  ON "Task"("projectId", "createdAt");

CREATE INDEX "Task_columnId_idx"
  ON "Task"("columnId");
