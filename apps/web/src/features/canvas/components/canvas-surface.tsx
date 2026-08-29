import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@app/shared';
import { ViewportPortal } from '@xyflow/react';

export const CanvasSurface = () => (
  <ViewportPortal>
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 overflow-hidden bg-white outline-2 outline-slate-400/70"
      data-canvas-height={CANVAS_HEIGHT}
      data-canvas-width={CANVAS_WIDTH}
      style={{
        backgroundImage:
          'radial-gradient(circle, rgb(148 163 184 / 0.55) 1.5px, transparent 1.5px)',
        backgroundSize: '32px 32px',
        height: CANVAS_HEIGHT,
        width: CANVAS_WIDTH,
        zIndex: -1,
      }}
    />
  </ViewportPortal>
);
