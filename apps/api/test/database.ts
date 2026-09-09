import { readdir, readFile } from 'node:fs/promises';
import { createDatabase } from '@app/db';

export const migrationDirectory = new URL(
  '../../../packages/db/prisma/migrations/',
  import.meta.url,
);
export const readMigrations = async (names?: string[]) => {
  const selected =
    names ??
    (await readdir(migrationDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  return (
    await Promise.all(
      selected.map((name) =>
        readFile(new URL(`${name}/migration.sql`, migrationDirectory), 'utf8'),
      ),
    )
  ).join('\n');
};
export const createTestDatabase = async (url = 'file::memory:') => {
  const database = createDatabase(url, await readMigrations());
  await database.$connect();
  return database;
};
