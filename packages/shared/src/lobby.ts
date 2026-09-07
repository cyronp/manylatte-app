import { z } from 'zod';

import { cursorRoomIdSchema } from './cursor/schemas.js';

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
  name: z.string(),
});

export type Lobby = z.infer<typeof lobbySchema>;
