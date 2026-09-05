import { readFile } from 'node:fs/promises';
import { createDatabase } from '@app/db';

export const createTestDatabase = async (url = 'file::memory:') => {
  const database = createDatabase(url);
  const sql = await readFile(
    new URL(
      '../../../packages/db/prisma/migrations/20260905000000_initial_sqlite/migration.sql',
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
  return database;
};
