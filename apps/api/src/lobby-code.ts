import { randomInt, randomUUID } from 'node:crypto';
import { Prisma, type Database } from '@app/db';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const generateLobbyCode = () => {
  const code = Array.from(
    { length: 8 },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join('');
  return `${code.slice(0, 4)}-${code.slice(4)}`;
};

export const persistLobby = async (database: Database, name: string) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await database.lobby.create({
        data: { id: randomUUID(), code: generateLobbyCode(), name },
        select: { id: true, code: true, name: true },
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
