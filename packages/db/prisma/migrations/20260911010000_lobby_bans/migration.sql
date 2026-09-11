CREATE TABLE "LobbyBan" (
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("roomId", "userId"),
    CONSTRAINT "LobbyBan_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Lobby" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
