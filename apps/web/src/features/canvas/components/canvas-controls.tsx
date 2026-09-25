import { MinusIcon, PlusIcon } from 'lucide-react';
import { useReactFlow } from '@xyflow/react';

import { Button } from '@/components/ui/button';

const VIEWPORT_ANIMATION_DURATION_MS = 200;

export const CanvasControls = () => {
  const { zoomIn, zoomOut } = useReactFlow();
  const animationOptions = { duration: VIEWPORT_ANIMATION_DURATION_MS };

  return (
    <div
      aria-label="Canvas controls"
      className="absolute right-4 bottom-20 z-40 flex items-stretch overflow-hidden rounded-full border border-border bg-popover/95 text-popover-foreground shadow-lg backdrop-blur-sm sm:bottom-4"
      role="toolbar"
    >
      <Button
        aria-label="Zoom out"
        className="rounded-none"
        onClick={() => void zoomOut(animationOptions)}
        size="icon"
        title="Zoom out"
        variant="ghost"
      >
        <MinusIcon />
      </Button>
      <Button
        aria-label="Zoom in"
        className="rounded-none border-l-border"
        onClick={() => void zoomIn(animationOptions)}
        size="icon"
        title="Zoom in"
        variant="ghost"
      >
        <PlusIcon />
      </Button>
    </div>
  );
};
