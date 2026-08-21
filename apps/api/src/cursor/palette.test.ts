import { describe, expect, it } from 'vitest';

import { CURSOR_PALETTE, selectCursorColor } from './palette.js';

describe('cursor palette', () => {
  it('uses every accessible palette color before reusing one', () => {
    const activeColors = [];

    for (let index = 0; index < CURSOR_PALETTE.length; index += 1) {
      const color = selectCursorColor(activeColors);
      expect(activeColors).not.toContain(color);
      activeColors.push(color);
    }

    expect(selectCursorColor(activeColors)).toBe(CURSOR_PALETTE[0]);
  });
});
