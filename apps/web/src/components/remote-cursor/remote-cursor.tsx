import { CursorClickIcon, CursorIcon } from '@phosphor-icons/react';
import { memo, useLayoutEffect, useRef } from 'react';

import type { RemoteCursorView } from '../../features/cursors/use-remote-cursors';
import { getCursorLabelPosition } from '../../features/cursors/cursor-label-position';

export interface SurfaceSize {
  height: number;
  width: number;
}

interface RemoteCursorProps {
  cursor: RemoteCursorView;
  surfaceSize: SurfaceSize;
}

export const RemoteCursor = memo(function RemoteCursor({
  cursor,
  surfaceSize,
}: RemoteCursorProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const currentPositionRef = useRef({
    x: cursor.x * surfaceSize.width,
    y: cursor.y * surfaceSize.height,
  });

  useLayoutEffect(() => {
    const node = nodeRef.current;
    const label = labelRef.current;

    if (!node || !label) {
      return;
    }

    const target = {
      x: cursor.x * surfaceSize.width,
      y: cursor.y * surfaceSize.height,
    };
    let previousTime = performance.now();

    const positionLabel = (anchorX: number, anchorY: number) => {
      const position = getCursorLabelPosition({
        anchorX,
        anchorY,
        labelHeight: label.offsetHeight,
        labelWidth: label.offsetWidth,
        surfaceHeight: surfaceSize.height,
        surfaceWidth: surfaceSize.width,
      });
      label.style.transform = `translate3d(${position.left}px, ${position.top}px, 0)`;
    };

    positionLabel(currentPositionRef.current.x, currentPositionRef.current.y);

    const animate = (currentTime: number) => {
      const elapsed = Math.min(64, currentTime - previousTime);
      const interpolation = 1 - Math.exp(-elapsed / 45);
      const current = currentPositionRef.current;
      current.x += (target.x - current.x) * interpolation;
      current.y += (target.y - current.y) * interpolation;
      previousTime = currentTime;
      node.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`;
      positionLabel(current.x, current.y);

      if (
        Math.abs(target.x - current.x) > 0.1 ||
        Math.abs(target.y - current.y) > 0.1
      ) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      currentPositionRef.current = target;
      node.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`;
      positionLabel(target.x, target.y);
      animationFrameRef.current = undefined;
    };

    if (animationFrameRef.current !== undefined) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== undefined) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    cursor.username,
    cursor.x,
    cursor.y,
    surfaceSize.height,
    surfaceSize.width,
  ]);

  const Icon = cursor.isClicking ? CursorClickIcon : CursorIcon;

  return (
    <div
      ref={nodeRef}
      className="absolute left-0 top-0 will-change-transform"
      style={{
        transform: `translate3d(${currentPositionRef.current.x}px, ${currentPositionRef.current.y}px, 0)`,
      }}
    >
      <Icon color={cursor.color} size={28} weight="duotone" />
      <div
        ref={labelRef}
        className="absolute left-0 top-0 flex h-fit max-w-48 justify-center truncate rounded-full px-1.5 text-white will-change-transform"
        role="tooltip"
        style={{
          backgroundColor: cursor.color,
          maxWidth: Math.min(192, surfaceSize.width),
        }}
      >
        <span className="truncate text-xs font-medium">{cursor.username}</span>
      </div>
    </div>
  );
});
