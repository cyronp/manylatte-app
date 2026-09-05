import type { CursorRoomId } from './schemas.js';
import { hexColorSchema, type HexColor } from '../schemas/color.js';

export const DEFAULT_CURSOR_ROOM_ID = 'lobby' as CursorRoomId;

export const CURSOR_MOVE_FPS = 30;
export const CURSOR_MOVE_INTERVAL_MS = 1000 / CURSOR_MOVE_FPS;
export const CURSOR_CLICK_DURATION_MS = 200;
export const CURSOR_IDLE_TIMEOUT_MS = 15_000;
export const CURSOR_CONNECTION_IDLE_TIMEOUT_MS = 5 * 60_000;

const cursorPalette = [
  '#193CB8',
  '#e11d48',
  '#059669',
  '#7c3aed',
  '#d97706',
  '#0891b2',
  '#db2777',
  '#4d7c0f',
] as const;

export const CURSOR_PALETTE: readonly HexColor[] = cursorPalette.map((color) =>
  hexColorSchema.parse(color),
);

export const CURSOR_EVENTS = {
  batch: 'cursor:batch',
  click: 'cursor:click',
  color: 'cursor:color',
  disconnect: 'cursor:disconnect',
  move: 'cursor:move',
  presence: 'cursor:presence',
  remove: 'cursor:remove',
  session: 'cursor:session',
} as const;
