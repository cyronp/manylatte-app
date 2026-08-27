import { CANVAS_HEIGHT, CANVAS_WIDTH, type CursorPosition } from '@app/shared';

interface WorldCoordinates {
  x: number;
  y: number;
}

export const constrainCursorPosition = (
  position: WorldCoordinates,
): CursorPosition | undefined => {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return;
  }

  return {
    x: Math.min(CANVAS_WIDTH, Math.max(0, position.x)),
    y: Math.min(CANVAS_HEIGHT, Math.max(0, position.y)),
  };
};
