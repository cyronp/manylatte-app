import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createDatabase } from '@app/db';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  CanvasSnapshot,
  CanvasNode,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@app/shared';
import type { Socket } from 'socket.io-client';

import { createApp } from './app.js';
import { createTestDatabase } from '../test/database.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const nextEvent = <T>(subscribe: (resolve: (value: T) => void) => void) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for server event')),
      2_000,
    );
    subscribe((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });

describe('persistent API lifecycle', () => {
  let directory: string | undefined;
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  const clients: Client[] = [];
  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    await app?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  const connect = async () => {
    const address = app!.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing server address');
    const socket: Client = io(`http://127.0.0.1:${address.port}`, {
      auth: { roomId: 'lobby', username: 'Persistence test' },
      autoConnect: false,
      reconnection: false,
      // Cover the polling transport as well as the existing WebSocket tests.
      transports: ['polling'],
    });
    clients.push(socket);
    const snapshot = nextEvent<CanvasSnapshot>((resolve) =>
      socket.once('canvas:snapshot', resolve),
    );
    socket.connect();
    return { socket, snapshot: await snapshot };
  };

  it('keeps content after the last disconnect and after closing/reopening the database', async () => {
    directory = await mkdtemp(join(tmpdir(), 'manylatte-sqlite-test-'));
    const databaseUrl = `file:${join(directory, 'canvas.db')}`;
    app = await createApp({
      database: await createTestDatabase(databaseUrl),
      logger: false,
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const first = await connect();
    const nodeId = randomUUID();
    const created = nextEvent<CanvasNode>((resolve) =>
      first.socket.once('canvas:node-upsert', resolve),
    );
    first.socket.emit('canvas:mutation', {
      action: 'create',
      node: { id: nodeId, type: 'message', position: { x: 50, y: 60 } },
    });
    await created;
    const saved = nextEvent<CanvasNode>((resolve) =>
      first.socket.once('canvas:node-upsert', resolve),
    );
    first.socket.emit('canvas:message-send', {
      nodeId,
      id: randomUUID(),
      text: 'Survives restart',
    });
    const expectedNode = await saved;
    const reactionCreated = nextEvent<CanvasNode>((resolve) =>
      first.socket.once('canvas:node-upsert', resolve),
    );
    first.socket.emit('canvas:mutation', {
      action: 'create',
      node: {
        id: randomUUID(),
        type: 'emoji',
        position: { x: 70, y: 80 },
        data: { emoji: '☕', label: 'Coffee' },
      },
    });
    const expectedReaction = await reactionCreated;
    expect(expectedReaction).toMatchObject({
      data: { user: { username: 'Persistence test' } },
    });
    first.socket.disconnect();
    const second = await connect();
    expect(second.snapshot.nodes).toEqual([expectedNode, expectedReaction]);
    second.socket.disconnect();
    await app.close();
    app = await createApp({ databaseUrl, logger: false });
    await app.listen({ host: '127.0.0.1', port: 0 });
    expect((await connect()).snapshot.nodes).toEqual([
      expectedNode,
      expectedReaction,
    ]);
    expect((await app.inject('/healthz')).statusCode).toBe(200);
    expect((await app.inject('/readyz')).statusCode).toBe(200);
  });

  it('fails closed for a database without migrations or unsupported Redis scaling', async () => {
    await expect(
      createApp({ databaseUrl: 'file::memory:', logger: false }),
    ).rejects.toThrow(/db:deploy/);
    await expect(
      createApp({ redisUrl: 'redis://localhost:6379', logger: false }),
    ).rejects.toThrow(/single-instance SQLite/);
  });

  it('rejects a database missing the author migration at startup', async () => {
    const database = createDatabase('file::memory:');
    try {
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
      await expect(createApp({ database, logger: false })).rejects.toThrow(
        /db:deploy/,
      );
    } finally {
      await database.$disconnect();
    }
  });
});
