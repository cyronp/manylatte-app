import { randomUUID } from 'node:crypto';
import { createSocketGuards } from './socket-guards.js';
import { registerPresence } from './register-presence.js';

import {
  CANVAS_EVENTS,
  CURSOR_CONNECTION_IDLE_TIMEOUT_MS,
  CURSOR_EVENTS,
  CURSOR_IDLE_TIMEOUT_MS,
  CURSOR_MOVE_FPS,
  CURSOR_MOVE_INTERVAL_MS,
  type CursorRoomId,
  type CursorUser,
  type RemoteCursor,
} from '@app/shared';

import { registerAdmission } from './register-admission.js';
import type { TrustedProxies } from '../client-address.js';
import { selectCursorColor } from './palette.js';
import { TokenBucket } from './token-bucket.js';
import { PersistentCanvas } from './persistent-canvas.js';
import type { CanvasPersistence } from './canvas-persistence.js';
import {
  DEFAULT_CURSOR_MAX_CONNECTIONS_PER_IP,
  DEFAULT_CURSOR_MAX_PARTICIPANTS_PER_ROOM,
  DEFAULT_CURSOR_MAX_TOTAL_CONNECTIONS,
} from '../security-config.js';

const CURSOR_COLOR_UPDATES_PER_SECOND = 8;
const SOCKET_MESSAGE_BURST = 60;
const SOCKET_MESSAGES_PER_SECOND = 45;

export type { CursorIo, CursorSocketData } from './cursor-types.js';
import type {
  CursorIo,
  Participant,
  CursorRoom,
  CursorLogger,
} from './cursor-types.js';
import { registerCanvasCommands } from './register-canvas-commands.js';
import { registerTyping, clearTyping } from './typing-presence.js';
import { OperationMetrics } from './operation-metrics.js';
import { WorkBudget } from './work-budget.js';
export interface CursorServerOptions {
  canvasPersistence: CanvasPersistence;
  authorizeRoom: (roomId: CursorRoomId) => boolean | Promise<boolean>;
  connectionIdleTimeoutMs?: number;
  idleTimeoutMs?: number;
  logger: CursorLogger;
  maxConnectionsPerIp?: number;
  maxParticipantsPerRoom?: number;
  maxTotalConnections?: number;
  now?: () => number;
  trustProxy?: TrustedProxies;
}

