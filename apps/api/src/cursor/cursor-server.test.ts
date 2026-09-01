import type { AddressInfo } from 'node:net';

import {
  CANVAS_EVENTS,
  CANVAS_WIDTH,
  CURSOR_EVENTS,
  DEFAULT_CURSOR_ROOM_ID,
  hexColorSchema,
  type CanvasNode,
  type CanvasSnapshot,
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

import { createApp, type CreateAppOptions } from '../app.js';

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

const waitForCanvasSnapshot = (socket: TestSocket) =>
  withTimeout(
    new Promise<CanvasSnapshot>((resolve) => {
      socket.once(CANVAS_EVENTS.snapshot, resolve);
    }),
    CANVAS_EVENTS.snapshot,
  );

const waitForCanvasNode = (socket: TestSocket) =>
  withTimeout(
    new Promise<CanvasNode>((resolve) => {
      socket.once(CANVAS_EVENTS.nodeUpsert, resolve);
    }),
    CANVAS_EVENTS.nodeUpsert,
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

  const startServer = async (options: CreateAppOptions = {}) => {
    const app = await createApp({
      cursorIdleTimeoutMs: 5000,
      logger: false,
      ...options,
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
    const snapshotPromise = waitForCanvasSnapshot(socket);
    socket.connect();
    const [session, snapshot] = await Promise.all([
      sessionPromise,
      snapshotPromise,
    ]);
    return { session, snapshot, socket };
  };

  it('broadcasts canvas nodes and includes them in new sessions', async () => {
    const url = await startServer();
    const first = await connect(url);
    const second = await connect(url);
    const node: CanvasNode = {
      data: { emoji: '☕', label: 'Hot beverage' },
      id: 'd599a14f-1078-4c17-b809-f7fe3e9902ec',
      position: { x: 100, y: 200 },
      type: 'emoji',
    };
    const firstUpdate = waitForCanvasNode(first.socket);
    const secondUpdate = waitForCanvasNode(second.socket);

    first.socket.emit(CANVAS_EVENTS.nodeUpsert, node);

    await expect(firstUpdate).resolves.toEqual(node);
    await expect(secondUpdate).resolves.toEqual(node);

    const third = await connect(url);
    expect(third.snapshot.nodes).toContainEqual(node);
  });

  it('attributes canvas messages to their sender and broadcasts them', async () => {
    const url = await startServer();
    const first = await connect(url);
    const second = await connect(url);
    const node: CanvasNode = {
      data: { messages: [] },
      id: '21c9b25b-4656-47ba-b95d-94ad13ba8a3b',
      position: { x: 300, y: 400 },
      type: 'message',
    };
    const nodeCreated = waitForCanvasNode(second.socket);

    first.socket.emit(CANVAS_EVENTS.nodeUpsert, node);
    await expect(nodeCreated).resolves.toEqual(node);

    const firstUpdate = waitForCanvasNode(first.socket);
    const secondUpdate = waitForCanvasNode(second.socket);
    first.socket.emit(CANVAS_EVENTS.messageSend, {
      id: '3817c8a6-9f88-478f-b03c-c3b06b095a47',
      nodeId: node.id,
      text: '  Hello everyone  ',
    });
    const expectedNode: CanvasNode = {
      ...node,
      data: {
        messages: [
          {
            author: first.session.self,
            id: '3817c8a6-9f88-478f-b03c-c3b06b095a47',
            text: 'Hello everyone',
          },
        ],
      },
    };

    await expect(firstUpdate).resolves.toEqual(expectedNode);
    await expect(secondUpdate).resolves.toEqual(expectedNode);

    const third = await connect(url);
    expect(third.snapshot.nodes).toContainEqual(expectedNode);
  });

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
      username: first.session.self.username,
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
      x: CANVAS_WIDTH + 1,
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

  it('allows configured origins and rejects unconfigured origins', async () => {
    const allowedOrigin = 'https://app.example';
    const deniedOrigin = 'https://unconfigured-client.example';
    const url = await startServer({ allowedOrigins: [allowedOrigin] });
    const allowedPreflightResponse = await fetch(url, {
      headers: {
        'Access-Control-Request-Method': 'GET',
        Origin: allowedOrigin,
      },
      method: 'OPTIONS',
    });
    const allowedSocketResponse = await fetch(
      `${url}/socket.io/?EIO=4&transport=polling`,
      { headers: { Origin: allowedOrigin } },
    );
    const deniedPreflightResponse = await fetch(url, {
      headers: {
        'Access-Control-Request-Method': 'GET',
        Origin: deniedOrigin,
      },
      method: 'OPTIONS',
    });
    const deniedSocketResponse = await fetch(
      `${url}/socket.io/?EIO=4&transport=polling`,
      { headers: { Origin: deniedOrigin } },
    );

    expect(allowedPreflightResponse.status).toBe(204);
    expect(
      allowedPreflightResponse.headers.get('access-control-allow-origin'),
    ).toBe(allowedOrigin);
    expect(allowedSocketResponse.status).toBe(200);
    expect(
      allowedSocketResponse.headers.get('access-control-allow-origin'),
    ).toBe(allowedOrigin);
    expect(
      deniedPreflightResponse.headers.get('access-control-allow-origin'),
    ).toBeNull();
    expect(deniedSocketResponse.status).toBe(403);
    expect(
      deniedSocketResponse.headers.get('access-control-allow-origin'),
    ).toBeNull();
  });

  it('rejects WebSocket upgrades from an unconfigured browser origin', async () => {
    const url = await startServer({
      allowedOrigins: ['https://app.example'],
    });
    const socket: TestSocket = createClient(url, {
      auth: { roomId: DEFAULT_CURSOR_ROOM_ID, username: 'Player' },
      autoConnect: false,
      extraHeaders: { Origin: 'https://malicious.example' },
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
    });
    sockets.push(socket);
    const errorPromise = withTimeout(
      new Promise<Error>((resolve) => socket.once('connect_error', resolve)),
      'connect_error',
    );
    socket.connect();

    await expect(errorPromise).resolves.toBeInstanceOf(Error);
    expect(socket.connected).toBe(false);
  });

  it('adds baseline security headers to HTTP responses', async () => {
    const url = await startServer();
    const response = await fetch(url);

    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'self'",
    );
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
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

  it('caps the number of participants in a room', async () => {
    const url = await startServer({ maxParticipantsPerRoom: 1 });
    await connect(url);
    const socket: TestSocket = createClient(url, {
      auth: { roomId: DEFAULT_CURSOR_ROOM_ID, username: 'Second player' },
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
      message: 'Cursor room is full',
    });
  });

  it('disconnects clients that repeatedly exceed event rate limits', async () => {
    const url = await startServer();
    const { socket } = await connect(url);
    const disconnectPromise = withTimeout(
      new Promise<string>((resolve) => socket.once('disconnect', resolve)),
      'disconnect',
    );
    const noticePromise = withTimeout(
      new Promise<{ reason: 'abuse' | 'idle' }>((resolve) =>
        socket.once(CURSOR_EVENTS.disconnect, resolve),
      ),
      CURSOR_EVENTS.disconnect,
    );
    const color = hexColorSchema.parse('#c026d3');

    for (let index = 0; index < 30; index += 1) {
      socket.emit(CURSOR_EVENTS.color, { color });
    }

    await expect(noticePromise).resolves.toEqual({ reason: 'abuse' });
    await expect(disconnectPromise).resolves.toBe('io server disconnect');
  });

  it('closes sockets that send oversized messages', async () => {
    const url = await startServer({ maxHttpBufferBytes: 1_024 });
    const { socket } = await connect(url);
    const disconnectPromise = withTimeout(
      new Promise<string>((resolve) => socket.once('disconnect', resolve)),
      'disconnect',
    );

    socket.emit(CURSOR_EVENTS.move, 'x'.repeat(10_000) as never);

    await expect(disconnectPromise).resolves.toMatch(/transport|server/);
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
    const url = await startServer({ cursorIdleTimeoutMs: 75 });
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

  it('disconnects sockets after the connection idle timeout', async () => {
    const url = await startServer({ connectionIdleTimeoutMs: 75 });
    const { socket } = await connect(url);
    const disconnectPromise = withTimeout(
      new Promise<string>((resolve) => socket.once('disconnect', resolve)),
      'disconnect',
    );
    const noticePromise = withTimeout(
      new Promise<{ reason: 'abuse' | 'idle' }>((resolve) =>
        socket.once(CURSOR_EVENTS.disconnect, resolve),
      ),
      CURSOR_EVENTS.disconnect,
    );

    await expect(noticePromise).resolves.toEqual({ reason: 'idle' });
    await expect(disconnectPromise).resolves.toBe('io server disconnect');
  });
});
