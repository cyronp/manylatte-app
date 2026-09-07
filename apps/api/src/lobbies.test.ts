import { randomUUID } from 'node:crypto';
import type {
  CanvasNode,
  CanvasSnapshot,
  CursorSession,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@app/shared';
import { io, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './app.js';
import { createTestDatabase } from '../test/database.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const nextEvent = <T>(subscribe: (resolve: (value: T) => void) => void) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for lobby event')),
      2000,
    );
    subscribe((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });

describe('lobbies', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  const clients: Client[] = [];
  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    await app?.close();
  });
  const start = async () => {
    app = await createApp({
      database: await createTestDatabase(),
      logger: false,
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
  };
  const create = (name = 'Friends') =>
    app.inject({ method: 'POST', url: '/lobbies', payload: { name } });
  const clientFor = (roomId: string) => {
    const address = app.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing address');
    const client: Client = io(`http://127.0.0.1:${address.port}`, {
      auth: { roomId, username: `Friend ${clients.length}` },
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
    });
    clients.push(client);
    return client;
  };
  const join = async (roomId: string) => {
    const client = clientFor(roomId);
    const session = nextEvent<CursorSession>((resolve) =>
      client.once('cursor:session', resolve),
    );
    const snapshot = nextEvent<CanvasSnapshot>((resolve) =>
      client.once('canvas:snapshot', resolve),
    );
    client.connect();
    return { client, session: await session, snapshot: await snapshot };
  };

  it('creates unique, validated lobbies and rejects invalid or unknown invites', async () => {
    await start();
    const response = await create('  Coffee friends  ');
    expect(response.statusCode).toBe(201);
    const lobby = response.json();
    expect(lobby).toEqual({
      id: expect.any(String),
      code: expect.stringMatching(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/),
      name: 'Coffee friends',
    });
    expect((await create()).json().id).not.toBe(lobby.id);
    expect((await app.inject(`/lobbies/${lobby.id}`)).json()).toEqual(lobby);
    expect((await app.inject(`/lobbies/${lobby.code}`)).json()).toEqual(lobby);
    expect(
      (
        await app.inject(
          `/lobbies/${lobby.code.toLowerCase().replace('-', '')}`,
        )
      ).json(),
    ).toEqual(lobby);
    expect((await create('  ')).statusCode).toBe(400);
    expect((await create('a'.repeat(65))).statusCode).toBe(400);
    expect((await create('bad\u202ename')).statusCode).toBe(400);
    expect((await app.inject('/lobbies/bad%20id')).statusCode).toBe(400);
    expect((await app.inject(`/lobbies/${randomUUID()}`)).statusCode).toBe(404);
    const invalid = clientFor(randomUUID());
    const error = nextEvent<Error>((resolve) =>
      invalid.once('connect_error', resolve),
    );
    invalid.connect();
    expect((await error).message).toBe('Cursor room access denied');
  });

  it('rejects the retired public lobby over HTTP and sockets', async () => {
    await start();
    expect((await app.inject('/lobbies/lobby')).statusCode).toBe(404);
    const client = clientFor('lobby');
    const error = nextEvent<Error>((resolve) =>
      client.once('connect_error', resolve),
    );
    client.connect();
    expect((await error).message).toBe('Cursor room access denied');
  });

  it('limits creation and rejects requests from unapproved origins', async () => {
    await start();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/lobbies',
          headers: { origin: 'https://unapproved.example' },
          payload: { name: 'No' },
        })
      ).statusCode,
    ).toBe(403);
    for (let index = 0; index < 9; index++)
      expect((await create()).statusCode).toBe(201);
    const limited = await create();
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('shares presence and live edits only with friends in the same lobby', async () => {
    await start();
    const firstId = (await create()).json().id as string;
    const secondId = (await create()).json().id as string;
    const first = await join(firstId);
    const other = await join(secondId);
    const otherPresence = vi.fn();
    other.client.on('cursor:presence', otherPresence);
    const friend = await join(firstId);
    expect(friend.session.users).toHaveLength(2);
    expect(friend.session.users.map((user) => user.userId)).toContain(
      first.session.self.userId,
    );
    const otherUpdates = vi.fn();
    other.client.on('canvas:node-upsert', otherUpdates);
    const friendUpdate = nextEvent<CanvasNode>((resolve) =>
      friend.client.once('canvas:node-upsert', resolve),
    );
    const id = randomUUID();
    first.client.emit('canvas:mutation', {
      action: 'create',
      node: { id, type: 'message', position: { x: 50, y: 60 } },
    });
    expect((await friendUpdate).id).toBe(id);
    expect((await join(firstId)).snapshot.nodes).toHaveLength(1);
    expect((await join(secondId)).snapshot.nodes).toEqual([]);
    expect(otherUpdates).not.toHaveBeenCalled();
    // Later joins in the other rooms generate presence, but never for first-lobby users.
    expect(
      otherPresence.mock.calls.flat().map((user) => user.userId),
    ).not.toContain(friend.session.self.userId);
  });
});
