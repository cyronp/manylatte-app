import {
  MessageCircleIcon,
  MousePointer2Icon,
  HandIcon,
  MonitorIcon,
  SmilePlusIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { XYPosition } from '@xyflow/react';

export type CanvasMode = 'cursor' | 'navigation';
export type CanvasAction = 'screen-share' | 'postit' | 'reaction' | 'message';

function PostitDockIcon() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none relative size-7 rounded-xs rounded-br-lg bg-yellow-200 shadow-sm shadow-black/20 transition-[translate,rotate,box-shadow] duration-350 ease-in-out group-hover/button:shadow-md group-hover/button:shadow-black/20 motion-safe:group-hover/button:-translate-y-1.5 motion-safe:group-hover/button:-rotate-6 motion-safe:group-focus-visible/button:-translate-y-1.5 motion-safe:group-focus-visible/button:-rotate-6"
    >
      <span className="absolute right-0 bottom-0 size-2 rounded-tl-xs rounded-br-lg bg-yellow-300" />
    </span>
  );
}

const ACTIONS = [
  { action: 'postit', label: 'Add Post-it', icon: PostitDockIcon },
  { action: 'screen-share', label: 'Share screen', icon: MonitorIcon },
  { action: 'reaction', label: 'Add reaction', icon: SmilePlusIcon },
  { action: 'message', label: 'Add message', icon: MessageCircleIcon },
] as const;

interface CanvasDockProps {
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
  onAction: (action: CanvasAction, anchor: XYPosition) => void;
  activeAction?: CanvasAction;
  disabled: boolean;
  screenShareDisabled: boolean;
}

export function CanvasDock({
  mode,
  onModeChange,
  onAction,
  activeAction,
  disabled,
  screenShareDisabled,
}: CanvasDockProps) {
  return (
    <div
      aria-label="Canvas tools"
      role="group"
      className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-popover/95 p-1 text-popover-foreground shadow-lg backdrop-blur-sm"
    >
      <Button
        aria-label="Cursor mode"
        aria-pressed={mode === 'cursor' && !activeAction}
        title="Cursor mode: select and move items"
        variant={mode === 'cursor' && !activeAction ? 'default' : 'ghost'}
        size="icon-lg"
        onClick={() => onModeChange('cursor')}
      >
        <MousePointer2Icon aria-hidden="true" />
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
      <Separator orientation="vertical" className="mx-1 my-2" />
      {ACTIONS.map(({ action, label, icon: Icon }) => (
        <Button
          key={action}
          aria-label={label}
          title={label}
          variant={activeAction === action ? 'default' : 'ghost'}
          aria-pressed={activeAction === action}
          size="icon-lg"
          disabled={
            disabled || (action === 'screen-share' && screenShareDisabled)
          }
          onClick={(event) =>
            onAction(action, { x: event.clientX, y: event.clientY })
          }
        >
          <Icon aria-hidden="true" />
        </Button>
      ))}
    </div>
  );
}
