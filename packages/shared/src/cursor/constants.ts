import type { CursorRoomId } from './schemas.js';

export const DEFAULT_CURSOR_ROOM_ID = 'lobby' as CursorRoomId;

export const CURSOR_MOVE_FPS = 30;
export const CURSOR_MOVE_INTERVAL_MS = 1000 / CURSOR_MOVE_FPS;
export const CURSOR_CLICK_DURATION_MS = 200;
export const CURSOR_IDLE_TIMEOUT_MS = 15_000;

export const CURSOR_EVENTS = {
  batch: 'cursor:batch',
  click: 'cursor:click',
  move: 'cursor:move',
  remove: 'cursor:remove',
  session: 'cursor:session',
} as const;
