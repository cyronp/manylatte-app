CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "CanvasNode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "roomId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "x" REAL NOT NULL,
  "y" REAL NOT NULL,
  "emoji" TEXT,
  "label" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CanvasNode_roomId_createdAt_id_idx" ON "CanvasNode"("roomId", "createdAt", "id");

CREATE TABLE "CanvasMessage" (
  "sequence" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "id" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "authorUsername" TEXT NOT NULL,
  "authorColor" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CanvasMessage_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "CanvasNode"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CanvasMessage_id_key" ON "CanvasMessage"("id");
CREATE INDEX "CanvasMessage_nodeId_createdAt_id_idx" ON "CanvasMessage"("nodeId", "createdAt", "id");
