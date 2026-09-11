import { randomInt, randomUUID } from 'node:crypto';
import { Prisma, type Database } from '@app/db';
import { lobbyUserId } from './lobby-identity.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const generateLobbyCode = () => {
  const code = Array.from(
    { length: 8 },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join('');
  return `${code.slice(0, 4)}-${code.slice(4)}`;
};

export class LobbyCapacityError extends Error {}

export const persistLobby = async (
  database: Database,
  name: string,
  maxLobbies = 10_000,
  token = randomUUID(),
) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await database.$transaction(async (tx) => {
        if ((await tx.lobby.count()) >= maxLobbies)
          throw new LobbyCapacityError(
            'Lobby capacity reached. Contact the operator to archive or remove unused lobbies.',
          );
        const id = randomUUID();
        const lobby = await tx.lobby.create({
          data: {
            id,
            code: generateLobbyCode(),
            name,
            ownerId: lobbyUserId(token, id),
          },
          select: { id: true, code: true, name: true },
        });
        return { ...lobby, token };
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002' ||
        attempt === 4
      )
        throw error;
    }
  }
  throw new Error('Could not allocate a lobby code');
};
