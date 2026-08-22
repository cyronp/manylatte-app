import type { AddressInfo } from 'node:net';

import {
  CURSOR_EVENTS,
  DEFAULT_CURSOR_ROOM_ID,
  type ClientToServerEvents,
  type CursorBatch,
  type CursorRemoval,
  type CursorSession,
  type RemoteCursor,
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
    new Promise<RemoteCursor>((resolve) => {
      socket.once(CURSOR_EVENTS.click, resolve);
    }),
    CURSOR_EVENTS.click,
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
      webUrl: 'http://localhost:5173',
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
    const second = await connect(url);
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
      username: 'Player 1',
      x: 0.25,
      y: 0.75,
    });

    const third = await connect(url);
    expect(third.session.cursors).toContainEqual(movedCursor);

    const clickPromise = waitForClick(second.socket);
    first.socket.emit(CURSOR_EVENTS.click, {
      sequence: 1,
      x: 0.3,
      y: 0.7,
    });
    expect(await clickPromise).toMatchObject({
      sequence: 1,
      userId: first.session.self.userId,
      x: 0.3,
      y: 0.7,
    });

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
