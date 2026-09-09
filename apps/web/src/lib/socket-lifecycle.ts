import { CANVAS_EVENTS, CURSOR_EVENTS } from '@app/shared';
import type { CursorSocket } from './socket';

export type SocketStatus =
  'connected' | 'initializing' | 'connecting' | 'disconnected';

export function bindSocketLifecycle(
  socket: CursorSocket,
  update: (status: SocketStatus, error?: string) => void,
  ready: (value: boolean) => void,
) {
  let idle = false;
  let retryable = false;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const retry = () => {
    clearTimeout(timer);
    ready(false);
    update('connecting');
    socket.connect();
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(
      retry,
      Math.min(30_000, 1_000 * 2 ** Math.min(attempts++, 5)),
    );
  };
  const connect = () => {
    idle = false;
    ready(false);
    update('initializing');
  };
  const snapshot = () => {
    attempts = 0;
    retryable = false;
    clearTimeout(timer);
    ready(true);
    update('connected');
  };
  const notice: Parameters<typeof socket.on<'cursor:disconnect'>>[1] = ({
    reason,
  }) => {
    idle = reason === 'idle';
    retryable = reason === 'restarting' || reason === 'unavailable';
  };
  const disconnect = () => {
    ready(false);
    update('disconnected');
    if (retryable) schedule();
  };
  const error = (cause: Error & { data?: { retryable?: boolean } }) => {
    ready(false);
    update('disconnected', cause.message);
    if (cause.data?.retryable && !socket.active) schedule();
  };
  const activity = () => {
    if (idle) {
      idle = false;
      retry();
    }
  };
  const visibility = () => {
    if (document.visibilityState === 'visible') activity();
  };
  socket.on('connect', connect);
  socket.on('disconnect', disconnect);
  socket.on('connect_error', error);
  socket.on(CANVAS_EVENTS.snapshot, snapshot);
  socket.on(CURSOR_EVENTS.disconnect, notice);
  const events = [
    'keydown',
    'pointerdown',
    'pointermove',
    'focus',
    'pageshow',
    'online',
  ] as const;
  events.forEach((event) => window.addEventListener(event, activity));
  document.addEventListener('visibilitychange', visibility);
  return {
    retry,
    dispose: () => {
      clearTimeout(timer);
      ready(false);
      socket.off('connect', connect);
      socket.off('disconnect', disconnect);
      socket.off('connect_error', error);
      socket.off(CANVAS_EVENTS.snapshot, snapshot);
      socket.off(CURSOR_EVENTS.disconnect, notice);
      events.forEach((event) => window.removeEventListener(event, activity));
      document.removeEventListener('visibilitychange', visibility);
    },
  };
}
