import { describe, expect, it } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@app/shared';

import { constrainCursorPosition } from './cursor-position';

describe('constrainCursorPosition', () => {
  it('keeps positions inside the shared canvas unchanged', () => {
    expect(constrainCursorPosition({ x: 2_400, y: 1_350 })).toEqual({
      x: 2_400,
      y: 1_350,
    });
  });

  it('clamps projected positions at the canvas edges', () => {
    expect(constrainCursorPosition({ x: -10, y: CANVAS_HEIGHT + 10 })).toEqual({
      x: 0,
      y: CANVAS_HEIGHT,
    });
  });

  it('accepts the bottom-right canvas boundary', () => {
    expect(
      constrainCursorPosition({ x: CANVAS_WIDTH, y: CANVAS_HEIGHT }),
    ).toEqual({ x: CANVAS_WIDTH, y: CANVAS_HEIGHT });
  });

  it('ignores non-finite projected positions', () => {
    expect(constrainCursorPosition({ x: Number.NaN, y: 50 })).toBeUndefined();
  });
});
