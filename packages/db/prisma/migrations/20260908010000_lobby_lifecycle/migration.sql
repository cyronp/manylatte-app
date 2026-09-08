PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lobby" (
  "id" TEXT NOT NULL PRIMARY KEY, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" DATETIME,
  "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Lobby" ("id", "code", "name", "createdAt", "lastActivityAt")
SELECT "id", "code", "name", "createdAt", "createdAt" FROM "Lobby";
DROP TABLE "Lobby";
ALTER TABLE "new_Lobby" RENAME TO "Lobby";
CREATE UNIQUE INDEX "Lobby_code_key" ON "Lobby"("code");

-- Keep pre-lobby canvases recoverable, but never expose them as active invites.
INSERT INTO "Lobby" ("id", "code", "name", "archivedAt", "lastActivityAt")
SELECT DISTINCT "roomId", 'legacy:' || "roomId", 'Archived legacy canvas', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CanvasNode" WHERE "roomId" NOT IN (SELECT "id" FROM "Lobby");

PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CanvasNode" (
  "id" TEXT NOT NULL PRIMARY KEY, "roomId" TEXT NOT NULL, "type" TEXT NOT NULL,
  "x" REAL NOT NULL, "y" REAL NOT NULL, "emoji" TEXT, "label" TEXT,
  "authorId" TEXT, "authorUsername" TEXT, "authorColor" TEXT,
  "messageCount" INTEGER NOT NULL DEFAULT 0, "textBytes" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CanvasNode_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Lobby" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CanvasNode" SELECT "id", "roomId", "type", "x", "y", "emoji", "label", "authorId", "authorUsername", "authorColor", "messageCount", "textBytes", "createdAt" FROM "CanvasNode";
DROP TABLE "CanvasNode";
ALTER TABLE "new_CanvasNode" RENAME TO "CanvasNode";
CREATE INDEX "CanvasNode_roomId_createdAt_id_idx" ON "CanvasNode"("roomId", "createdAt", "id");
CREATE TABLE "new_CanvasOperation" (
  "roomId" TEXT NOT NULL, "id" TEXT NOT NULL, "hash" TEXT NOT NULL, "result" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("roomId", "id"),
  CONSTRAINT "CanvasOperation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Lobby" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CanvasOperation" SELECT * FROM "CanvasOperation";
DROP TABLE "CanvasOperation";
ALTER TABLE "new_CanvasOperation" RENAME TO "CanvasOperation";
CREATE INDEX "CanvasOperation_createdAt_idx" ON "CanvasOperation"("createdAt");
CREATE INDEX "Lobby_archivedAt_lastActivityAt_idx" ON "Lobby"("archivedAt", "lastActivityAt");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;

CREATE TABLE "_StorageProbe" ("id" INTEGER NOT NULL PRIMARY KEY, "value" INTEGER NOT NULL);
INSERT INTO "_StorageProbe" VALUES (1, 0);
