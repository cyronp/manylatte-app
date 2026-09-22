import type { CanvasPostitColor } from '@app/shared';
import { CheckIcon } from '@phosphor-icons/react';

export const POSTIT_COLORS = {
  yellow: 'bg-yellow-200',
  pink: 'bg-pink-200',
  blue: 'bg-blue-200',
  green: 'bg-green-200',
  purple: 'bg-purple-200',
} satisfies Record<CanvasPostitColor, string>;

export const POSTIT_COLOR_NAMES = Object.keys(
  POSTIT_COLORS,
) as CanvasPostitColor[];

export function PostitActions({
  color,
  disabled,
  onColorChange,
}: {
  color: CanvasPostitColor;
  disabled: boolean;
  onColorChange: (color: CanvasPostitColor) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Post-it actions"
      className="nodrag nopan nowheel absolute top-full left-1/2 z-10 mt-2 flex -translate-x-1/2 cursor-auto items-center gap-2 rounded-full border bg-background p-2 text-foreground shadow-lg"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') event.stopPropagation();
      }}
    >
      {POSTIT_COLOR_NAMES.map((option) => (
        <button
          key={option}
          type="button"
          aria-label={`Make Post-it ${option}`}
          aria-pressed={color === option}
          disabled={disabled}
          className={`flex size-7 items-center justify-center rounded-full border border-black/15 text-black focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 ${POSTIT_COLORS[option]}`}
          onClick={() => onColorChange(option)}
        >
          {color === option && <CheckIcon aria-hidden="true" size={16} />}
        </button>
      ))}
    </div>
  );
}
