import {
  DEFAULT_CURSOR_ROOM_ID,
  cursorRoomIdSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@app/shared';
import cors from '@fastify/cors';
import { connectDatabase, createDatabase, type Database } from '@app/db';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';
import { Server as SocketServer } from 'socket.io';

import {
  registerCursorServer,
  type CursorIo,
  type CursorSocketData,
} from './cursor/cursor-server.js';
import { createCanvasPersistence } from './cursor/canvas-persistence.js';
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
  database?: Database;
  databaseUrl?: string;
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
  database: suppliedDatabase,
  databaseUrl,
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
  if (redisUrl) {
    throw new Error(
      'REDIS_URL is not supported with the single-instance SQLite canvas. Run one API instance with a persistent database volume.',
    );
  }
  const database = suppliedDatabase ?? createDatabase(databaseUrl);
  await connectDatabase(database);
  const app = Fastify({ logger, trustProxy });
  app.addHook('onClose', async () => database.$disconnect());
  try {
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
      canvasPersistence: createCanvasPersistence(database),
      authorizeRoom: (roomId) => roomId === publicRoomId,
      connectionIdleTimeoutMs,
      idleTimeoutMs: cursorIdleTimeoutMs,
      logger: app.log,
      maxConnectionsPerIp,
      maxParticipantsPerRoom,
      maxTotalConnections,
      trustProxy,
    });
    app.addHook('preClose', async () => {
      io.local.disconnectSockets(true);
      await cursorServer.close();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    });

    app.get('/healthz', async () => ({ status: 'ok' }));
    app.get('/readyz', async (_request, reply) => {
      try {
        await database.$queryRawUnsafe('SELECT 1');
        return { status: 'ready' };
      } catch {
        return reply.code(503).send({ status: 'unavailable' });
      }
    });

    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
};
