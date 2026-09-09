import { z } from 'zod';
import {
  canvasMessageInputSchema,
  canvasMessageSchema,
  canvasMessageTextSchema,
  canvasNodeMutationSchema,
  canvasNodeSchema,
  canvasPositionSchema,
} from './schemas.js';

export const canvasCommandBodySchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('mutation'),
    mutation: canvasNodeMutationSchema,
  }),
  z.strictObject({
    type: z.literal('message'),
    input: canvasMessageInputSchema,
  }),
  z.strictObject({
    type: z.literal('thread'),
    nodeId: z.uuidv4(),
    position: canvasPositionSchema,
    message: z.strictObject({ id: z.uuidv4(), text: canvasMessageTextSchema }),
  }),
]);
export const canvasCommandSchema = z.strictObject({
  id: z.uuidv4(),
  body: canvasCommandBodySchema,
});
export type CanvasCommandBody = z.infer<typeof canvasCommandBodySchema>;
export type CanvasCommand = z.infer<typeof canvasCommandSchema>;

export const canvasChangeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('upsert'), node: canvasNodeSchema }),
  z.object({ type: z.literal('remove'), nodeId: z.uuidv4() }),
  z.object({
    type: z.literal('move'),
    nodeId: z.uuidv4(),
    position: canvasPositionSchema,
  }),
  z.object({
    type: z.literal('message'),
    nodeId: z.uuidv4(),
    message: canvasMessageSchema,
    messageCount: z.number().int().nonnegative(),
  }),
]);
export type CanvasChange = z.infer<typeof canvasChangeSchema>;
export const canvasCommandResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    operationId: z.string(),
    change: canvasChangeSchema.optional(),
  }),
  z.object({
    ok: z.literal(false),
    operationId: z.string(),
    code: z.enum([
      'invalid',
      'limit',
      'missing',
      'conflict',
      'busy',
      'storage',
      'offline',
    ]),
    message: z.string(),
  }),
]);
export type CanvasCommandResult = z.infer<typeof canvasCommandResultSchema>;
export type CanvasCommandAck = (result: CanvasCommandResult) => void;

export const canvasHistoryInputSchema = z.strictObject({
  nodeId: z.uuidv4(),
  before: z.uuidv4().optional(),
});
export type CanvasHistoryInput = z.infer<typeof canvasHistoryInputSchema>;
export interface CanvasHistoryPage {
  messages: z.infer<typeof canvasMessageSchema>[];
  hasMore: boolean;
}
export type CanvasHistoryResult =
  { ok: true; page: CanvasHistoryPage } | { ok: false; message: string };
