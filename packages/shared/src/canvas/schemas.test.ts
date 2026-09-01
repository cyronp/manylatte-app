import { describe, expect, it } from 'vitest';

import { CANVAS_WIDTH } from './constants.js';
import { canvasNodeSchema } from './schemas.js';

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
        data: {},
        id: '21c9b25b-4656-47ba-b95d-94ad13ba8a3b',
        position: { x: 300, y: 400 },
        type: 'message',
      }).success,
    ).toBe(true);
  });

  it('rejects invalid node types and positions outside the canvas', () => {
    expect(
      canvasNodeSchema.safeParse({
        data: {},
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
});
