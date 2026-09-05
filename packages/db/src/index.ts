import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

import { PrismaClient } from './generated/prisma/client.js';
import { resolveDatabaseUrl } from './database-url.js';

export const createDatabase = (url?: string) =>
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({
      url: resolveDatabaseUrl(url),
      timeout: 5_000,
    }),
  });

export const connectDatabase = async (database: PrismaClient) => {
  try {
    await database.$connect();
    await database.$queryRawUnsafe('PRAGMA journal_mode = WAL');
    await database.$queryRawUnsafe('PRAGMA foreign_keys = ON');
    // Select all model columns so missing migrations fail before accepting clients.
    await database.canvasNode.findFirst();
    await database.canvasMessage.findFirst();
  } catch (cause) {
    await database.$disconnect();
    throw new Error(
      'Cannot open the SQLite canvas database. Run npm run db:deploy first.',
      { cause },
    );
  }
};

export { DEFAULT_DATABASE_URL, resolveDatabaseUrl } from './database-url.js';
export type Database = PrismaClient;
export { Prisma } from './generated/prisma/client.js';
export type { User } from './generated/prisma/client.js';
