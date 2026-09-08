import 'dotenv/config';
import { constants } from 'node:fs';
import { copyFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDatabase, connectDatabase } from '../dist/index.js';

export async function backup(database, destination) {
  const path = resolve(destination);
  // SQLite refuses an existing destination and includes committed WAL data.
  await database.$executeRawUnsafe('VACUUM INTO ?', path);
  const verification = createDatabase(`file:${path}`);
  try {
    const result = await verification.$queryRawUnsafe('PRAGMA integrity_check');
    if (result.length !== 1 || result[0].integrity_check !== 'ok')
      throw new Error('Backup failed integrity check');
  } finally {
    await verification.$disconnect();
  }
  return path;
}

export async function restore(source, destination) {
  const original = resolve(source);
  const target = resolve(destination);
  if (!(await stat(original)).isFile())
    throw new Error('Backup must be a regular file');
  const verification = createDatabase(`file:${original}`);
  try {
    const result = await verification.$queryRawUnsafe('PRAGMA integrity_check');
    if (result.length !== 1 || result[0].integrity_check !== 'ok')
      throw new Error('Backup failed integrity check');
  } finally {
    await verification.$disconnect();
  }
  await copyFile(original, target, constants.COPYFILE_EXCL);
  return target;
}

export async function run(args) {
  const [command, target, destination] = args;
  if (command === 'restore') {
    if (!target || !destination)
      throw new Error('Usage: restore BACKUP NEW_DATABASE_PATH');
    return { restored: await restore(target, destination) };
  }
  const database = createDatabase(process.env.DATABASE_URL);
  try {
    await connectDatabase(database);
    if (command === 'backup' && target)
      return { backup: await backup(database, target) };
    if (command === 'list')
      return database.lobby.findMany({
        take: 1_000,
        orderBy: { lastActivityAt: 'asc' },
        select: {
          id: true,
          name: true,
          archivedAt: true,
          lastActivityAt: true,
          _count: { select: { nodes: true, operations: true } },
        },
      });
    if (command === 'stats')
      return {
        lobbies: await database.lobby.count(),
        nodes: await database.canvasNode.count(),
        messages: await database.canvasMessage.count(),
        receipts: await database.canvasOperation.count(),
      };
    if (!args.includes('--offline'))
      throw new Error(
        'Stop the API and pass --offline for archive, delete, or prune-receipts. Other commands: stats, list, backup PATH, restore BACKUP NEW_PATH.',
      );
    if (command === 'archive' && target)
      return database.lobby.update({
        where: { id: target },
        data: { archivedAt: new Date() },
        select: { id: true, archivedAt: true },
      });
    if (command === 'delete' && target) {
      const lobby = await database.lobby.findUnique({ where: { id: target } });
      if (!lobby?.archivedAt)
        throw new Error('Archive the lobby before permanently deleting it');
      await database.lobby.delete({ where: { id: target } });
      return { deleted: target };
    }
    if (command === 'prune-receipts')
      return database.canvasOperation.deleteMany({
        where: {
          createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000) },
        },
      });
    throw new Error('Unknown command or missing lobby ID');
  } finally {
    await database.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url ===
    (await import('node:url')).pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    console.log(JSON.stringify(await run(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Operation failed');
    process.exitCode = 1;
  }
}
