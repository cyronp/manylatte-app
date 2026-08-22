import { z } from 'zod';

import { hexColorSchema } from '../schemas/color.js';

export const cursorRoomIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .brand<'CursorRoomId'>();

export type CursorRoomId = z.infer<typeof cursorRoomIdSchema>;

export const cursorUsernameSchema = z.string().trim().min(1).max(32);

export type CursorUsername = z.infer<typeof cursorUsernameSchema>;

export const cursorSocketAuthSchema = z.object({
  roomId: cursorRoomIdSchema,
  username: cursorUsernameSchema,
});

export type CursorSocketAuth = z.infer<typeof cursorSocketAuthSchema>;

export const cursorPositionSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export type CursorPosition = z.infer<typeof cursorPositionSchema>;

export const cursorInputSchema = cursorPositionSchema.extend({
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export type CursorInput = z.infer<typeof cursorInputSchema>;

export const cursorUserSchema = z.object({
  color: hexColorSchema,
  username: cursorUsernameSchema,
  userId: z.uuidv4(),
});

export type CursorUser = z.infer<typeof cursorUserSchema>;

export const remoteCursorSchema = cursorInputSchema.extend({
  color: hexColorSchema,
  username: cursorUsernameSchema,
  updatedAt: z.number().int().nonnegative(),
  userId: z.uuidv4(),
});

export type RemoteCursor = z.infer<typeof remoteCursorSchema>;

export const cursorBatchSchema = z.object({
  cursors: z.array(remoteCursorSchema),
});

export type CursorBatch = z.infer<typeof cursorBatchSchema>;

export const cursorSessionSchema = z.object({
  cursors: z.array(remoteCursorSchema),
  self: cursorUserSchema,
});

export type CursorSession = z.infer<typeof cursorSessionSchema>;

export const cursorRemovalSchema = z.object({
  reason: z.enum(['disconnect', 'idle']),
  userId: z.uuidv4(),
});

export type CursorRemoval = z.infer<typeof cursorRemovalSchema>;
