import {
  DEFAULT_CURSOR_ROOM_ID,
  cursorRoomIdSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@app/shared';
import Fastify from 'fastify';
import { Server as SocketServer } from 'socket.io';

import {
  registerCursorServer,
  type CursorIo,
  type CursorSocketData,
} from './cursor/cursor-server.js';
import { attachRedisAdapter } from './redis-adapter.js';

type InterServerEvents = Record<never, never>;

export interface CreateAppOptions {
  cursorIdleTimeoutMs?: number;
  logger?: boolean;
  redisUrl?: string;
  webUrl: string;
}

export const createApp = async ({
  cursorIdleTimeoutMs,
  logger = true,
  redisUrl,
  webUrl,
}: CreateAppOptions) => {
  const app = Fastify({ logger });
  const io: CursorIo = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    CursorSocketData
  >(app.server, {
    cors: {
      origin: webUrl,
    },
  });
  const publicRoomId = cursorRoomIdSchema.parse(DEFAULT_CURSOR_ROOM_ID);
  const cursorServer = registerCursorServer(io, {
    authorizeRoom: (roomId) => roomId === publicRoomId,
    idleTimeoutMs: cursorIdleTimeoutMs,
    logger: app.log,
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
