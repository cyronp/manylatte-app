import { CURSOR_PALETTE } from '@app/shared';
import { HexColorPicker as ReactHexColorPicker } from 'react-colorful';

interface HexColorPickerProps {
  className?: string;
  color?: string;
  onChange: (color: string) => void;
}

export function HexColorPicker({
  className,
  color = '#000000',
  onChange,
}: HexColorPickerProps) {
  const selectedColor = color.toLowerCase();

  return (
    <div className="flex flex-col gap-2">
      <ReactHexColorPicker
        className={className}
        color={color}
        onChange={onChange}
      />
      <div
        className="grid grid-cols-8 gap-1"
        role="group"
        aria-label="Preset colors"
      >
        {CURSOR_PALETTE.map((presetColor) => {
          const isSelected = selectedColor === presetColor;

          return (
            <button
              key={presetColor}
              type="button"
              aria-label={`Choose color ${presetColor}`}
              aria-pressed={isSelected}
              className="size-5 rounded-full border-2 border-background shadow-xs outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-pressed:ring-2 aria-pressed:ring-foreground aria-pressed:ring-offset-1 aria-pressed:ring-offset-background"
              style={{ backgroundColor: presetColor }}
              onClick={() => onChange(presetColor)}
            />
          );
        })}
      </div>
    </div>
  );
}
