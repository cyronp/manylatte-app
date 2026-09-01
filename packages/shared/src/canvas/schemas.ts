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

const canvasNodeBaseSchema = z.object({
  id: z.uuidv4(),
  position: z.object({
    x: z.number().finite().min(0).max(CANVAS_WIDTH),
    y: z.number().finite().min(0).max(CANVAS_HEIGHT),
  }),
});

export const canvasNodeSchema = z.discriminatedUnion('type', [
  canvasNodeBaseSchema.extend({
    data: z.object({
      emoji: z.string().min(1).max(32),
      label: z.string().min(1).max(128),
    }),
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

export const canvasSnapshotSchema = z.object({
  nodes: z.array(canvasNodeSchema),
});

export type CanvasSnapshot = z.infer<typeof canvasSnapshotSchema>;
