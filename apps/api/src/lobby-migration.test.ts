import { readFile } from 'node:fs/promises';
import { createDatabase } from '@app/db';
import { expect, it } from 'vitest';

it('assigns codes to existing lobbies while preserving their identity and metadata', async () => {
  const database = createDatabase('file::memory:');
  const migrate = async (name: string) => {
    const sql = await readFile(
      new URL(
        `../../../packages/db/prisma/migrations/${name}/migration.sql`,
        import.meta.url,
      ),
      'utf8',
    );
    for (const statement of sql
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)) {
      await database.$executeRawUnsafe(statement);
    }
  };
  try {
    await migrate('20260907000000_add_lobbies');
    await database.$executeRawUnsafe(
      `INSERT INTO "Lobby" ("id", "name", "createdAt") VALUES ('existing-id', 'Existing friends', '2026-09-06 12:00:00'), ('empty-id', 'Empty lobby', '2026-09-06 12:00:00')`,
    );
    await migrate('20260907010000_add_lobby_codes');
    const lobbies = await database.lobby.findMany({ orderBy: { id: 'asc' } });
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
