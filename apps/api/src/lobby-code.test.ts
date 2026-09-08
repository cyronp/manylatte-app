import { Prisma } from '@app/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase } from '../test/database.js';
import { generateLobbyCode, persistLobby } from './lobby-code.js';

afterEach(() => vi.restoreAllMocks());

describe('lobby code allocation', () => {
  it('generates eight random alphanumeric characters in two groups', () => {
    const codes = Array.from({ length: 100 }, generateLobbyCode);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('retries a uniqueness collision without losing the requested name', async () => {
    const database = await createTestDatabase();
    try {
      const create = vi.spyOn(database, '$transaction').mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Duplicate code', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      const lobby = await persistLobby(database, 'Coffee friends');
      expect(create).toHaveBeenCalledTimes(2);
      expect(lobby.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(
        await database.lobby.findUnique({ where: { code: lobby.code } }),
      ).toMatchObject({ id: lobby.id, name: 'Coffee friends' });
    } finally {
      await database.$disconnect();
    }
  });

  it('does not retry unrelated database failures', async () => {
    const database = await createTestDatabase();
    try {
      const create = vi
        .spyOn(database, '$transaction')
        .mockRejectedValue(new Error('Database unavailable'));
      await expect(persistLobby(database, 'Friends')).rejects.toThrow(
        'Database unavailable',
      );
      expect(create).toHaveBeenCalledTimes(1);
    } finally {
      await database.$disconnect();
    }
  });
});
