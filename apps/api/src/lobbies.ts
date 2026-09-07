import { randomUUID } from 'node:crypto';
import type { Database } from '@app/db';
import {
  createLobbySchema,
  cursorRoomIdSchema,
  DEFAULT_CURSOR_ROOM_ID,
} from '@app/shared';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

export const registerLobbyRoutes = async (
  app: FastifyInstance,
  database: Database,
  isOriginAllowed: (origin: string | undefined) => boolean,
) => {
  await app.register(rateLimit, { global: false });

  app.post(
    '/lobbies',
    {
      bodyLimit: 1024,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      if (!isOriginAllowed(request.headers.origin)) {
        return reply.code(403).send({ message: 'Origin not allowed' });
      }
      const result = createLobbySchema.safeParse(request.body);
      if (!result.success) {
        return reply.code(400).send({
          message: 'Enter a lobby name with 1–64 visible characters.',
        });
      }
      const lobby = await database.lobby.create({
        data: { id: randomUUID(), name: result.data.name },
        select: { id: true, name: true },
      });
      return reply.code(201).send(lobby);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/lobbies/:id',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const result = cursorRoomIdSchema.safeParse(request.params.id);
      if (!result.success) {
        return reply.code(400).send({ message: 'Invalid lobby link.' });
      }
      if (result.data === DEFAULT_CURSOR_ROOM_ID) {
        return { id: DEFAULT_CURSOR_ROOM_ID, name: 'Public lobby' };
      }
      const lobby = await database.lobby.findUnique({
        where: { id: result.data },
        select: { id: true, name: true },
      });
      if (!lobby)
        return reply.code(404).send({
          message: 'This lobby does not exist. Check the invite link.',
        });
      return lobby;
    },
  );
};
