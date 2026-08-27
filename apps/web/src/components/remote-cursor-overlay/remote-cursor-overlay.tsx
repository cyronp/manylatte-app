import type { XYPosition } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';

import type { RemoteCursorView } from '../../features/cursors/use-remote-cursors';
import { RemoteCursor, type SurfaceSize } from '../remote-cursor';

interface RemoteCursorOverlayProps {
  cursors: RemoteCursorView[];
  projectPosition: (position: XYPosition) => XYPosition;
}

interface SurfaceBounds extends SurfaceSize {
  left: number;
  top: number;
}

export const RemoteCursorOverlay = ({
  cursors,
  projectPosition,
}: RemoteCursorOverlayProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [surfaceBounds, setSurfaceBounds] = useState<SurfaceBounds>({
    height: 0,
    left: 0,
    top: 0,
    width: 0,
  });

  useEffect(() => {
    const overlay = overlayRef.current;

    if (!overlay) {
      return;
    }

    const updateSize = () => {
      const bounds = overlay.getBoundingClientRect();

      setSurfaceBounds({
        height: bounds.height,
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
      });
    };
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(overlay);
    updateSize();

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-50 overflow-hidden"
    >
      {surfaceBounds.width > 0 &&
        surfaceBounds.height > 0 &&
        cursors.map((cursor) => {
          const screenPosition = projectPosition(cursor);

          return (
            <RemoteCursor
              key={cursor.userId}
              cursor={cursor}
              position={{
                x: screenPosition.x - surfaceBounds.left,
                y: screenPosition.y - surfaceBounds.top,
              }}
              surfaceSize={surfaceBounds}
            />
          );
        })}
    </div>
  );
};
