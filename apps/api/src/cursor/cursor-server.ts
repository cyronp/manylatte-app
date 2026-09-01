import { randomUUID } from 'node:crypto';

import {
  CANVAS_EVENTS,
  CURSOR_CONNECTION_IDLE_TIMEOUT_MS,
  CURSOR_EVENTS,
  CURSOR_IDLE_TIMEOUT_MS,
  CURSOR_MOVE_FPS,
  CURSOR_MOVE_INTERVAL_MS,
  MAX_CANVAS_MESSAGES_PER_NODE,
  canvasMessageInputSchema,
  canvasNodeSchema,
  canvasTypingInputSchema,
  cursorColorInputSchema,
  cursorInputSchema,
  cursorSocketAuthSchema,
  type CanvasNode,
  type ClientToServerEvents,
  type CursorRoomId,
  type CursorUpdate,
  type CursorUser,
  type HexColor,
  type RemoteCursor,
  type ServerToClientEvents,
} from '@app/shared';
import type { Server, Socket } from 'socket.io';

import { createCoffeeGuestUsername } from './guest-username.js';
import { selectCursorColor } from './palette.js';
import { TokenBucket } from './token-bucket.js';
import {
  DEFAULT_CURSOR_MAX_CONNECTIONS_PER_IP,
  DEFAULT_CURSOR_MAX_PARTICIPANTS_PER_ROOM,
  DEFAULT_CURSOR_MAX_TOTAL_CONNECTIONS,
} from '../security-config.js';

type InterServerEvents = Record<never, never>;

const CURSOR_COLOR_UPDATES_PER_SECOND = 8;
const SOCKET_MESSAGE_BURST = 60;
const SOCKET_MESSAGES_PER_SECOND = 45;
const ABUSE_DISCONNECT_THRESHOLD = 20;
const ABUSE_WINDOW_MS = 10_000;
const ABUSE_LOG_INTERVAL_MS = 5_000;
const CONNECTION_ATTEMPT_RETENTION_MS = 10 * 60_000;
const MAX_CANVAS_NODES_PER_ROOM = 500;

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
  colorLimiter: TokenBucket;
  lastActivityAt: number;
  lastCursor?: RemoteCursor;
  lastSequence: number;
  lastViolationLogAt?: number;
  messageLimiter: TokenBucket;
  moveLimiter: TokenBucket;
  socketId: string;
  typingNodeIds: Set<string>;
  username: string;
  userId: string;
  violationCount: number;
  violationWindowStartedAt: number;
}

interface ConnectionAttemptState {
  lastSeenAt: number;
  limiter: TokenBucket;
}

interface CursorRoom {
  nodes: Map<string, CanvasNode>;
  participants: Map<string, Participant>;
  pendingMoves: Map<string, CursorUpdate>;
}

export interface CursorServerOptions {
  authorizeRoom: (roomId: CursorRoomId) => boolean | Promise<boolean>;
  connectionIdleTimeoutMs?: number;
  idleTimeoutMs?: number;
  logger: CursorLogger;
  maxConnectionsPerIp?: number;
  maxParticipantsPerRoom?: number;
  maxTotalConnections?: number;
  now?: () => number;
  trustProxy?: boolean;
}

