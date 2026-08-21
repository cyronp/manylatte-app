export {
  CURSOR_CLICK_DURATION_MS,
  CURSOR_EVENTS,
  CURSOR_IDLE_TIMEOUT_MS,
  CURSOR_MOVE_FPS,
  CURSOR_MOVE_INTERVAL_MS,
  DEFAULT_CURSOR_ROOM_ID,
} from './constants.js';
export {
  cursorBatchSchema,
  type CursorBatch,
  cursorInputSchema,
  type CursorInput,
  cursorPositionSchema,
  type CursorPosition,
  cursorRemovalSchema,
  type CursorRemoval,
  cursorRoomIdSchema,
  type CursorRoomId,
  cursorSessionSchema,
  type CursorSession,
  cursorSocketAuthSchema,
  type CursorSocketAuth,
  cursorUserSchema,
  type CursorUser,
  remoteCursorSchema,
  type RemoteCursor,
} from './schemas.js';
export type { ClientToServerEvents, ServerToClientEvents } from './socket.js';
