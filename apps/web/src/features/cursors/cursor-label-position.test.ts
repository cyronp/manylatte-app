import { describe, expect, it } from 'vitest';

import { getCursorLabelPosition } from './cursor-label-position';

const baseInput = {
  anchorX: 100,
  anchorY: 100,
  labelHeight: 20,
  labelWidth: 80,
  surfaceHeight: 300,
  surfaceWidth: 300,
};

describe('cursor label position', () => {
  it('places the label below the cursor when space is available', () => {
    expect(getCursorLabelPosition(baseInput)).toEqual({ left: 0, top: 30 });
  });

  it('moves the label left before it crosses the right edge', () => {
    expect(
      getCursorLabelPosition({ ...baseInput, anchorX: 280 }),
    ).toMatchObject({ left: -60 });
  });

  it('keeps the label at the left edge', () => {
    expect(getCursorLabelPosition({ ...baseInput, anchorX: -5 })).toMatchObject(
      { left: 5 },
    );
  });

  it('flips the label above the cursor near the bottom edge', () => {
    expect(
      getCursorLabelPosition({ ...baseInput, anchorY: 270 }),
    ).toMatchObject({ top: -22 });
  });
});
