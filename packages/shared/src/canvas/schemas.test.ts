import { describe, expect, it } from 'vitest';

import { CANVAS_WIDTH } from './constants.js';
import {
  canvasMessageInputSchema,
  canvasNodeSchema,
  canvasTypingInputSchema,
} from './schemas.js';

describe('canvas node contract', () => {
  it('accepts emoji and message nodes', () => {
    expect(
      canvasNodeSchema.safeParse({
        data: { emoji: '☕', label: 'Hot beverage' },
        id: 'd599a14f-1078-4c17-b809-f7fe3e9902ec',
        position: { x: 100, y: 200 },
        type: 'emoji',
      }).success,
    ).toBe(true);
    expect(
      canvasNodeSchema.safeParse({
        data: { messages: [] },
        id: '21c9b25b-4656-47ba-b95d-94ad13ba8a3b',
        position: { x: 300, y: 400 },
        type: 'message',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid node types and positions outside the canvas', () => {
    expect(
      canvasNodeSchema.safeParse({
        data: { messages: [] },
        id: '21c9b25b-4656-47ba-b95d-94ad13ba8a3b',
        position: { x: CANVAS_WIDTH + 1, y: 0 },
        type: 'message',
      }).success,
    ).toBe(false);
    expect(
      canvasNodeSchema.safeParse({
        data: {},
        id: '21c9b25b-4656-47ba-b95d-94ad13ba8a3b',
        position: { x: 0, y: 0 },
        type: 'video',
      }).success,
    ).toBe(false);
  });

  it('normalizes valid message input and rejects blank messages', () => {
    expect(
      canvasMessageInputSchema.parse({
        id: '3817c8a6-9f88-478f-b03c-c3b06b095a47',
        nodeId: '21c9b25b-4656-47ba-b95d-94ad13ba8a3b',
        text: '  Olá  ',
      }),
    ).toEqual({
      id: '3817c8a6-9f88-478f-b03c-c3b06b095a47',
      nodeId: '21c9b25b-4656-47ba-b95d-94ad13ba8a3b',
      text: 'Olá',
    });
    expect(
      canvasMessageInputSchema.safeParse({
        id: '3817c8a6-9f88-478f-b03c-c3b06b095a47',
        nodeId: '21c9b25b-4656-47ba-b95d-94ad13ba8a3b',
        text: '   ',
      }).success,
    ).toBe(false);
  });

  it('validates per-node typing updates', () => {
    expect(
      canvasTypingInputSchema.parse({
        isTyping: true,
        nodeId: '21c9b25b-4656-47ba-b95d-94ad13ba8a3b',
      }),
    ).toEqual({
      isTyping: true,
      nodeId: '21c9b25b-4656-47ba-b95d-94ad13ba8a3b',
    });
    expect(
      canvasTypingInputSchema.safeParse({
        isTyping: true,
        nodeId: 'not-a-node-id',
      }).success,
    ).toBe(false);
  });
});
