import { hexColorSchema, type HexColor } from '@app/shared';

const cursorPalette = [
  '#2563eb',
  '#e11d48',
  '#059669',
  '#7c3aed',
  '#d97706',
  '#0891b2',
  '#db2777',
  '#4d7c0f',
] as const;

export const CURSOR_PALETTE: readonly HexColor[] = cursorPalette.map((color) =>
  hexColorSchema.parse(color),
);

export const selectCursorColor = (activeColors: Iterable<HexColor>) => {
  const usage = new Map(CURSOR_PALETTE.map((color) => [color, 0]));

  for (const color of activeColors) {
    usage.set(color, (usage.get(color) ?? 0) + 1);
  }

  return CURSOR_PALETTE.reduce((leastUsedColor, color) =>
    (usage.get(color) ?? 0) < (usage.get(leastUsedColor) ?? 0)
      ? color
      : leastUsedColor,
  );
};
