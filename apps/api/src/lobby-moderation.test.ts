import { randomUUID } from 'node:crypto';
import type { Database } from '@app/db';
import type {
  ClientToServerEvents,
  CursorSession,
  LobbyOwnership,
  ServerToClientEvents,
} from '@app/shared';
import { io, type Socket } from 'socket.io-client';
import { afterEach, expect, it, vi } from 'vitest';
import { createTestDatabase } from '../test/database.js';
import { createApp } from './app.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
let app: Awaited<ReturnType<typeof createApp>>;
let database: Database;
const clients: Client[] = [];
afterEach(async () => {
  clients.splice(0).forEach((client) => client.disconnect());
  await app?.close();
});
async function start() {
  database = await createTestDatabase();
  app = await createApp({ database, logger: false, maxConnectionsPerIp: 30 });
  await app.listen({ host: '127.0.0.1', port: 0 });
}
async function create() {
  const response = await app.inject({
    method: 'POST',
    url: '/lobbies',
    payload: { name: 'Friends' },
  });
  return response.json() as { id: string; token: string };
}
function event<T>(subscribe: (resolve: (value: T) => void) => void) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Missing lobby event')),
      3000,
    );
    subscribe((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}
async function join(id: string, token = randomUUID()) {
  const address = app.server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing address');
  const client: Client = io(`http://127.0.0.1:${address.port}`, {
    auth: { roomId: id, token, username: 'Friend' },
    autoConnect: false,
    reconnection: false,
    transports: ['websocket'],
  });
  clients.push(client);
  const session = event<CursorSession>((resolve) =>
    client.once('cursor:session', resolve),
  );
  const ownership = event<LobbyOwnership>((resolve) =>
    client.once('lobby:ownership', resolve),
  );
  client.connect();
  return { client, token, session: await session, ownership: await ownership };
}

it('reserves ownership for the creator, persists it, and does not expose credentials in invites or presence', async () => {
  await start();
  const lobby = await create();
  const guest = await join(lobby.id);
  const owner = await join(lobby.id, lobby.token);
  expect(guest.ownership.ownerId).toBe(owner.session.self.userId);
  expect(owner.ownership.ownerId).toBe(owner.session.self.userId);
  expect(JSON.stringify(owner.session)).not.toContain(lobby.token);
  expect((await app.inject(`/lobbies/${lobby.id}`)).json()).not.toHaveProperty(
    'token',
  );
  expect(
    (await database.lobby.findUnique({ where: { id: lobby.id } }))?.ownerId,
  ).toBe(owner.session.self.userId);
  owner.client.disconnect();
  const rejoined = await join(lobby.id, lobby.token);
  expect(rejoined.session.self.userId).toBe(owner.session.self.userId);
  expect(rejoined.ownership.ownerId).toBe(rejoined.session.self.userId);
  const forged = await join(lobby.id, owner.session.self.userId);
  expect(forged.session.self.userId).not.toBe(owner.session.self.userId);
});

it('denies guests, self actions, invalid targets, cross-lobby targets and malformed commands', async () => {
  await start();
  const lobby = await create();
  const owner = await join(lobby.id, lobby.token);
  const guest = await join(lobby.id);
  const other = await join((await create()).id);
  for (const action of ['kick', 'transfer'] as const) {
    const send = (client: Client, userId: string) =>
      client.timeout(2000).emitWithAck('lobby:moderate', { action, userId });
    expect(await send(guest.client, owner.session.self.userId)).toMatchObject({
      ok: false,
    });
    expect(await send(owner.client, owner.session.self.userId)).toMatchObject({
      ok: false,
    });
    expect(await send(owner.client, other.session.self.userId)).toMatchObject({
      ok: false,
    });
    expect(await send(owner.client, randomUUID())).toMatchObject({ ok: false });
  }
  expect(
    await owner.client
      .timeout(2000)
      .emitWithAck('lobby:moderate', { action: 'kick', userId: 'invalid' }),
  ).toMatchObject({ ok: false });
  expect(
    owner.client.connected && guest.client.connected && other.client.connected,
  ).toBe(true);
});

it('transfers the single owner atomically, revokes the former owner, and kicks every connection of a user', async () => {
  await start();
  const lobby = await create();
  const owner = await join(lobby.id, lobby.token);
  const guest = await join(lobby.id);
  const ownerTab = await join(lobby.id, lobby.token);
  expect(ownerTab.session.users).toHaveLength(2);
  const changed = event<LobbyOwnership>((resolve) =>
    guest.client.once('lobby:ownership', resolve),
  );
  expect(
    await owner.client.timeout(2000).emitWithAck('lobby:moderate', {
      action: 'transfer',
      userId: guest.session.self.userId,
    }),
  ).toEqual({ ok: true });
  expect(await changed).toEqual({ ownerId: guest.session.self.userId });
  expect(
    await ownerTab.client.timeout(2000).emitWithAck('lobby:moderate', {
      action: 'kick',
      userId: guest.session.self.userId,
    }),
  ).toMatchObject({ ok: false });
  guest.client.disconnect();
  const newOwner = await join(lobby.id, guest.token);
  expect(newOwner.ownership.ownerId).toBe(newOwner.session.self.userId);
  const notices = [owner, ownerTab].map(({ client }) =>
    event<{ reason: string }>((resolve) =>
      client.once('cursor:disconnect', resolve),
    ),
  );
  const disconnected = [owner, ownerTab].map(({ client }) =>
    event<string>((resolve) => client.once('disconnect', resolve)),
  );
  const removed = event<{ userId: string }>((resolve) =>
    newOwner.client.once('cursor:remove', resolve),
  );
  expect(
    await newOwner.client.timeout(2000).emitWithAck('lobby:moderate', {
      action: 'kick',
      userId: owner.session.self.userId,
    }),
  ).toEqual({ ok: true });
  expect(await Promise.all(notices)).toEqual([
    { reason: 'kicked' },
    { reason: 'kicked' },
  ]);
  await Promise.all(disconnected);
  expect((await removed).userId).toBe(owner.session.self.userId);
  const denied = event<
    Error & { data: { reason: string; retryable: boolean } }
  >((resolve) => owner.client.once('connect_error', resolve));
  const leakedSession = vi.fn();
  const leakedCanvas = vi.fn();
  owner.client.on('cursor:session', leakedSession);
  owner.client.on('canvas:snapshot', leakedCanvas);
  owner.client.connect();
  expect((await denied).data).toEqual({ reason: 'kicked', retryable: false });
  expect(leakedSession).not.toHaveBeenCalled();
  expect(leakedCanvas).not.toHaveBeenCalled();
  expect((await join((await create()).id, lobby.token)).client.connected).toBe(
    true,
  );
});

it('keeps the user connected if saving the ban fails', async () => {
  await start();
  const lobby = await create();
  const owner = await join(lobby.id, lobby.token);
  const guest = await join(lobby.id);
  const save = vi
    .spyOn(database.lobbyBan, 'upsert')
    .mockRejectedValueOnce(new Error('Disk unavailable'));
  expect(
    await owner.client.timeout(2000).emitWithAck('lobby:moderate', {
      action: 'kick',
      userId: guest.session.self.userId,
    }),
  ).toMatchObject({ ok: false });
  expect(guest.client.connected).toBe(true);
  expect(await database.lobbyBan.count()).toBe(0);
  save.mockRestore();
});

it('blocks admission that races with a kick before publishing any presence', async () => {
  await start();
  const lobby = await create();
  const owner = await join(lobby.id, lobby.token);
  const guest = await join(lobby.id);
  const original = database.lobbyBan.upsert.bind(database.lobbyBan);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const save = vi
    .spyOn(database.lobbyBan, 'upsert')
    .mockImplementation(async (args) => {
      await hold;
      return original(args);
    });
  const kicked = owner.client.timeout(2000).emitWithAck('lobby:moderate', {
    action: 'kick',
    userId: guest.session.self.userId,
  });
  await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
  const address = app.server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing address');
  const concurrent: Client = io(`http://127.0.0.1:${address.port}`, {
    auth: { roomId: lobby.id, token: guest.token },
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
  });
  clients.push(concurrent);
  const session = vi.fn();
  concurrent.on('cursor:session', session);
  const denied = event<Error & { data: { reason: string } }>((resolve) =>
    concurrent.once('connect_error', resolve),
  );
  const queried = vi.spyOn(database.lobby, 'findUnique');
  concurrent.connect();
  await vi.waitFor(() => expect(queried).toHaveBeenCalled());
  release();
  expect(await kicked).toEqual({ ok: true });
  expect((await denied).data.reason).toBe('kicked');
  expect(session).not.toHaveBeenCalled();
  save.mockRestore();
  queried.mockRestore();
});

it('allows only one concurrent ownership transfer and preserves ownership when everyone leaves', async () => {
  await start();
  const lobby = await create();
  const first = await join(lobby.id, lobby.token);
  const second = await join(lobby.id, lobby.token);
  const guest = await join(lobby.id);
  const another = await join(lobby.id);
  const results = await Promise.all([
    first.client.timeout(2000).emitWithAck('lobby:moderate', {
      action: 'transfer',
      userId: guest.session.self.userId,
    }),
    second.client.timeout(2000).emitWithAck('lobby:moderate', {
      action: 'transfer',
      userId: another.session.self.userId,
    }),
  ]);
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  const winner = results[0]!.ok ? guest : another;
  for (const client of clients) client.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect((await join(lobby.id, winner.token)).ownership.ownerId).toBe(
    winner.session.self.userId,
  );
});

it('does not let visitors claim legacy lobbies with no recorded creator', async () => {
  await start();
  await database.lobby.create({
    data: { id: 'legacy', code: 'TEST-1234', name: 'Legacy' },
  });
  const first = await join('legacy');
  const second = await join('legacy');
  expect(first.ownership.ownerId).toBeNull();
  expect(
    await first.client.timeout(2000).emitWithAck('lobby:moderate', {
      action: 'transfer',
      userId: second.session.self.userId,
    }),
  ).toMatchObject({ ok: false });
});
