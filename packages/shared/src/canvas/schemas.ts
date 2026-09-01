import { z } from 'zod';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from './constants.js';

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
    data: z.object({}),
    type: z.literal('message'),
  }),
]);

export type CanvasNode = z.infer<typeof canvasNodeSchema>;

export const canvasSnapshotSchema = z.object({
  nodes: z.array(canvasNodeSchema),
});

export type CanvasSnapshot = z.infer<typeof canvasSnapshotSchema>;
