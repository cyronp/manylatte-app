import { createDatabase } from '@app/db';
import { expect, it } from 'vitest';

it('assigns codes to existing lobbies while preserving their identity and metadata', async () => {
  const { readMigrations } = await import('../test/database.js');
  const database = createDatabase(
    'file::memory:',
    (await readMigrations(['20260907000000_add_lobbies'])) +
      `
INSERT INTO Lobby (id, name, createdAt) VALUES ('existing-id', 'Existing friends', '2026-09-06 12:00:00'), ('empty-id', 'Empty lobby', '2026-09-06 12:00:00');
` +
      (await readMigrations(['20260907010000_add_lobby_codes'])),
  );
  try {
    const lobbies = await database.lobby.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true, code: true, createdAt: true },
    });
    expect(lobbies).toHaveLength(2);
    expect(lobbies[1]).toMatchObject({
      id: 'existing-id',
      name: 'Existing friends',
      createdAt: new Date('2026-09-06T12:00:00Z'),
    });
    expect(new Set(lobbies.map((lobby) => lobby.code)).size).toBe(2);
    for (const lobby of lobbies)
      expect(lobby.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  } finally {
    await database.$disconnect();
  }
});
