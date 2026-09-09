import type {
  ClientToServerEvents,
  CursorRoomId,
  CursorUpdate,
  HexColor,
  RemoteCursor,
  ServerToClientEvents,
} from '@app/shared';
import type { Server, Socket } from 'socket.io';
import type { TokenBucket } from './token-bucket.js';
import type { PersistentCanvas } from './persistent-canvas.js';
type InterServerEvents = Record<never, never>;

export interface CursorSocketData {
  cursorColor?: HexColor;
  cursorIpAddress: string;
  cursorLastPosition?: RemoteCursor;
  cursorRoomId: CursorRoomId;
  cursorUsername: string;
  cursorUserId?: string;
}

export type CursorIo = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  CursorSocketData
>;

export type CursorSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  CursorSocketData
>;

export interface CursorLogger {
  error: (context: object, message: string) => void;
  warn: (context: object, message: string) => void;
}

export interface Participant {
  clickLimiter: TokenBucket;
  color: HexColor;
  colorLimiter: TokenBucket;
  lastActivityAt: number;
  lastCursor?: RemoteCursor;
  lastSequence: number;
  lastViolationLogAt?: number;
  messageLimiter: TokenBucket;
  moveLimiter: TokenBucket;
  socketId: string;
  typingNodeIds: Set<string>;
  typingExpiresAt?: number;
  username: string;
  userId: string;
  violationCount: number;
  violationWindowStartedAt: number;
}

export interface CursorRoom {
  canvas: PersistentCanvas;
  participants: Map<string, Participant>;
  pendingMoves: Map<string, CursorUpdate>;
}
