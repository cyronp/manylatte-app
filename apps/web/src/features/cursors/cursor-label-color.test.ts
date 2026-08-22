import { hexColorSchema, type HexColor } from '@app/shared';
import { describe, expect, it } from 'vitest';

import {
  getCursorLabelTextColor,
  getRelativeLuminance,
} from './cursor-label-color';

const cursorPalette = [
  '#2563eb',
  '#e11d48',
  '#059669',
  '#7c3aed',
  '#d97706',
  '#0891b2',
  '#db2777',
  '#4d7c0f',
].map((color) => hexColorSchema.parse(color));

const contrastRatio = (first: HexColor, second: HexColor) => {
  const luminances = [
    getRelativeLuminance(first),
    getRelativeLuminance(second),
  ].sort((a, b) => b - a);

  return ((luminances[0] ?? 0) + 0.05) / ((luminances[1] ?? 0) + 0.05);
};

describe('cursor label color', () => {
  it('chooses a readable foreground for every cursor color', () => {
    cursorPalette.forEach((background) => {
      const foreground = getCursorLabelTextColor(background);
      expect(contrastRatio(background, foreground)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('uses white on dark colors and black on light colors', () => {
    expect(getCursorLabelTextColor(hexColorSchema.parse('#2563eb'))).toBe(
      '#ffffff',
    );
    expect(getCursorLabelTextColor(hexColorSchema.parse('#d97706'))).toBe(
      '#000000',
    );
  });
});
