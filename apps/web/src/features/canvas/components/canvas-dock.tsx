import { CursorIcon, HandIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';

export type CanvasMode = 'cursor' | 'navigation';

interface CanvasDockProps {
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
}

export function CanvasDock({ mode, onModeChange }: CanvasDockProps) {
  return (
    <div
      aria-label="Canvas tools"
      role="group"
      className="absolute bottom-4 left-1/2 z-60 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-popover/95 p-1 text-popover-foreground shadow-lg backdrop-blur-sm"
    >
      <Button
        aria-label="Cursor mode"
        aria-pressed={mode === 'cursor'}
        title="Cursor mode: select and move items"
        variant={mode === 'cursor' ? 'default' : 'ghost'}
        size="icon-lg"
        onClick={() => onModeChange('cursor')}
      >
        <CursorIcon aria-hidden="true" />
      </Button>
      <Button
        aria-label="Navigation mode"
        aria-pressed={mode === 'navigation'}
        title="Navigation mode: click and drag to pan"
        variant={mode === 'navigation' ? 'default' : 'ghost'}
        size="icon-lg"
        onClick={() => onModeChange('navigation')}
      >
        <HandIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
