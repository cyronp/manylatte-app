import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readdir, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createDatabase, connectDatabase } from '../dist/index.js';
import { backup, restore } from './operations.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'manylatte-migration-'));
const databasePath = join(directory, 'upgrade.db');
const migrationPath = join(directory, 'migrations');
const source = resolve(root, 'packages/db/prisma/migrations');
const config = join(directory, 'prisma.config.mjs');
const deploy = () =>
  promisify(execFile)(
    process.execPath,
    [
      resolve(root, 'node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
      '--config',
      config,
    ],
    { cwd: root, timeout: 60_000 },
  );
let database;
try {
  await mkdir(migrationPath);
  await cp(
    join(source, 'migration_lock.toml'),
    join(migrationPath, 'migration_lock.toml'),
  );
  await writeFile(
    config,
    `export default ${JSON.stringify({ schema: resolve(root, 'packages/db/prisma/schema.prisma'), migrations: { path: migrationPath }, datasource: { url: `file:${databasePath}` } })};`,
  );
  const names = (await readdir(source, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map(({ name }) => name)
    .sort();
  for (const name of names.filter((name) => name < '20260908'))
    await cp(join(source, name), join(migrationPath, name), {
      recursive: true,
    });
  await deploy();
  database = createDatabase(`file:${databasePath}`);
  await database.$executeRawUnsafe(
    "INSERT INTO Lobby (id, code, name) VALUES ('existing', 'TEST-1234', 'Existing lobby')",
  );
  await database.$executeRawUnsafe(
    "INSERT INTO CanvasNode (id, roomId, type, x, y) VALUES ('thread', 'legacy-room', 'message', 20, 30)",
  );
  await database.$executeRawUnsafe(
    "INSERT INTO CanvasMessage (id, nodeId, text, authorId, authorUsername, authorColor) VALUES ('message', 'thread', 'Preserve; this message', 'author', 'Alice', '#193CB8')",
  );
  await database.$disconnect();
  for (const name of names.filter((name) => name >= '20260908'))
    await cp(join(source, name), join(migrationPath, name), {
      recursive: true,
    });
  await deploy();
  await deploy(); // Deploy is repeatable on a populated database.
  database = createDatabase(`file:${databasePath}`);
  await connectDatabase(database);
  assert.equal(await database.canvasMessage.count(), 1);
  assert.equal(
    (await database.canvasNode.findUnique({ where: { id: 'thread' } }))
      .messageCount,
    1,
  );
  assert.ok(
    (await database.lobby.findUnique({ where: { id: 'legacy-room' } }))
      .archivedAt,
  );
  assert.deepEqual(
    await database.$queryRawUnsafe('PRAGMA foreign_key_check'),
    [],
  );
  const backupPath = await backup(database, join(directory, 'backup.db'));
  const restored = await restore(backupPath, join(directory, 'restored.db'));
  await assert.rejects(restore(backupPath, restored));
  const recovered = createDatabase(`file:${restored}`);
  try {
    await connectDatabase(recovered);
    assert.equal(await recovered.canvasMessage.count(), 1);
  } finally {
    await recovered.$disconnect();
  }
  await database.lobby.delete({ where: { id: 'legacy-room' } });
  assert.equal(await database.canvasNode.count(), 0);
  assert.equal(await database.canvasMessage.count(), 0);
  await database.$disconnect();
  // Clean installation through the actual deployment CLI too.
  await writeFile(
    config,
    `export default ${JSON.stringify({ schema: resolve(root, 'packages/db/prisma/schema.prisma'), migrations: { path: migrationPath }, datasource: { url: `file:${join(directory, 'clean.db')}` } })};`,
  );
  await deploy();
  database = createDatabase(`file:${join(directory, 'clean.db')}`);
  await connectDatabase(database);
  assert.equal(await database.lobby.count(), 0);
  console.log(
    'Clean deploy, populated upgrade, repeat deploy, backup/restore and cascading deletion passed.',
  );
} finally {
  await database?.$disconnect();
  await rm(directory, { recursive: true, force: true });
}
