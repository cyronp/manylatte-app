import {
  CANVAS_HEIGHT,
  CANVAS_REGION_HEIGHT,
  CANVAS_REGION_WIDTH,
  CANVAS_WIDTH,
} from '@app/shared';
import {
  ReactFlow,
  type CoordinateExtent,
  type ReactFlowInstance,
  ViewportPortal,
} from '@xyflow/react';
import { useCallback } from 'react';

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;

const CANVAS_EXTENT: CoordinateExtent = [
  [0, 0],
  [CANVAS_WIDTH, CANVAS_HEIGHT],
];

const FIRST_REGION_BOUNDS = {
  height: CANVAS_REGION_HEIGHT,
  width: CANVAS_REGION_WIDTH,
  x: 0,
  y: 0,
};

const CanvasSurface = () => (
  <ViewportPortal>
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 overflow-hidden bg-white shadow-2xl outline-2 outline-slate-400/70"
      data-canvas-height={CANVAS_HEIGHT}
      data-canvas-width={CANVAS_WIDTH}
      style={{
        backgroundImage:
          'radial-gradient(circle, rgb(148 163 184 / 0.55) 1.5px, transparent 1.5px)',
        backgroundSize: '32px 32px',
        height: CANVAS_HEIGHT,
        width: CANVAS_WIDTH,
      }}
    />
  </ViewportPortal>
);

export const InfiniteCanvas = () => {
  const handleInit = useCallback((instance: ReactFlowInstance) => {
    void instance.fitBounds(FIRST_REGION_BOUNDS, { padding: 0.02 });
  }, []);

  return (
    <ReactFlow
      aria-label="ManyLatte canvas"
      className="bg-slate-200"
      maxZoom={MAX_ZOOM}
      minZoom={MIN_ZOOM}
      nodeExtent={CANVAS_EXTENT}
      nodesConnectable={false}
      nodesDraggable={false}
      elementsSelectable={false}
      onInit={handleInit}
      panActivationKeyCode="Space"
      panOnDrag={[1]}
      proOptions={{ hideAttribution: true }}
      translateExtent={CANVAS_EXTENT}
      zoomOnDoubleClick={false}
    >
      <CanvasSurface />
    </ReactFlow>
  );
};
