import { useEffect, useRef, useState } from 'react';

import type { RemoteCursorView } from '../../features/cursors/use-remote-cursors';
import { RemoteCursor, type SurfaceSize } from '../remote-cursor';

interface RemoteCursorOverlayProps {
  cursors: RemoteCursorView[];
}

export const RemoteCursorOverlay = ({ cursors }: RemoteCursorOverlayProps) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [surfaceSize, setSurfaceSize] = useState<SurfaceSize>({
    height: 0,
    width: 0,
  });

  useEffect(() => {
    const overlay = overlayRef.current;

    if (!overlay) {
      return;
    }

    const updateSize = () => {
      setSurfaceSize({
        height: overlay.clientHeight,
        width: overlay.clientWidth,
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
      {surfaceSize.width > 0 &&
        surfaceSize.height > 0 &&
        cursors.map((cursor) => (
          <RemoteCursor
            key={cursor.userId}
            cursor={cursor}
            surfaceSize={surfaceSize}
          />
        ))}
    </div>
  );
};
