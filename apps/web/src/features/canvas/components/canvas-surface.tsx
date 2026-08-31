import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@app/shared';
import { ViewportPortal } from '@xyflow/react';

export const CanvasSurface = () => (
  <ViewportPortal>
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 overflow-hidden bg-canvas-background outline-2 outline-canvas-border"
      data-canvas-height={CANVAS_HEIGHT}
      data-canvas-width={CANVAS_WIDTH}
      style={{
        backgroundImage:
          'radial-gradient(circle, var(--canvas-grid) 1.5px, transparent 1.5px)',
        backgroundSize: '32px 32px',
        height: CANVAS_HEIGHT,
        width: CANVAS_WIDTH,
        zIndex: -1,
      }}
    />
  </ViewportPortal>
);
