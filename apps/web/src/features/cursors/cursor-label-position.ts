export interface CursorLabelPositionInput {
  anchorX: number;
  anchorY: number;
  labelHeight: number;
  labelWidth: number;
  surfaceHeight: number;
  surfaceWidth: number;
}

const CURSOR_ICON_SIZE = 28;
const CURSOR_LABEL_GAP = 2;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

export const getCursorLabelPosition = ({
  anchorX,
  anchorY,
  labelHeight,
  labelWidth,
  surfaceHeight,
  surfaceWidth,
}: CursorLabelPositionInput) => {
  const absoluteLeft = clamp(
    anchorX,
    0,
    Math.max(0, surfaceWidth - labelWidth),
  );
  const fitsBelow =
    anchorY + CURSOR_ICON_SIZE + CURSOR_LABEL_GAP + labelHeight <=
    surfaceHeight;

  return {
    left: absoluteLeft - anchorX,
    top: fitsBelow
      ? CURSOR_ICON_SIZE + CURSOR_LABEL_GAP
      : -labelHeight - CURSOR_LABEL_GAP,
  };
};
