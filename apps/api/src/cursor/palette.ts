import { CURSOR_PALETTE, type HexColor } from '@app/shared';

export { CURSOR_PALETTE } from '@app/shared';

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
