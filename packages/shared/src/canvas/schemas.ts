import { z } from 'zod';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAX_CANVAS_MESSAGES_PER_NODE,
} from './constants.js';
import { cursorUserSchema } from '../cursor/schemas.js';

const canvasMessageTextSchema = z
  .string()
  .transform((text) => text.trim().normalize('NFC'))
  .pipe(z.string().min(1).max(1_000));

export const canvasMessageSchema = z.object({
  author: cursorUserSchema,
  id: z.uuidv4(),
  text: canvasMessageTextSchema,
});

export type CanvasMessage = z.infer<typeof canvasMessageSchema>;

export const canvasMessageInputSchema = z.object({
  id: z.uuidv4(),
  nodeId: z.uuidv4(),
  text: canvasMessageTextSchema,
});

export type CanvasMessageInput = z.infer<typeof canvasMessageInputSchema>;

export const canvasTypingInputSchema = z.object({
  isTyping: z.boolean(),
  nodeId: z.uuidv4(),
});

export type CanvasTypingInput = z.infer<typeof canvasTypingInputSchema>;

export const canvasTypingUpdateSchema = canvasTypingInputSchema.extend({
  user: cursorUserSchema,
});

export type CanvasTypingUpdate = z.infer<typeof canvasTypingUpdateSchema>;

const canvasPositionSchema = z.object({
  x: z.number().finite().min(0).max(CANVAS_WIDTH),
  y: z.number().finite().min(0).max(CANVAS_HEIGHT),
});

const canvasNodeBaseSchema = z.object({
  id: z.uuidv4(),
  position: canvasPositionSchema,
});

const canvasEmojiDataSchema = z.object({
  emoji: z.string().min(1).max(32),
  label: z.string().min(1).max(128),
});

export const canvasNodeSchema = z.discriminatedUnion('type', [
  canvasNodeBaseSchema.extend({
    data: canvasEmojiDataSchema,
    type: z.literal('emoji'),
  }),
  canvasNodeBaseSchema.extend({
    data: z.object({
      messages: z.array(canvasMessageSchema).max(MAX_CANVAS_MESSAGES_PER_NODE),
    }),
    type: z.literal('message'),
  }),
]);

export type CanvasNode = z.infer<typeof canvasNodeSchema>;

export const canvasNodeCreateSchema = z.discriminatedUnion('type', [
  z.strictObject({
    data: canvasEmojiDataSchema,
    id: z.uuidv4(),
    position: canvasPositionSchema,
    type: z.literal('emoji'),
  }),
  z.strictObject({
    id: z.uuidv4(),
    position: canvasPositionSchema,
    type: z.literal('message'),
  }),
]);

export type CanvasNodeCreate = z.infer<typeof canvasNodeCreateSchema>;

export const canvasNodeMutationSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('delete'),
    nodeId: z.uuidv4(),
  }),
  z.strictObject({
    action: z.literal('create'),
    node: canvasNodeCreateSchema,
  }),
  z.strictObject({
    action: z.literal('move'),
    nodeId: z.uuidv4(),
    position: canvasPositionSchema,
  }),
]);

export type CanvasNodeMutation = z.infer<typeof canvasNodeMutationSchema>;

export const canvasSnapshotSchema = z.object({
  nodes: z.array(canvasNodeSchema),
});

export type CanvasSnapshot = z.infer<typeof canvasSnapshotSchema>;
