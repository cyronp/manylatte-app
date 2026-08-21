import { describe, expect, it } from 'vitest';

import { normalizeCursorPosition } from './cursor-position';

const bounds = { height: 400, left: 100, top: 50, width: 800 };

describe('normalizeCursorPosition', () => {
  it('maps viewport coordinates into a shared surface', () => {
    expect(
      normalizeCursorPosition({ clientX: 500, clientY: 250 }, bounds),
    ).toEqual({ x: 0.5, y: 0.5 });
  });

  it('clamps positions at the surface edges', () => {
    expect(
      normalizeCursorPosition({ clientX: 0, clientY: 1000 }, bounds),
    ).toEqual({ x: 0, y: 1 });
  });

  it('ignores surfaces without measurable dimensions', () => {
    expect(
      normalizeCursorPosition(
        { clientX: 100, clientY: 50 },
        { ...bounds, width: 0 },
      ),
    ).toBeUndefined();
  });
});
