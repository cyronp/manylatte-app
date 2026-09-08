import { expect, it } from 'vitest';
import { createTestDatabase } from '../test/database.js';
import { createApp } from './app.js';
import { createStorageHealth } from './storage-health.js';

it('enforces durable lobby capacity and makes archived invitations unavailable', async () => {
  const database = await createTestDatabase();
  const app = await createApp({ database, logger: false, maxLobbies: 2 });
  try {
    const responses = await Promise.all(Array.from({ length: 5 }, () => app.inject({ method: 'POST', url: '/lobbies', payload: { name: 'Capacity test' } })));
    expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(2);
    expect(responses.filter((response) => response.statusCode === 503)).toHaveLength(3);
    expect(await database.lobby.count()).toBe(2);
    const lobby = responses.find((response) => response.statusCode === 201)!.json<{ id: string; code: string }>();
    await database.lobby.update({ where: { id: lobby.id }, data: { archivedAt: new Date() } });
    expect((await app.inject(`/lobbies/${lobby.code}`)).statusCode).toBe(404);
    expect((await app.inject(`/lobbies/${lobby.id}`)).statusCode).toBe(404);
  } finally { await app.close(); }
});

it('reports readable but unwritable storage as unavailable and recovers', async () => {
  const database = await createTestDatabase();
  const storage = createStorageHealth(database, 'file::memory:');
  try {
    await storage.check();
    expect(storage.snapshot().storageReady).toBe(true);
    await database.$executeRawUnsafe("CREATE TRIGGER fail_probe BEFORE UPDATE ON _StorageProbe BEGIN SELECT RAISE(ABORT, 'write denied'); END");
    await storage.check();
    expect(storage.snapshot().storageReady).toBe(false);
    await database.$executeRawUnsafe('DROP TRIGGER fail_probe');
    await storage.check();
    expect(storage.snapshot().storageReady).toBe(true);
  } finally { await database.$disconnect(); }
});