export const registerCursorServer = (
  io: CursorIo,
  {
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
  const connectionAttemptsByIp = new Map<string, ConnectionAttemptState>();
  const connectionCountsByIp = new Map<string, number>();
  const rooms = new Map<CursorRoomId, CursorRoom>();

  const getRoom = (roomId: CursorRoomId) => {
    const existingRoom = rooms.get(roomId);

    if (existingRoom) {
      return existingRoom;
    }

    const room: CursorRoom = {
      nodes: new Map(),
      participants: new Map(),
      pendingMoves: new Map(),
    };
    rooms.set(roomId, room);
    return room;
  };

  io.use(async (socket, next) => {
    try {
      const authResult = cursorSocketAuthSchema.safeParse(
        socket.handshake.auth,
      );

      if (!authResult.success) {
        next(new Error('Invalid cursor connection'));
        return;
      }

      if (!(await authorizeRoom(authResult.data.roomId))) {
        next(new Error('Cursor room access denied'));
        return;
      }

      const currentTime = now();
      const forwardedFor = socket.handshake.headers['x-forwarded-for'];
      const forwardedAddress = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor?.split(',')[0]?.trim();
      const ipAddress =
        trustProxy && forwardedAddress
          ? forwardedAddress
          : socket.handshake.address;
      const existingAttemptState = connectionAttemptsByIp.get(ipAddress);
      const attemptState = existingAttemptState ?? {
        lastSeenAt: currentTime,
        limiter: new TokenBucket(
          maxConnectionsPerIp,
          Math.max(1, maxConnectionsPerIp / 10),
          currentTime,
        ),
      };
      attemptState.lastSeenAt = currentTime;
      connectionAttemptsByIp.set(ipAddress, attemptState);

      if (!attemptState.limiter.take(currentTime)) {
        next(new Error('Cursor connection rate limit exceeded'));
        return;
      }

      if ((connectionCountsByIp.get(ipAddress) ?? 0) >= maxConnectionsPerIp) {
        next(new Error('Cursor connection limit exceeded'));
        return;
      }

      if (io.of('/').sockets.size >= maxTotalConnections) {
        next(new Error('Cursor server connection limit reached'));
        return;
      }

      const roomSocketIds = await io.in(authResult.data.roomId).allSockets();

      if (roomSocketIds.size >= maxParticipantsPerRoom) {
        next(new Error('Cursor room is full'));
        return;
      }

      socket.data.cursorIpAddress = ipAddress;
      socket.data.cursorRoomId = authResult.data.roomId;
      socket.data.cursorUsername =
        authResult.data.username ?? createCoffeeGuestUsername();
      next();
    } catch {
      next(new Error('Cursor connection unavailable'));
    }
  });

  const recordViolation = (
    socket: CursorSocket,
    participant: Participant,
    reason: string,
    issueCodes?: string[],
  ) => {
    const currentTime = now();

    if (currentTime - participant.violationWindowStartedAt >= ABUSE_WINDOW_MS) {
      participant.violationCount = 0;
      participant.violationWindowStartedAt = currentTime;
    }

    participant.violationCount += 1;
    const reachedDisconnectThreshold =
      participant.violationCount >= ABUSE_DISCONNECT_THRESHOLD;
    const shouldLog =
      reachedDisconnectThreshold ||
      participant.lastViolationLogAt === undefined ||
      currentTime - participant.lastViolationLogAt >= ABUSE_LOG_INTERVAL_MS;

    if (shouldLog) {
      participant.lastViolationLogAt = currentTime;
      logger.warn(
        {
          issueCodes,
          reason,
          socketId: socket.id,
          violations: participant.violationCount,
        },
        'Rejected abusive cursor socket message',
      );
    }

    if (reachedDisconnectThreshold) {
      socket.emit(CURSOR_EVENTS.disconnect, { reason: 'abuse' });
      socket.disconnect(true);
    }
  };

  const acceptMessageBudget = (
    socket: CursorSocket,
    participant: Participant,
    eventName: string,
  ) => {
    const currentTime = now();

    if (!participant.messageLimiter.take(currentTime)) {
      recordViolation(socket, participant, `rate:${eventName}`);
      return;
    }

    return currentTime;
  };

  const acceptCursorInput = (
    socket: CursorSocket,
    participant: Participant,
    input: unknown,
    limiter: TokenBucket,
    eventName: string,
  ) => {
    const acceptedAt = acceptMessageBudget(socket, participant, eventName);

    if (acceptedAt === undefined) {
      return;
    }

    const result = cursorInputSchema.safeParse(input);

    if (!result.success) {
      recordViolation(
        socket,
        participant,
        `invalid:${eventName}`,
        result.error.issues.map((issue) => issue.code),
      );
      return;
    }

    if (!limiter.take(acceptedAt)) {
      recordViolation(socket, participant, `rate:${eventName}`);
      return;
    }

    if (result.data.sequence <= participant.lastSequence) {
      return;
    }

    participant.lastActivityAt = acceptedAt;
    participant.lastSequence = result.data.sequence;
    return result.data;
  };

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

    connectionCountsByIp.set(
      socket.data.cursorIpAddress,
      (connectionCountsByIp.get(socket.data.cursorIpAddress) ?? 0) + 1,
    );
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
          nodes: Array.from(room.nodes.values()),
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
      .catch(() => {
        if (socket.connected) {
          socket.disconnect(true);
        }
      });

    socket.on(CURSOR_EVENTS.color, (input) => {
      const acceptedAt = acceptMessageBudget(
        socket,
        participant,
        CURSOR_EVENTS.color,
      );

      if (acceptedAt === undefined) {
        return;
      }

      const result = cursorColorInputSchema.safeParse(input);

      if (!result.success) {
        recordViolation(
          socket,
          participant,
          `invalid:${CURSOR_EVENTS.color}`,
          result.error.issues.map((issue) => issue.code),
        );
        return;
      }

      if (!participant.colorLimiter.take(acceptedAt)) {
        recordViolation(socket, participant, `rate:${CURSOR_EVENTS.color}`);
        return;
      }

      participant.lastActivityAt = acceptedAt;
      participant.color = result.data.color;
      socket.data.cursorColor = result.data.color;

      if (participant.lastCursor) {
        participant.lastCursor = {
          ...participant.lastCursor,
          color: result.data.color,
        };
        socket.data.cursorLastPosition = participant.lastCursor;
      }

      const pendingMove = room.pendingMoves.get(participant.userId);

      if (pendingMove) {
        room.pendingMoves.set(participant.userId, {
          ...pendingMove,
          color: result.data.color,
        });
      }

      io.to(roomId).emit(CURSOR_EVENTS.presence, {
        color: participant.color,
        username: participant.username,
        userId: participant.userId,
      });
      for (const nodeId of participant.typingNodeIds) {
        socket.to(roomId).emit(CANVAS_EVENTS.typing, {
          isTyping: true,
          nodeId,
          user: {
            color: participant.color,
            username: participant.username,
            userId: participant.userId,
          },
        });
      }
    });

    socket.on(CURSOR_EVENTS.move, (input) => {
      const acceptedInput = acceptCursorInput(
        socket,
        participant,
        input,
        participant.moveLimiter,
        CURSOR_EVENTS.move,
      );

      if (!acceptedInput) {
        return;
      }

      const update: CursorUpdate = {
        ...acceptedInput,
        color: participant.color,
        updatedAt: now(),
        userId: participant.userId,
      };
      const cursor: RemoteCursor = {
        ...update,
        username: participant.username,
      };
      participant.lastCursor = cursor;
      socket.data.cursorLastPosition = cursor;
      room.pendingMoves.set(participant.userId, update);
    });

    socket.on(CURSOR_EVENTS.click, (input) => {
      const acceptedInput = acceptCursorInput(
        socket,
        participant,
        input,
        participant.clickLimiter,
        CURSOR_EVENTS.click,
      );

      if (!acceptedInput) {
        return;
      }

      const update: CursorUpdate = {
        ...acceptedInput,
        color: participant.color,
        updatedAt: now(),
        userId: participant.userId,
      };
      const cursor: RemoteCursor = {
        ...update,
        username: participant.username,
      };
      participant.lastCursor = cursor;
      socket.data.cursorLastPosition = cursor;
      room.pendingMoves.delete(participant.userId);
      socket.to(roomId).volatile.emit(CURSOR_EVENTS.click, update);
    });

    socket.on(CANVAS_EVENTS.messageSend, (input) => {
      const acceptedAt = acceptMessageBudget(
        socket,
        participant,
        CANVAS_EVENTS.messageSend,
      );

      if (acceptedAt === undefined) {
        return;
      }

      const result = canvasMessageInputSchema.safeParse(input);

      if (!result.success) {
        recordViolation(
          socket,
          participant,
          `invalid:${CANVAS_EVENTS.messageSend}`,
          result.error.issues.map((issue) => issue.code),
        );
        return;
      }

      const node = room.nodes.get(result.data.nodeId);

      if (!node || node.type !== 'message') {
        recordViolation(socket, participant, 'invalid:canvas-message-node');
        return;
      }

      if (node.data.messages.some(({ id }) => id === result.data.id)) {
        return;
      }

      if (node.data.messages.length >= MAX_CANVAS_MESSAGES_PER_NODE) {
        recordViolation(socket, participant, 'limit:canvas-messages');
        return;
      }

      if (participant.typingNodeIds.delete(node.id)) {
        socket.to(roomId).emit(CANVAS_EVENTS.typing, {
          isTyping: false,
          nodeId: node.id,
          user: {
            color: participant.color,
            username: participant.username,
            userId: participant.userId,
          },
        });
      }

      const nextNode: CanvasNode = {
        ...node,
        data: {
          messages: [
            ...node.data.messages,
            {
              author: {
                color: participant.color,
                username: participant.username,
                userId: participant.userId,
              },
              id: result.data.id,
              text: result.data.text,
            },
          ],
        },
      };

      participant.lastActivityAt = acceptedAt;
      room.nodes.set(nextNode.id, nextNode);
      io.to(roomId).emit(CANVAS_EVENTS.nodeUpsert, nextNode);
    });

    socket.on(CANVAS_EVENTS.typing, (input) => {
      const acceptedAt = acceptMessageBudget(
        socket,
        participant,
        CANVAS_EVENTS.typing,
      );

      if (acceptedAt === undefined) {
        return;
      }

      const result = canvasTypingInputSchema.safeParse(input);

      if (!result.success) {
        recordViolation(
          socket,
          participant,
          `invalid:${CANVAS_EVENTS.typing}`,
          result.error.issues.map((issue) => issue.code),
        );
        return;
      }

      const node = room.nodes.get(result.data.nodeId);

      if (result.data.isTyping && (!node || node.type !== 'message')) {
        recordViolation(socket, participant, 'invalid:canvas-typing-node');
        return;
      }

      if (result.data.isTyping) {
        for (const previousNodeId of participant.typingNodeIds) {
          if (previousNodeId === result.data.nodeId) {
            continue;
          }

          participant.typingNodeIds.delete(previousNodeId);
          socket.to(roomId).emit(CANVAS_EVENTS.typing, {
            isTyping: false,
            nodeId: previousNodeId,
            user: {
              color: participant.color,
              username: participant.username,
              userId: participant.userId,
            },
          });
        }
        participant.typingNodeIds.add(result.data.nodeId);
      } else {
        participant.typingNodeIds.delete(result.data.nodeId);
      }

      participant.lastActivityAt = acceptedAt;
      socket.to(roomId).emit(CANVAS_EVENTS.typing, {
        ...result.data,
        user: {
          color: participant.color,
          username: participant.username,
          userId: participant.userId,
        },
      });
    });

    socket.on(CANVAS_EVENTS.nodeUpsert, (input) => {
      const acceptedAt = acceptMessageBudget(
        socket,
        participant,
        CANVAS_EVENTS.nodeUpsert,
      );

      if (acceptedAt === undefined) {
        return;
      }

      const result = canvasNodeSchema.safeParse(input);

      if (!result.success) {
        recordViolation(
          socket,
          participant,
          `invalid:${CANVAS_EVENTS.nodeUpsert}`,
          result.error.issues.map((issue) => issue.code),
        );
        return;
      }

      if (
        !room.nodes.has(result.data.id) &&
        room.nodes.size >= MAX_CANVAS_NODES_PER_ROOM
      ) {
        recordViolation(socket, participant, 'limit:canvas-nodes');
        return;
      }

      const existingNode = room.nodes.get(result.data.id);
      const nextNode: CanvasNode =
        result.data.type === 'message'
          ? {
              ...result.data,
              data: {
                messages:
                  existingNode?.type === 'message'
                    ? existingNode.data.messages
                    : [],
              },
            }
          : result.data;

      participant.lastActivityAt = acceptedAt;
      room.nodes.set(nextNode.id, nextNode);
      io.to(roomId).emit(CANVAS_EVENTS.nodeUpsert, nextNode);
    });

    socket.on('disconnect', () => {
      const ipConnectionCount =
        connectionCountsByIp.get(socket.data.cursorIpAddress) ?? 0;

      if (ipConnectionCount <= 1) {
        connectionCountsByIp.delete(socket.data.cursorIpAddress);
      } else {
        connectionCountsByIp.set(
          socket.data.cursorIpAddress,
          ipConnectionCount - 1,
        );
      }

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

      for (const [ipAddress, attemptState] of connectionAttemptsByIp) {
        if (
          currentTime - attemptState.lastSeenAt >=
          CONNECTION_ATTEMPT_RETENTION_MS
        ) {
          connectionAttemptsByIp.delete(ipAddress);
        }
      }
    },
    Math.max(10, Math.min(1_000, idleTimeoutMs, connectionIdleTimeoutMs)),
  );

  batchTimer.unref();
  idleTimer.unref();

  return {
    close: () => {
      clearInterval(batchTimer);
      clearInterval(idleTimer);
      connectionAttemptsByIp.clear();
      connectionCountsByIp.clear();
      rooms.clear();
    },
  };
};
