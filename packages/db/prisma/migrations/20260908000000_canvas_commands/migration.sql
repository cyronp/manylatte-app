ALTER TABLE "CanvasNode" ADD COLUMN "messageCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CanvasNode" ADD COLUMN "textBytes" INTEGER NOT NULL DEFAULT 0;
UPDATE "CanvasNode" SET "messageCount" = (SELECT count(*) FROM "CanvasMessage" WHERE "nodeId" = "CanvasNode"."id"),
  "textBytes" = coalesce((SELECT sum(length(CAST("text" AS BLOB))) FROM "CanvasMessage" WHERE "nodeId" = "CanvasNode"."id"), 0);
DROP INDEX "CanvasMessage_nodeId_createdAt_id_idx";
CREATE INDEX "CanvasMessage_nodeId_sequence_idx" ON "CanvasMessage"("nodeId", "sequence");
CREATE TABLE "CanvasOperation" (
  "roomId" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("roomId", "id")
);
CREATE INDEX "CanvasOperation_createdAt_idx" ON "CanvasOperation"("createdAt");
