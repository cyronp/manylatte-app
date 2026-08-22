import { hexColorSchema, type HexColor } from '@app/shared';

const WHITE = hexColorSchema.parse('#ffffff');
const BLACK = hexColorSchema.parse('#000000');

const toLinearChannel = (channel: number) => {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

export const getRelativeLuminance = (color: HexColor) => {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);

  return (
    0.2126 * toLinearChannel(red) +
    0.7152 * toLinearChannel(green) +
    0.0722 * toLinearChannel(blue)
  );
};

export const getCursorLabelTextColor = (background: HexColor) => {
  const luminance = getRelativeLuminance(background);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const blackContrast = (luminance + 0.05) / 0.05;

  return whiteContrast >= blackContrast ? WHITE : BLACK;
};
