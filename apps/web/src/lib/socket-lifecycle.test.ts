// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { CursorSocket } from './socket';
import { bindSocketLifecycle } from './socket-lifecycle';
import { sendCanvasCommand } from './canvas-commands';

afterEach(() => vi.useRealTimers());

it('waits for the snapshot and retries restart/capacity denials with cleanup', () => {
  vi.useFakeTimers();
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    on: vi.fn((event, handler) => handlers.set(event, handler)),
    off: vi.fn((event) => handlers.delete(event)),
    connect: vi.fn(),
    active: false,
  } as unknown as CursorSocket;
  const update = vi.fn();
  const ready = vi.fn();
  const lifecycle = bindSocketLifecycle(socket, update, ready);
  handlers.get('connect')!();
  expect(update).toHaveBeenLastCalledWith('initializing');
  expect(ready).toHaveBeenLastCalledWith(false);
  handlers.get('canvas:snapshot')!({ nodes: [] });
  expect(ready).toHaveBeenLastCalledWith(true);
  handlers.get('cursor:disconnect')!({ reason: 'restarting' });
  handlers.get('disconnect')!();
  vi.advanceTimersByTime(1_000);
  expect(socket.connect).toHaveBeenCalledTimes(1);
  handlers.get('connect_error')!({
    message: 'Capacity',
    data: { retryable: true },
  });
  vi.advanceTimersByTime(2_000);
  expect(socket.connect).toHaveBeenCalledTimes(2);
  lifecycle.dispose();
  expect(handlers.size).toBe(0);
  vi.runAllTimers();
  expect(socket.connect).toHaveBeenCalledTimes(2);
});

it('never buffers offline or initializing writes and preserves IDs after acknowledgement loss', async () => {
  const emitWithAck = vi.fn().mockRejectedValue(new Error('timeout'));
  const socket = {
    connected: false,
    timeout: vi.fn(() => ({ emitWithAck })),
  } as unknown as CursorSocket;
  const command = {
    id: crypto.randomUUID(),
    body: {
      type: 'mutation' as const,
      mutation: { action: 'delete' as const, nodeId: crypto.randomUUID() },
    },
  };
  expect(await sendCanvasCommand(socket, true, command)).toMatchObject({
    ok: false,
    code: 'offline',
  });
  socket.connected = true;
  expect(await sendCanvasCommand(socket, false, command)).toMatchObject({
    ok: false,
    code: 'offline',
  });
  expect(emitWithAck).not.toHaveBeenCalled();
  expect(await sendCanvasCommand(socket, true, command)).toMatchObject({
    ok: false,
    operationId: command.id,
  });
  emitWithAck.mockResolvedValue({ ok: true, operationId: command.id });
  expect(await sendCanvasCommand(socket, true, command)).toMatchObject({
    ok: true,
  });
  expect(emitWithAck.mock.calls[0]).toEqual(emitWithAck.mock.calls[1]);
});

it('explains a kick and does not reconnect on activity or a pending retry timer', () => {
  vi.useFakeTimers();
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    on: vi.fn((event, handler) => handlers.set(event, handler)),
    off: vi.fn((event) => handlers.delete(event)),
    connect: vi.fn(),
    active: false,
  } as unknown as CursorSocket;
  const update = vi.fn();
  const lifecycle = bindSocketLifecycle(socket, update, vi.fn());
  handlers.get('cursor:disconnect')!({ reason: 'restarting' });
  handlers.get('disconnect')!();
  handlers.get('cursor:disconnect')!({ reason: 'kicked' });
  handlers.get('disconnect')!();
  expect(update).toHaveBeenLastCalledWith('kicked');
  window.dispatchEvent(new Event('pointermove'));
  window.dispatchEvent(new Event('online'));
  lifecycle.retry();
  vi.runAllTimers();
  expect(socket.connect).not.toHaveBeenCalled();
  lifecycle.dispose();
});

it('shows the kicked state on a banned reconnect and disables manual retries', () => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    on: vi.fn((event, handler) => handlers.set(event, handler)),
    off: vi.fn((event) => handlers.delete(event)),
    connect: vi.fn(),
    active: false,
  } as unknown as CursorSocket;
  const update = vi.fn();
  const ready = vi.fn();
  const lifecycle = bindSocketLifecycle(socket, update, ready);
  handlers.get('connect_error')!({
    message: 'Banned',
    data: { reason: 'kicked', retryable: false },
  });
  expect(update).toHaveBeenLastCalledWith('kicked');
  expect(ready).toHaveBeenLastCalledWith(false);
  lifecycle.retry();
  expect(socket.connect).not.toHaveBeenCalled();
  lifecycle.dispose();
});
