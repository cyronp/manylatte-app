import type { Database } from '@app/db';
import {
  createLobbySchema,
  cursorRoomIdSchema,
  lobbyCodeSchema,
} from '@app/shared';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { persistLobby, LobbyCapacityError } from './lobby-code.js';

export const registerLobbyRoutes = async (
  app: FastifyInstance,
  database: Database,
  isOriginAllowed: (origin: string | undefined) => boolean,
  maxLobbies = 10_000,
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
      try {
        reply.header('Cache-Control', 'no-store');
        const lobby = await persistLobby(
          database,
          result.data.name,
          maxLobbies,
        );
        return reply.code(201).send(lobby);
      } catch (error) {
        if (error instanceof LobbyCapacityError)
          return reply.code(503).send({ message: error.message });
        throw error;
      }
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
      const code = lobbyCodeSchema.safeParse(result.data);
      const lobby = await database.lobby.findUnique({
        where: {
          ...(code.success ? { code: code.data } : { id: result.data }),
          archivedAt: null,
        },
        select: { id: true, code: true, name: true },
      });
      if (!lobby)
        return reply.code(404).send({
          message: 'This lobby does not exist. Check the invite link.',
        });
      return lobby;
    },
  );
};
