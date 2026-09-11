-- Existing lobbies have no verifiable creator and cannot be claimed by visitors.
ALTER TABLE "Lobby" ADD COLUMN "ownerId" TEXT;
