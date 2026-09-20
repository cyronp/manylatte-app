import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ScreenShareSignal,
} from '@app/shared';
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { createTestDatabase } from '../../test/database.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
describe('screen sharing signaling', () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let url: string;
  const sockets: Client[] = [];
  beforeEach(async () => {
    const database = await createTestDatabase();
    await database.lobby.createMany({
      data: [
        { id: 'screen-room', code: 'SCRN-0001', name: 'Screen room' },
        { id: 'other-room', code: 'SCRN-0002', name: 'Other room' },
      ],
    });
    app = await createApp({
      database,
      logger: false,
      screenShareConfig: { stunUrls: [], turnUrls: [] },
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
    await app?.close();
  });
  const connect = async (roomId = 'screen-room') => {
    const socket: Client = io(url, {
      auth: { roomId, username: 'Presenter' },
      autoConnect: false,
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    await new Promise<void>((resolve) => {
      socket.once('canvas:snapshot', () => resolve());
      socket.connect();
    });
    return socket;
  };
  const sync = (socket: Client) =>
    socket.timeout(2000).emitWithAck('screen:sync');
  const start = async (socket: Client) => {
    const shareId = randomUUID();
    expect(
      await socket
        .timeout(2000)
        .emitWithAck('screen:start', { shareId, position: { x: 100, y: 200 } }),
    ).toMatchObject({ ok: true, iceServers: [] });
    return shareId;
  };
  const watch = async (socket: Client, shareId: string) => {
    const connectionId = randomUUID();
    expect(
      await socket
        .timeout(2000)
        .emitWithAck('screen:watch', { shareId, connectionId }),
    ).toMatchObject({ ok: true, iceServers: [] });
    return connectionId;
  };

  it('admits one presenter, exposes the share to late joiners, and restricts moving/stopping to that socket', async () => {
    const presenter = await connect();
    const shareId = await start(presenter);
    const viewer = await connect();
    expect((await sync(viewer)).share).toMatchObject({
      id: shareId,
      presenterId: presenter.id,
      viewerCount: 0,
    });
    expect(
      await viewer.timeout(2000).emitWithAck('screen:start', {
        shareId: randomUUID(),
        position: { x: 0, y: 0 },
      }),
    ).toMatchObject({ ok: false });
    viewer.emit('screen:move', { shareId, position: { x: 500, y: 600 } });
    viewer.emit('screen:stop', { shareId });
    expect((await sync(viewer)).share?.position).toEqual({ x: 100, y: 200 });
    presenter.emit('screen:move', { shareId, position: { x: 300, y: 400 } });
    expect((await sync(presenter)).share?.position).toEqual({ x: 300, y: 400 });
    presenter.emit('screen:stop', { shareId });
    expect((await sync(presenter)).share).toBeNull();
    expect(await start(viewer)).not.toBe(shareId);
  });

  it('coalesces rapid presenter position updates without losing the latest position', async () => {
    const presenter = await connect();
    const viewer = await connect();
    const states = vi.fn();
    viewer.on('screen:state', states);
    const shareId = await start(presenter);
    await expect.poll(() => states.mock.calls.length).toBe(1);
    states.mockClear();

    for (let index = 0; index < 5; index++)
      presenter.emit('screen:move', {
        shareId,
        position: { x: index * 10, y: index * 20 },
      });

    await expect
      .poll(() => states.mock.calls.length, { timeout: 1_000 })
      .toBe(1);
    expect(states.mock.lastCall?.[0].position).toEqual({ x: 40, y: 80 });
  });

  it('relays offers, answers and ICE only between the presenter and registered same-lobby viewers', async () => {
    const presenter = await connect();
    const viewer = await connect();
    const bystander = await connect();
    const outsider = await connect('other-room');
    const shareId = await start(presenter);
    const connectionId = await watch(viewer, shareId);
    const received = vi.fn();
    viewer.on('screen:signal', received);
    const message: ScreenShareSignal = {
      shareId,
      connectionId,
      peerId: viewer.id!,
      signal: { type: 'offer', sdp: 'offer' },
    };
    bystander.emit('screen:signal', message);
    outsider.emit('screen:signal', message);
    presenter.emit('screen:signal', { ...message, connectionId: randomUUID() });
    presenter.emit('screen:signal', {
      ...message,
      signal: { type: 'answer', sdp: 'wrong direction' },
    });
    await Promise.all([sync(bystander), sync(outsider), sync(presenter)]);
    expect(received).not.toHaveBeenCalled();
    presenter.emit('screen:signal', message);
    await expect.poll(() => received.mock.calls.length).toBe(1);
    expect(received.mock.calls[0][0]).toEqual({
      ...message,
      peerId: presenter.id,
    });
    const answers = vi.fn();
    presenter.on('screen:signal', answers);
    viewer.emit('screen:signal', {
      ...message,
      peerId: presenter.id!,
      signal: { type: 'answer', sdp: 'answer' },
    });
    viewer.emit('screen:signal', {
      ...message,
      peerId: presenter.id!,
      signal: {
        type: 'candidate',
        candidate: { candidate: 'candidate:example', sdpMid: '0' },
      },
    });
    await expect.poll(() => answers.mock.calls.length).toBe(2);
    expect(answers.mock.calls[0][0].peerId).toBe(viewer.id);
    expect((await sync(outsider)).share).toBeNull();
    expect(
      await outsider
        .timeout(2000)
        .emitWithAck('screen:watch', { shareId, connectionId: randomUUID() }),
    ).toMatchObject({ ok: false });
  });

  it('isolates retries from stale signaling and removes viewers and presenters on disconnect', async () => {
    const presenter = await connect();
    const viewer = await connect();
    const shareId = await start(presenter);
    const firstId = await watch(viewer, shareId);
    const connectionId = await watch(viewer, shareId);
    viewer.emit('screen:unwatch', { shareId, connectionId: firstId });
    expect((await sync(viewer)).share?.viewerCount).toBe(1);
    const received = vi.fn();
    viewer.on('screen:signal', received);
    presenter.emit('screen:signal', {
      shareId,
      connectionId: firstId,
      peerId: viewer.id!,
      signal: { type: 'offer', sdp: 'stale' },
    });
    await sync(presenter);
    expect(received).not.toHaveBeenCalled();
    viewer.emit('screen:unwatch', { shareId, connectionId });
    expect((await sync(viewer)).share?.viewerCount).toBe(0);
    await watch(viewer, shareId);
    viewer.disconnect();
    await expect
      .poll(async () => (await sync(presenter)).share?.viewerCount)
      .toBe(0);
    const late = await connect();
    presenter.disconnect();
    await expect.poll(async () => (await sync(late)).share).toBeNull();
  });

  it('bounds viewer fanout and rejects malformed payloads without disconnecting valid sessions', async () => {
    const presenter = await connect();
    expect(
      await presenter.timeout(2000).emitWithAck('screen:start', {
        shareId: 'invalid',
        position: { x: -1, y: 0 },
      }),
    ).toMatchObject({ ok: false });
    const shareId = await start(presenter);
    for (let index = 0; index < 8; index++)
      await watch(await connect(), shareId);
    const extra = await connect();
    expect(
      await extra
        .timeout(2000)
        .emitWithAck('screen:watch', { shareId, connectionId: randomUUID() }),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining('8 viewers'),
    });
    const viewer = sockets[1];
    const connectionId = await watch(viewer, shareId);
    presenter.emit('screen:signal', {
      shareId,
      connectionId,
      peerId: viewer.id!,
      signal: { type: 'offer', sdp: 'x'.repeat(16_385) },
    });
    expect((await sync(presenter)).share?.viewerCount).toBe(8);
    expect(presenter.connected).toBe(true);
  });

  it('disconnects a client that repeatedly sends malformed screen messages', async () => {
    const presenter = await connect();
    for (let index = 0; index < 20; index++)
      presenter.emit('screen:signal', {
        malformed: true,
      } as unknown as ScreenShareSignal);

    await expect
      .poll(() => presenter.connected, { timeout: 1_000 })
      .toBe(false);
  });

  it('bounds viewer retry fanout without charging automatic offers to the presenter message budget', async () => {
    const presenter = await connect();
    const shareId = await start(presenter);
    const viewers: Client[] = [];
    for (let i = 0; i < 8; i++) viewers.push(await connect());
    let negotiations = 0;
    presenter.on('screen:viewer', ({ joined, peerId, connectionId }) => {
      if (!joined) return;
      negotiations++;
      presenter.emit('screen:signal', {
        shareId,
        peerId,
        connectionId,
        signal: { type: 'offer', sdp: 'offer' },
      });
      for (let i = 0; i < 8; i++)
        presenter.emit('screen:signal', {
          shareId,
          peerId,
          connectionId,
          signal: {
            type: 'candidate',
            candidate: { candidate: `candidate:${i}` },
          },
        });
    });
    let rejected = 0;
    for (let i = 0; i < 18; i++) {
      const results = await Promise.all(
        viewers.map((viewer) =>
          viewer
            .timeout(2000)
            .emitWithAck('screen:watch', {
              shareId,
              connectionId: randomUUID(),
            }),
        ),
      );
      rejected += results.filter((result) => !result.ok).length;
    }
    expect(rejected).toBeGreaterThan(100);
    expect(negotiations).toBeLessThanOrEqual(18);
    expect((await sync(presenter)).share?.id).toBe(shareId);
    expect(presenter.connected).toBe(true);
  });
});
