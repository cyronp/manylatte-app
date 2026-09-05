import { readFile } from 'node:fs/promises';
import { createDatabase } from '@app/db';

export const createTestDatabase = async (url = 'file::memory:') => {
  const database = createDatabase(url);
  const migrations = [
    '20260905000000_initial_sqlite',
    '20260905010000_add_emoji_author',
  ];
  const sql = (
    await Promise.all(
      migrations.map((migration) =>
        readFile(
          new URL(
            `../../../packages/db/prisma/migrations/${migration}/migration.sql`,
            import.meta.url,
          ),
          'utf8',
        ),
      ),
    )
  ).join('\n');
  for (const statement of sql
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)) {
    await database.$executeRawUnsafe(statement);
  }
  return database;
};
