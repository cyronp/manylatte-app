import { randomUUID } from 'node:crypto';

import {
  CURSOR_EVENTS,
  CURSOR_IDLE_TIMEOUT_MS,
  CURSOR_MOVE_FPS,
  CURSOR_MOVE_INTERVAL_MS,
  cursorInputSchema,
  cursorSocketAuthSchema,
  type ClientToServerEvents,
  type CursorRoomId,
  type HexColor,
  type RemoteCursor,
  type ServerToClientEvents,
} from '@app/shared';
import type { Server, Socket } from 'socket.io';

import { createCoffeeGuestUsername } from './guest-username.js';
import { selectCursorColor } from './palette.js';
import { TokenBucket } from './token-bucket.js';

type InterServerEvents = Record<never, never>;

export interface CursorSocketData {
  cursorColor?: HexColor;
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

type CursorSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  CursorSocketData
>;

interface CursorLogger {
  warn: (context: object, message: string) => void;
}

interface Participant {
  clickLimiter: TokenBucket;
  color: HexColor;
  lastCursor?: RemoteCursor;
  lastSequence: number;
  moveLimiter: TokenBucket;
  socketId: string;
  username: string;
  userId: string;
}

interface CursorRoom {
  participants: Map<string, Participant>;
  pendingMoves: Map<string, RemoteCursor>;
}

export interface CursorServerOptions {
  authorizeRoom: (roomId: CursorRoomId) => boolean | Promise<boolean>;
  idleTimeoutMs?: number;
  logger: CursorLogger;
  now?: () => number;
}

export const registerCursorServer = (
  io: CursorIo,
  {
    authorizeRoom,
    idleTimeoutMs = CURSOR_IDLE_TIMEOUT_MS,
    logger,
    now = Date.now,
  }: CursorServerOptions,
) => {
  const rooms = new Map<CursorRoomId, CursorRoom>();

  const getRoom = (roomId: CursorRoomId) => {
    const existingRoom = rooms.get(roomId);

    if (existingRoom) {
      return existingRoom;
    }

    const room: CursorRoom = {
      participants: new Map(),
      pendingMoves: new Map(),
    };
    rooms.set(roomId, room);
    return room;
  };

  io.use(async (socket, next) => {
    const authResult = cursorSocketAuthSchema.safeParse(socket.handshake.auth);

    if (!authResult.success) {
      next(new Error('Invalid cursor connection'));
      return;
    }

    if (!(await authorizeRoom(authResult.data.roomId))) {
      next(new Error('Cursor room access denied'));
      return;
    }

    socket.data.cursorRoomId = authResult.data.roomId;
    socket.data.cursorUsername =
      authResult.data.username ?? createCoffeeGuestUsername();
    next();
  });

  const acceptCursorInput = (
    socket: CursorSocket,
    participant: Participant,
    input: unknown,
    limiter: TokenBucket,
  ) => {
    const result = cursorInputSchema.safeParse(input);

    if (!result.success) {
      logger.warn(
        { issues: result.error.issues, socketId: socket.id },
        'Received invalid cursor input',
      );
      return;
    }

    if (
      result.data.sequence <= participant.lastSequence ||
      !limiter.take(now())
    ) {
      return;
    }

    participant.lastSequence = result.data.sequence;
    return result.data;
  };

  io.on('connection', (socket) => {
    const roomId = socket.data.cursorRoomId;
    const room = getRoom(roomId);
    const participant: Participant = {
      clickLimiter: new TokenBucket(3, 8, now()),
      color: selectCursorColor(
        Array.from(room.participants.values(), ({ color }) => color),
      ),
      lastSequence: -1,
      moveLimiter: new TokenBucket(2, CURSOR_MOVE_FPS, now()),
      socketId: socket.id,
      username: socket.data.cursorUsername,
      userId: randomUUID(),
    };

    room.participants.set(socket.id, participant);
    socket.data.cursorColor = participant.color;
    socket.data.cursorUsername = participant.username;
    socket.data.cursorUserId = participant.userId;
    void Promise.resolve(socket.join(roomId)).then(async () => {
      const roomSockets = await io.in(roomId).fetchSockets();

      if (!socket.connected) {
        return;
      }

      socket.emit(CURSOR_EVENTS.session, {
        cursors: roomSockets
          .map(({ data }) => data.cursorLastPosition)
          .filter((cursor): cursor is RemoteCursor => cursor !== undefined),
        self: {
          color: participant.color,
          username: participant.username,
          userId: participant.userId,
        },
      });
    });

    socket.on(CURSOR_EVENTS.move, (input) => {
      const acceptedInput = acceptCursorInput(
        socket,
        participant,
        input,
        participant.moveLimiter,
      );

      if (!acceptedInput) {
        return;
      }

      const cursor: RemoteCursor = {
        ...acceptedInput,
        color: participant.color,
        username: participant.username,
        updatedAt: now(),
        userId: participant.userId,
      };
      participant.lastCursor = cursor;
      socket.data.cursorLastPosition = cursor;
      room.pendingMoves.set(participant.userId, cursor);
    });

    socket.on(CURSOR_EVENTS.click, (input) => {
      const acceptedInput = acceptCursorInput(
        socket,
        participant,
        input,
        participant.clickLimiter,
      );

      if (!acceptedInput) {
        return;
      }

      const cursor: RemoteCursor = {
        ...acceptedInput,
        color: participant.color,
        username: participant.username,
        updatedAt: now(),
        userId: participant.userId,
      };
      participant.lastCursor = cursor;
      socket.data.cursorLastPosition = cursor;
      room.pendingMoves.delete(participant.userId);
      socket.to(roomId).volatile.emit(CURSOR_EVENTS.click, cursor);
    });

    socket.on('disconnect', () => {
      room.participants.delete(socket.id);
      room.pendingMoves.delete(participant.userId);
      socket.to(roomId).emit(CURSOR_EVENTS.remove, {
        reason: 'disconnect',
        userId: participant.userId,
      });

      if (room.participants.size === 0) {
        rooms.delete(roomId);
      }
    });
  });

  const batchTimer = setInterval(() => {
    for (const [roomId, room] of rooms) {
      if (room.pendingMoves.size === 0) {
        continue;
      }

      io.to(roomId).volatile.emit(CURSOR_EVENTS.batch, {
        cursors: Array.from(room.pendingMoves.values()),
      });
      room.pendingMoves.clear();
    }
  }, CURSOR_MOVE_INTERVAL_MS);

  const idleTimer = setInterval(
    () => {
      const currentTime = now();

      for (const [roomId, room] of rooms) {
        for (const participant of room.participants.values()) {
          if (
            !participant.lastCursor ||
            currentTime - participant.lastCursor.updatedAt < idleTimeoutMs
          ) {
            continue;
          }

          participant.lastCursor = undefined;
          const participantSocket = io.sockets.sockets.get(
            participant.socketId,
          );

          if (participantSocket) {
            participantSocket.data.cursorLastPosition = undefined;
          }
          room.pendingMoves.delete(participant.userId);
          io.to(roomId).emit(CURSOR_EVENTS.remove, {
            reason: 'idle',
            userId: participant.userId,
          });
        }
      }
    },
    Math.min(1000, idleTimeoutMs),
  );

  batchTimer.unref();
  idleTimer.unref();

  return {
    close: () => {
      clearInterval(batchTimer);
      clearInterval(idleTimer);
      rooms.clear();
    },
  };
};