export const registerCursorServer = (
  io: CursorIo,
  {
    canvasPersistence,
    authorizeRoom,
    connectionIdleTimeoutMs = CURSOR_CONNECTION_IDLE_TIMEOUT_MS,
    idleTimeoutMs = CURSOR_IDLE_TIMEOUT_MS,
    logger,
    maxConnectionsPerIp = DEFAULT_CURSOR_MAX_CONNECTIONS_PER_IP,
    maxParticipantsPerRoom = DEFAULT_CURSOR_MAX_PARTICIPANTS_PER_ROOM,
    maxTotalConnections = DEFAULT_CURSOR_MAX_TOTAL_CONNECTIONS,
    now = Date.now,
    trustProxy = false,
  }: CursorServerOptions,
) => {
  const admission = registerAdmission(io, {
    authorizeRoom,
    maxConnectionsPerIp,
    maxTotalConnections,
    maxParticipantsPerRoom,
    trustProxy,
    now,
    logger,
  });
  const rooms = new Map<CursorRoomId, CursorRoom>();
  const workBudget = new WorkBudget();
  const metrics = new OperationMetrics();

  const getRoom = (roomId: CursorRoomId) => {
    const existingRoom = rooms.get(roomId);

    if (existingRoom) {
      return existingRoom;
    }

    const room: CursorRoom = {
      canvas: new PersistentCanvas(roomId, canvasPersistence, workBudget),
      participants: new Map(),
      pendingMoves: new Map(),
    };
    rooms.set(roomId, room);
    return room;
  };

  const { recordViolation, acceptMessageBudget, acceptCursorInput } =
    createSocketGuards(now, logger);

  io.on('connection', (socket) => {
    const roomId = socket.data.cursorRoomId;
    const room = getRoom(roomId);
    const connectedAt = now();
    const participant: Participant = {
      clickLimiter: new TokenBucket(3, 8, connectedAt),
      color: selectCursorColor(
        Array.from(room.participants.values(), ({ color }) => color),
      ),
      colorLimiter: new TokenBucket(
        2,
        CURSOR_COLOR_UPDATES_PER_SECOND,
        connectedAt,
      ),
      lastActivityAt: connectedAt,
      lastSequence: -1,
      messageLimiter: new TokenBucket(
        SOCKET_MESSAGE_BURST,
        SOCKET_MESSAGES_PER_SECOND,
        connectedAt,
      ),
      moveLimiter: new TokenBucket(2, CURSOR_MOVE_FPS, connectedAt),
      socketId: socket.id,
      typingNodeIds: new Set(),
      username: socket.data.cursorUsername,
      userId: randomUUID(),
      violationCount: 0,
      violationWindowStartedAt: connectedAt,
    };

    room.participants.set(socket.id, participant);
    socket.data.cursorColor = participant.color;
    socket.data.cursorUsername = participant.username;
    socket.data.cursorUserId = participant.userId;
    void Promise.resolve(socket.join(roomId))
      .then(async () => {
        const roomSockets = await io.in(roomId).fetchSockets();

        if (!socket.connected) {
          return;
        }

        const user: CursorUser = {
          color: participant.color,
          username: participant.username,
          userId: participant.userId,
        };
        const users = roomSockets.flatMap(({ data }) =>
          data.cursorColor && data.cursorUserId
            ? [
                {
                  color: data.cursorColor,
                  username: data.cursorUsername,
                  userId: data.cursorUserId,
                },
              ]
            : [],
        );
        socket.to(roomId).emit(CURSOR_EVENTS.presence, user);

        socket.emit(CURSOR_EVENTS.session, {
          cursors: roomSockets
            .map(({ data }) => data.cursorLastPosition)
            .filter((cursor): cursor is RemoteCursor => cursor !== undefined),
          self: user,
          users,
        });
        socket.emit(CANVAS_EVENTS.snapshot, {
          nodes: await room.canvas.snapshot(),
        });
        for (const typingParticipant of room.participants.values()) {
          for (const nodeId of typingParticipant.typingNodeIds) {
            socket.emit(CANVAS_EVENTS.typing, {
              isTyping: true,
              nodeId,
              user: {
                color: typingParticipant.color,
                username: typingParticipant.username,
                userId: typingParticipant.userId,
              },
            });
          }
        }
      })
      .catch((error: unknown) => {
        metrics.loadFailures++;
        logger.warn(
          { errorType: error instanceof Error ? error.name : 'unknown' },
          'Canvas initialization failed',
        );
        if (socket.connected) {
          socket.emit(CURSOR_EVENTS.disconnect, { reason: 'unavailable' });
          socket.disconnect(true);
        }
      });

    registerPresence(
      io,
      socket,
      room,
      participant,
      now,
      (event) => acceptMessageBudget(socket, participant, event),
      (reason, codes) => recordViolation(socket, participant, reason, codes),
      (input, limiter, event) =>
        acceptCursorInput(socket, participant, input, limiter, event),
    );

    registerCanvasCommands(io, socket, room, participant, {
      acceptMessageBudget: (event) =>
        acceptMessageBudget(socket, participant, event),
      recordViolation: (reason) => recordViolation(socket, participant, reason),
      logger,
      metrics,
    });
    registerTyping(
      socket,
      room,
      participant,
      now,
      (event) => acceptMessageBudget(socket, participant, event),
      logger,
    );

    socket.on('disconnect', () => {
      room.participants.delete(socket.id);
      room.pendingMoves.delete(participant.userId);
      for (const nodeId of participant.typingNodeIds) {
        socket.to(roomId).emit(CANVAS_EVENTS.typing, {
          isTyping: false,
          nodeId,
          user: {
            color: participant.color,
            username: participant.username,
            userId: participant.userId,
          },
        });
      }
      socket.to(roomId).emit(CURSOR_EVENTS.remove, {
        reason: 'disconnect',
        userId: participant.userId,
      });

      if (room.participants.size === 0) {
        void room.canvas.drain().then(() => {
          if (room.participants.size === 0 && rooms.get(roomId) === room) {
            rooms.delete(roomId);
          }
        });
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
            participant.typingExpiresAt &&
            currentTime >= participant.typingExpiresAt
          )
            clearTyping(io, roomId, participant);
          if (
            currentTime - participant.lastActivityAt >=
            connectionIdleTimeoutMs
          ) {
            const participantSocket = io.sockets.sockets.get(
              participant.socketId,
            );
            participantSocket?.emit(CURSOR_EVENTS.disconnect, {
              reason: 'idle',
            });
            participantSocket?.disconnect(true);
            continue;
          }

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

      admission.sweep();
    },
    Math.max(10, Math.min(1_000, idleTimeoutMs, connectionIdleTimeoutMs)),
  );

  batchTimer.unref();
  idleTimer.unref();

  return {
    metrics: () => ({
      ...metrics.snapshot(),
      activeRooms: rooms.size,
      connections: io.engine.clientsCount,
      pendingWork: workBudget.pending,
      peakPendingWork: workBudget.peak,
    }),
    close: async () => {
      clearInterval(batchTimer);
      clearInterval(idleTimer);
      await Promise.all(
        Array.from(rooms.values(), (room) => room.canvas.drain()),
      );
      rooms.clear();
    },
  };
};
