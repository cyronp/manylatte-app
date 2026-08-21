import type { CursorPosition } from '@app/shared';

interface PointerCoordinates {
  clientX: number;
  clientY: number;
}

interface SurfaceBounds {
  height: number;
  left: number;
  top: number;
  width: number;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export const normalizeCursorPosition = (
  pointer: PointerCoordinates,
  bounds: SurfaceBounds,
): CursorPosition | undefined => {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return;
  }

  return {
    x: clamp((pointer.clientX - bounds.left) / bounds.width),
    y: clamp((pointer.clientY - bounds.top) / bounds.height),
  };
};
