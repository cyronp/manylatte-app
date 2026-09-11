import { z } from 'zod';

import { cursorRoomIdSchema } from './cursor/schemas.js';

export const lobbyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/)
  .transform((code) => {
    const characters = code.replace('-', '');
    return `${characters.slice(0, 4)}-${characters.slice(4)}`;
  });

export const createLobbySchema = z.object({
  name: z
    .string()
    .trim()
    .normalize('NFC')
    .min(1)
    .max(64)
    .regex(/^[^\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]+$/u),
});

export const lobbySchema = z.object({
  id: cursorRoomIdSchema,
  code: lobbyCodeSchema,
  name: z.string(),
});

export type Lobby = z.infer<typeof lobbySchema>;

export const lobbyCreatedSchema = lobbySchema.extend({ token: z.uuidv4() });
export const lobbyModerationSchema = z.object({
  action: z.enum(['kick', 'transfer']),
  userId: z.uuidv4(),
});
export const lobbyOwnershipSchema = z.object({
  ownerId: z.uuidv4().nullable(),
});
export type LobbyModeration = z.infer<typeof lobbyModerationSchema>;
export type LobbyOwnership = z.infer<typeof lobbyOwnershipSchema>;
export type LobbyModerationResult =
  { ok: true } | { ok: false; message: string };
