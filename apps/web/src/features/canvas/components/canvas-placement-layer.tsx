import { ChatIcon, MonitorIcon } from '@phosphor-icons/react';
import {
  ViewportPortal,
  useReactFlow,
  useViewport,
  type XYPosition,
} from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';

import { constrainCursorPosition } from '../../cursors/cursor-position';

export type CanvasPlacement =
  | { action: 'postit' | 'message' | 'screen-share' }
  | { action: 'reaction'; emoji: string; label: string };

interface CanvasPlacementLayerProps {
  placement: CanvasPlacement;
  snapToGrid: boolean;
  onPlace: (position: XYPosition) => void;
  onCancel: () => void;
}

export function CanvasPlacementLayer({
  placement,
  snapToGrid,
  onPlace,
  onCancel,
}: CanvasPlacementLayerProps) {
  const { screenToFlowPosition } = useReactFlow();
  const { zoom } = useViewport();
  const [pointer, setPointer] = useState<XYPosition>();
  const dragStart = useRef<XYPosition>(undefined);
  const toCanvasPosition = (point: XYPosition) =>
    constrainCursorPosition(
      screenToFlowPosition(point, { snapToGrid, snapGrid: [32, 32] }),
    );
  const position = pointer && toCanvasPosition(pointer);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [onCancel]);

  return (
    <>
      <div
        data-canvas-placement-surface
        className="nopan absolute inset-0 z-30 cursor-crosshair"
        onPointerMove={(event) =>
          setPointer({ x: event.clientX, y: event.clientY })
        }
        onPointerLeave={() => setPointer(undefined)}
        onPointerDown={(event) => {
          dragStart.current = { x: event.clientX, y: event.clientY };
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (
            !dragStart.current ||
            Math.hypot(
              event.clientX - dragStart.current.x,
              event.clientY - dragStart.current.y,
            ) > 5
          )
            return;
          const point = toCanvasPosition({
            x: event.clientX,
            y: event.clientY,
          });
          if (point) onPlace(point);
        }}
      ></div>
      {position && (
        <ViewportPortal>
          <div
            aria-hidden="true"
            data-canvas-placement-preview={placement.action}
            className="pointer-events-none absolute z-[1001] opacity-50"
            style={{
              left: position.x,
              top: position.y,
              transform: `translate(-50%, ${placement.action === 'reaction' ? '-50%' : '0'})${placement.action === 'message' ? ` scale(${1 / zoom})` : ''}`,
              transformOrigin: 'top center',
            }}
          >
            {placement.action === 'postit' && (
              <div className="size-64 bg-yellow-200 p-4 text-sm text-black shadow-md">
                Write a note…
              </div>
            )}
            {placement.action === 'reaction' && (
              <div className="rounded-full bg-white py-2 text-5xl leading-none shadow">
                {placement.emoji}
              </div>
            )}
            {placement.action === 'message' && (
              <div className="flex size-9 items-center justify-center rounded-[18px] rounded-bl-none border-2 border-background bg-background text-foreground shadow">
                <ChatIcon className="size-5" />
              </div>
            )}
            {placement.action === 'screen-share' && (
              <div className="w-[480px] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-md">
                <div className="flex items-center gap-2 border-b px-4 py-2 text-xs">
                  <MonitorIcon />
                  Share screen
                </div>
                <div className="flex aspect-video items-center justify-center bg-muted">
                  <MonitorIcon className="size-12" />
                </div>
              </div>
            )}
          </div>
        </ViewportPortal>
      )}
    </>
  );
}
