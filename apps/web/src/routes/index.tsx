import { createFileRoute } from '@tanstack/react-router';
import { ReactFlowProvider, useReactFlow, useViewport } from '@xyflow/react';
import { useCallback, useRef } from 'react';

import { RemoteCursorOverlay } from '../components/remote-cursor-overlay';
import { useSocket } from '../components/socket-provider';
import { InfiniteCanvas } from '../features/canvas/infinite-canvas';
import { constrainCursorPosition } from '../features/cursors/cursor-position';
import { useRemoteCursors } from '../features/cursors/use-remote-cursors';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <ReactFlowProvider>
      <CanvasPage />
    </ReactFlowProvider>
  );
}

function CanvasPage() {
  const surfaceRef = useRef<HTMLElement>(null);
  const { flowToScreenPosition, screenToFlowPosition } = useReactFlow();
  const viewport = useViewport();
  const projectCursorPosition = useCallback(
    (position: { x: number; y: number }) =>
      constrainCursorPosition(screenToFlowPosition(position)),
    [screenToFlowPosition],
  );
  const projectRemotePosition = useCallback(
    (position: { x: number; y: number }) => flowToScreenPosition(position),
    [flowToScreenPosition, viewport.x, viewport.y, viewport.zoom],
  );
  const cursors = useRemoteCursors(surfaceRef, projectCursorPosition);
  const { error, status } = useSocket();

  return (
    <main
      ref={surfaceRef}
      className="relative h-screen w-screen overflow-hidden"
    >
      <InfiniteCanvas />

      {status !== 'connected' && (
        <div
          aria-live="polite"
          className="absolute right-4 bottom-4 z-60 rounded-full bg-slate-900 px-3 py-1.5 text-sm text-white shadow"
          title={error}
        >
          {status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </div>
      )}

      <RemoteCursorOverlay
        cursors={cursors}
        projectPosition={projectRemotePosition}
      />
    </main>
  );
}
