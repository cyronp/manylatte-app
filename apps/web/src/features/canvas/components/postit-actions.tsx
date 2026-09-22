import type { CanvasPostitColor } from '@app/shared';
import { CheckIcon, TrashIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

export const POSTIT_COLORS = {
  yellow: 'bg-yellow-200',
  pink: 'bg-pink-200',
  blue: 'bg-blue-200',
  green: 'bg-green-200',
} satisfies Record<CanvasPostitColor, string>;

export const POSTIT_COLOR_NAMES = Object.keys(
  POSTIT_COLORS,
) as CanvasPostitColor[];

export function PostitActions({
  color,
  disabled,
  onColorChange,
  onRemove,
}: {
  color: CanvasPostitColor;
  disabled: boolean;
  onColorChange: (color: CanvasPostitColor) => void;
  onRemove: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Post-it actions"
      className="nodrag nopan nowheel absolute bottom-full left-1/2 z-10 mb-2 flex -translate-x-1/2 cursor-auto items-center gap-2 rounded-xl border bg-background p-2 text-foreground shadow-lg"
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
      <span aria-hidden="true" className="h-6 w-px bg-border" />
      <Button
        aria-label="Remove Post-it"
        title="Remove Post-it"
        variant="destructive"
        size="icon-sm"
        disabled={disabled}
        onClick={onRemove}
      >
        <TrashIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
