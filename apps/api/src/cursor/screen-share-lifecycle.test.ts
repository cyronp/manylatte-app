import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  registerScreenShare,
  type ScreenShareMetrics,
} from './register-screen-share.js';
import type {
  CursorIo,
  CursorRoom,
  CursorSocket,
  Participant,
} from './cursor-types.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const emit = vi.fn();
  const io = { to: () => ({ emit }) } as unknown as CursorIo;
  const room = { participants: new Map() } as unknown as CursorRoom;
  const metrics: ScreenShareMetrics = {
    activeShares: 0,
    activeViewers: 0,
    credentialRequests: 0,
    invalidMessages: 0,
    signalMessages: 0,
    starts: 0,
    stops: 0,
    unwatchers: 0,
    watchRejects: 0,
    watches: 0,
  };
  const connect = (id: string) => {
    const socket = Object.assign(new EventEmitter(), {
      id,
      connected: true,
      data: { cursorRoomId: 'room' },
    });
    const participant = {
      userId: id,
      username: id,
      color: '#000000',
    } as Participant;
    room.participants.set(id, participant);
    registerScreenShare(
      io,
      socket as unknown as CursorSocket,
      room,
      participant,
      Date.now,
      vi.fn(),
      () => [],
      metrics,
    );
    return socket;
  };
  const presenter = connect('presenter');
  const viewer = connect('viewer');
  const shareId = randomUUID();
  presenter.emit(
    'screen:start',
    { shareId, position: { x: 0, y: 0 } },
    vi.fn(),
  );
  const watch = () => {
    const connectionId = randomUUID();
    const ack = vi.fn();
    viewer.emit('screen:watch', { shareId, connectionId }, ack);
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, iceServers: [] }),
    );
    return connectionId;
  };
  return { presenter, viewer, shareId, watch, room, emit, metrics };
}

it('expires an unnegotiated slot despite viewer heartbeats and self-confirmation', () => {
  const { viewer, shareId, watch, room, emit, metrics } = setup();
  const connectionId = watch();
  viewer.emit('screen:peer-status', {
    shareId,
    connectionId,
    peerId: 'viewer',
    connected: true,
  });
  vi.advanceTimersByTime(15_000);
  viewer.emit('screen:heartbeat', { shareId });
  vi.advanceTimersByTime(15_000);
  expect(room.screenShare?.viewers.size).toBe(0);
  expect(metrics.activeViewers).toBe(0);
  expect(emit).toHaveBeenCalledWith('screen:ended', { shareId, connectionId });
});

it('only accepts the current presenter connection status and releases failed peers', () => {
  const { presenter, shareId, watch, room } = setup();
  const oldId = watch();
  const connectionId = watch();
  presenter.emit('screen:peer-status', {
    shareId,
    connectionId: oldId,
    peerId: 'viewer',
    connected: false,
  });
  expect(room.screenShare?.viewers.get('viewer')).toBe(connectionId);
  presenter.emit('screen:peer-status', {
    shareId,
    connectionId,
    peerId: 'viewer',
    connected: true,
  });
  vi.advanceTimersByTime(60_000);
  expect(room.screenShare?.viewers.get('viewer')).toBe(connectionId);
  presenter.emit('screen:peer-status', {
    shareId,
    connectionId,
    peerId: 'viewer',
    connected: false,
  });
  expect(room.screenShare?.viewers.size).toBe(0);
});

it('cancels pending slot timers when the presenter disconnects', () => {
  const { presenter, watch, room, metrics } = setup();
  watch();
  expect(vi.getTimerCount()).toBe(1);
  presenter.emit('disconnect');
  expect(room.screenShare).toBeUndefined();
  expect(metrics.activeViewers).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('refreshes credentials only for active share participants and throttles renewal', () => {
  const { presenter, viewer, shareId, watch } = setup();
  const ack = vi.fn();
  viewer.emit('screen:credentials', { shareId }, ack);
  expect(ack.mock.lastCall?.[0].ok).toBe(false);
  const connectionId = watch();
  viewer.emit('screen:credentials', { shareId: randomUUID() }, ack);
  expect(ack.mock.lastCall?.[0].ok).toBe(false);
  viewer.emit('screen:credentials', { shareId }, ack);
  expect(ack.mock.lastCall?.[0]).toMatchObject({
    ok: true,
    iceServersExpiresAt: Date.now() + 900_000,
  });
  viewer.emit('screen:credentials', { shareId }, ack);
  expect(ack.mock.lastCall?.[0].ok).toBe(false);
  presenter.emit('screen:credentials', { shareId }, ack);
  expect(ack.mock.lastCall?.[0].ok).toBe(true);
  viewer.emit('screen:unwatch', { shareId, connectionId });
  vi.advanceTimersByTime(60_000);
  viewer.emit('screen:credentials', { shareId }, ack);
  expect(ack.mock.lastCall?.[0].ok).toBe(false);
  presenter.emit('screen:credentials', { shareId }, ack);
  expect(ack.mock.lastCall?.[0]).toMatchObject({
    ok: true,
    iceServersExpiresAt: Date.now() + 900_000,
  });
});

it('gives viewers a single-peer signal budget while allowing presenter fanout', () => {
  const { presenter, viewer, shareId, watch, emit } = setup();
  const connectionId = watch();
  const signal = { type: 'candidate', candidate: { candidate: 'candidate' } };
  emit.mockClear();
  for (let i = 0; i < 100; i++)
    viewer.emit('screen:signal', {
      shareId,
      connectionId,
      peerId: 'presenter',
      signal,
    });
  expect(
    emit.mock.calls.filter(([event]) => event === 'screen:signal'),
  ).toHaveLength(80);
  emit.mockClear();
  for (let i = 0; i < 100; i++)
    presenter.emit('screen:signal', {
      shareId,
      connectionId,
      peerId: 'viewer',
      signal,
    });
  expect(
    emit.mock.calls.filter(([event]) => event === 'screen:signal'),
  ).toHaveLength(100);
});
