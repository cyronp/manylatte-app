CREATE TABLE "new_Lobby" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Lobby" ("id", "code", "name", "createdAt")
  SELECT "id", upper(hex(randomblob(4))), "name", "createdAt" FROM "Lobby";
UPDATE "new_Lobby" SET "code" = substr("code", 1, 4) || '-' || substr("code", 5, 4);
DROP TABLE "Lobby";
ALTER TABLE "new_Lobby" RENAME TO "Lobby";
CREATE UNIQUE INDEX "Lobby_code_key" ON "Lobby"("code");
