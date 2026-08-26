import type { AddressInfo } from 'node:net';

import {
  CURSOR_EVENTS,
  DEFAULT_CURSOR_ROOM_ID,
  hexColorSchema,
  type ClientToServerEvents,
  type CursorBatch,
  type CursorRemoval,
  type CursorSession,
  type CursorUpdate,
  type CursorUser,
  type HexColor,
  type ServerToClientEvents,
} from '@app/shared';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const withTimeout = <Value>(promise: Promise<Value>, label: string) => {
  let timer: NodeJS.Timeout;

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Timed out waiting for ${label}`)),
        2000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
};

const waitForSession = (socket: TestSocket) =>
  withTimeout(
    new Promise<CursorSession>((resolve) => {
      socket.once(CURSOR_EVENTS.session, resolve);
    }),
    CURSOR_EVENTS.session,
  );

const waitForBatch = (socket: TestSocket) =>
  withTimeout(
    new Promise<CursorBatch>((resolve) => {
      socket.once(CURSOR_EVENTS.batch, resolve);
    }),
    CURSOR_EVENTS.batch,
  );

const waitForClick = (socket: TestSocket) =>
  withTimeout(
    new Promise<CursorUpdate>((resolve) => {
      socket.once(CURSOR_EVENTS.click, resolve);
    }),
    CURSOR_EVENTS.click,
  );

const waitForPresence = (socket: TestSocket) =>
  withTimeout(
    new Promise<CursorUser>((resolve) => {
      socket.once(CURSOR_EVENTS.presence, resolve);
    }),
    CURSOR_EVENTS.presence,
  );

const waitForRemoval = (socket: TestSocket) =>
  withTimeout(
    new Promise<CursorRemoval>((resolve) => {
      socket.once(CURSOR_EVENTS.remove, resolve);
    }),
    CURSOR_EVENTS.remove,
  );

describe('cursor socket server', () => {
  const sockets: TestSocket[] = [];
  let closeApp: (() => Promise<void>) | undefined;

  afterEach(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await closeApp?.();
  });

  const startServer = async (cursorIdleTimeoutMs = 5000) => {
    const app = await createApp({
      cursorIdleTimeoutMs,
      logger: false,
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address() as AddressInfo;
    closeApp = () => app.close();
    return `http://127.0.0.1:${address.port}`;
  };

  const connect = async (
    url: string,
    roomId = DEFAULT_CURSOR_ROOM_ID,
    username: string | null = `Player ${sockets.length + 1}`,
  ) => {
    const socket: TestSocket = createClient(url, {
      auth: username === null ? { roomId } : { roomId, username },
      autoConnect: false,
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
    });
    sockets.push(socket);
    const sessionPromise = waitForSession(socket);
    socket.connect();
    return { session: await sessionPromise, socket };
  };

  it('batches movement, snapshots presence, relays clicks, and removes users', async () => {
    const url = await startServer();
    const first = await connect(url);
    const secondPresence = waitForPresence(first.socket);
    const second = await connect(url);
    expect(await secondPresence).toEqual(second.session.self);
    expect(second.session.users).toContainEqual(first.session.self);
    const firstBatch = waitForBatch(second.socket);

    first.socket.emit(CURSOR_EVENTS.move, {
      sequence: 0,
      x: 0.25,
      y: 0.75,
    });

    const movedCursor = (await firstBatch).cursors.find(
      ({ userId }) => userId === first.session.self.userId,
    );
    expect(movedCursor).toMatchObject({
      sequence: 0,
      x: 0.25,
      y: 0.75,
    });
    expect(movedCursor).not.toHaveProperty('username');

    const changedColor = hexColorSchema.parse('#c026d3');
    const selfColorChange = waitForPresence(first.socket);
    const peerColorChange = waitForPresence(second.socket);
    first.socket.emit(CURSOR_EVENTS.color, { color: changedColor });
    const expectedUser = { ...first.session.self, color: changedColor };
    await expect(selfColorChange).resolves.toEqual(expectedUser);
    await expect(peerColorChange).resolves.toEqual(expectedUser);

    const third = await connect(url);
    expect(third.session.cursors).toContainEqual({
      ...movedCursor,
      color: changedColor,
      username: 'Player 1',
    });

    const clickPromise = waitForClick(second.socket);
    first.socket.emit(CURSOR_EVENTS.click, {
      sequence: 1,
      x: 0.3,
      y: 0.7,
    });
    const click = await clickPromise;
    expect(click).toMatchObject({
      color: changedColor,
      sequence: 1,
      userId: first.session.self.userId,
      x: 0.3,
      y: 0.7,
    });
    expect(click).not.toHaveProperty('username');

    const validBatch = waitForBatch(second.socket);
    first.socket.emit(CURSOR_EVENTS.move, {
      sequence: 2,
      x: 2,
      y: 0.5,
    });
    first.socket.emit(CURSOR_EVENTS.move, {
      sequence: 2,
      x: 0.4,
      y: 0.6,
    });
    expect(await validBatch).toMatchObject({
      cursors: [
        expect.objectContaining({
          sequence: 2,
          userId: first.session.self.userId,
          x: 0.4,
          y: 0.6,
        }),
      ],
    });

    const removalPromise = waitForRemoval(second.socket);
    first.socket.disconnect();
    expect(await removalPromise).toEqual({
      reason: 'disconnect',
      userId: first.session.self.userId,
    });
  });

  it('ignores invalid cursor color changes', async () => {
    const url = await startServer();
    const first = await connect(url);
    const second = await connect(url);
    const batchPromise = waitForBatch(second.socket);

    first.socket.emit(CURSOR_EVENTS.color, {
      color: '#invalid' as HexColor,
    });
    first.socket.emit(CURSOR_EVENTS.move, {
      sequence: 0,
      x: 0.5,
      y: 0.5,
    });

    await expect(batchPromise).resolves.toMatchObject({
      cursors: [
        expect.objectContaining({
          color: first.session.self.color,
          userId: first.session.self.userId,
        }),
      ],
    });
  });

  it('allows HTTP and Socket.IO requests from any origin', async () => {
    const url = await startServer();
    const origin = 'https://unconfigured-client.example';
    const preflightResponse = await fetch(url, {
      headers: {
        'Access-Control-Request-Method': 'GET',
        Origin: origin,
      },
      method: 'OPTIONS',
    });
    const socketResponse = await fetch(
      `${url}/socket.io/?EIO=4&transport=polling`,
      { headers: { Origin: origin } },
    );

    expect(preflightResponse.status).toBe(204);
    expect(preflightResponse.headers.get('access-control-allow-origin')).toBe(
      '*',
    );
    expect(socketResponse.status).toBe(200);
    expect(socketResponse.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('rejects rooms that have not been authorized by the server', async () => {
    const url = await startServer();
    const socket: TestSocket = createClient(url, {
      auth: { roomId: 'private-room', username: 'Player' },
      autoConnect: false,
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    const errorPromise = withTimeout(
      new Promise<Error>((resolve) => socket.once('connect_error', resolve)),
      'connect_error',
    );
    socket.connect();

    await expect(errorPromise).resolves.toMatchObject({
      message: 'Cursor room access denied',
    });
  });

  it('assigns a coffee guest name to legacy clients', async () => {
    const url = await startServer();
    const legacyClient = await connect(url, DEFAULT_CURSOR_ROOM_ID, null);

    expect(legacyClient.session.self.username).toMatch(
      /^(Affogato|Americano|Cappuccino|Cortado|Espresso|Latte|Macchiato|Mocha)-\d{4}$/,
    );
  });

  it.each(['   ', 'x'.repeat(33)])(
    'rejects the invalid username %j',
    async (username) => {
      const url = await startServer();
      const socket: TestSocket = createClient(url, {
        auth: { roomId: DEFAULT_CURSOR_ROOM_ID, username },
        autoConnect: false,
        forceNew: true,
        reconnection: false,
      });
      sockets.push(socket);
      const errorPromise = withTimeout(
        new Promise<Error>((resolve) => socket.once('connect_error', resolve)),
        'connect_error',
      );
      socket.connect();

      await expect(errorPromise).resolves.toMatchObject({
        message: 'Invalid cursor connection',
      });
    },
  );

  it('expires an idle cursor without disconnecting its socket', async () => {
    const url = await startServer(75);
    const first = await connect(url);
    const second = await connect(url);
    const removalPromise = waitForRemoval(second.socket);

    first.socket.emit(CURSOR_EVENTS.move, {
      sequence: 0,
      x: 0.5,
      y: 0.5,
    });

    await expect(removalPromise).resolves.toEqual({
      reason: 'idle',
      userId: first.session.self.userId,
    });
    expect(first.socket.connected).toBe(true);
  });
});
