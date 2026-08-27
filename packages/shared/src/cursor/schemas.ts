import { z } from 'zod';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../canvas/constants.js';
import { hexColorSchema } from '../schemas/color.js';

export const cursorRoomIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .brand<'CursorRoomId'>();

export type CursorRoomId = z.infer<typeof cursorRoomIdSchema>;

const disallowedUsernameCharacters = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;

export const cursorUsernameSchema = z
  .string()
  .transform((username) => username.trim().normalize('NFC'))
  .pipe(
    z
      .string()
      .min(1)
      .max(32)
      .refine(
        (username) => !disallowedUsernameCharacters.test(username),
        'Username cannot contain control or invisible formatting characters',
      ),
  );

export type CursorUsername = z.infer<typeof cursorUsernameSchema>;

export const cursorSocketAuthSchema = z.object({
  roomId: cursorRoomIdSchema,
  username: cursorUsernameSchema.optional(),
});

export type CursorSocketAuth = z.infer<typeof cursorSocketAuthSchema>;

export const cursorPositionSchema = z.object({
  x: z.number().finite().min(0).max(CANVAS_WIDTH),
  y: z.number().finite().min(0).max(CANVAS_HEIGHT),
});

export type CursorPosition = z.infer<typeof cursorPositionSchema>;

export const cursorInputSchema = cursorPositionSchema.extend({
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export type CursorInput = z.infer<typeof cursorInputSchema>;

export const cursorColorInputSchema = z.object({
  color: hexColorSchema,
});

export type CursorColorInput = z.infer<typeof cursorColorInputSchema>;

export const cursorDisconnectNoticeSchema = z.object({
  reason: z.enum(['abuse', 'idle']),
});

export type CursorDisconnectNotice = z.infer<
  typeof cursorDisconnectNoticeSchema
>;

export const cursorUserSchema = z.object({
  color: hexColorSchema,
  username: cursorUsernameSchema,
  userId: z.uuidv4(),
});

export type CursorUser = z.infer<typeof cursorUserSchema>;

export const cursorUpdateSchema = cursorInputSchema.extend({
  color: hexColorSchema,
  updatedAt: z.number().int().nonnegative(),
  userId: z.uuidv4(),
});

export type CursorUpdate = z.infer<typeof cursorUpdateSchema>;

export const remoteCursorSchema = cursorUpdateSchema.extend({
  username: cursorUsernameSchema,
});

export type RemoteCursor = z.infer<typeof remoteCursorSchema>;

export const cursorBatchSchema = z.object({
  cursors: z.array(cursorUpdateSchema),
});

export type CursorBatch = z.infer<typeof cursorBatchSchema>;

export const cursorSessionSchema = z.object({
  cursors: z.array(remoteCursorSchema),
  self: cursorUserSchema,
  users: z.array(cursorUserSchema),
});

export type CursorSession = z.infer<typeof cursorSessionSchema>;

export const cursorRemovalSchema = z.object({
  reason: z.enum(['disconnect', 'idle']),
  userId: z.uuidv4(),
});

export type CursorRemoval = z.infer<typeof cursorRemovalSchema>;
