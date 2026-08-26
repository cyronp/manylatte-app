import {
  DEFAULT_CURSOR_ROOM_ID,
  cursorRoomIdSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@app/shared';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';
import { Server as SocketServer } from 'socket.io';

import {
  registerCursorServer,
  type CursorIo,
  type CursorSocketData,
} from './cursor/cursor-server.js';
import { attachRedisAdapter } from './redis-adapter.js';
import {
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_CURSOR_CONNECTION_IDLE_TIMEOUT_MS,
  DEFAULT_CURSOR_MAX_CONNECTIONS_PER_IP,
  DEFAULT_CURSOR_MAX_PARTICIPANTS_PER_ROOM,
  DEFAULT_CURSOR_MAX_TOTAL_CONNECTIONS,
  DEFAULT_SOCKET_MAX_HTTP_BUFFER_BYTES,
} from './security-config.js';

type InterServerEvents = Record<never, never>;

export interface CreateAppOptions {
  allowedOrigins?: readonly string[];
  connectionIdleTimeoutMs?: number;
  cursorIdleTimeoutMs?: number;
  logger?: boolean;
  maxConnectionsPerIp?: number;
  maxHttpBufferBytes?: number;
  maxParticipantsPerRoom?: number;
  maxTotalConnections?: number;
  redisUrl?: string;
  trustProxy?: boolean;
}

export const createApp = async ({
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
  connectionIdleTimeoutMs = DEFAULT_CURSOR_CONNECTION_IDLE_TIMEOUT_MS,
  cursorIdleTimeoutMs,
  logger = true,
  maxConnectionsPerIp = DEFAULT_CURSOR_MAX_CONNECTIONS_PER_IP,
  maxHttpBufferBytes = DEFAULT_SOCKET_MAX_HTTP_BUFFER_BYTES,
  maxParticipantsPerRoom = DEFAULT_CURSOR_MAX_PARTICIPANTS_PER_ROOM,
  maxTotalConnections = DEFAULT_CURSOR_MAX_TOTAL_CONNECTIONS,
  redisUrl,
  trustProxy = false,
}: CreateAppOptions = {}) => {
  const app = Fastify({ logger, trustProxy });
  const allowedOriginSet = new Set(allowedOrigins);
  const isOriginAllowed = (origin: string | undefined) =>
    origin === undefined || allowedOriginSet.has(origin);

  await app.register(helmet);
  await app.register(cors, {
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
  });
  const io: CursorIo = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    CursorSocketData
  >(app.server, {
    allowRequest: (request, callback) =>
      callback(null, isOriginAllowed(request.headers.origin)),
    cors: {
      origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    },
    maxHttpBufferSize: maxHttpBufferBytes,
    serveClient: false,
  });
  const publicRoomId = cursorRoomIdSchema.parse(DEFAULT_CURSOR_ROOM_ID);
  const cursorServer = registerCursorServer(io, {
    authorizeRoom: (roomId) => roomId === publicRoomId,
    connectionIdleTimeoutMs,
    idleTimeoutMs: cursorIdleTimeoutMs,
    logger: app.log,
    maxConnectionsPerIp,
    maxParticipantsPerRoom,
    maxTotalConnections,
    trustProxy,
  });
  const closeRedis = redisUrl
    ? await attachRedisAdapter(io, redisUrl, app.log)
    : undefined;

  app.addHook('preClose', async () => {
    cursorServer.close();
    io.local.disconnectSockets(true);
    io.close();
    await closeRedis?.();
  });

  return app;
};
