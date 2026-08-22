import { CursorClickIcon, CursorIcon } from '@phosphor-icons/react';
import { memo, useLayoutEffect, useRef } from 'react';

import type { RemoteCursorView } from '../../features/cursors/use-remote-cursors';

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
  const animationFrameRef = useRef<number | undefined>(undefined);
  const currentPositionRef = useRef({
    x: cursor.x * surfaceSize.width,
    y: cursor.y * surfaceSize.height,
  });

  useLayoutEffect(() => {
    const node = nodeRef.current;

    if (!node) {
      return;
    }

    const target = {
      x: cursor.x * surfaceSize.width,
      y: cursor.y * surfaceSize.height,
    };
    let previousTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = Math.min(64, currentTime - previousTime);
      const interpolation = 1 - Math.exp(-elapsed / 45);
      const current = currentPositionRef.current;
      current.x += (target.x - current.x) * interpolation;
      current.y += (target.y - current.y) * interpolation;
      previousTime = currentTime;
      node.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`;

      if (
        Math.abs(target.x - current.x) > 0.1 ||
        Math.abs(target.y - current.y) > 0.1
      ) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      currentPositionRef.current = target;
      node.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`;
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
  }, [cursor.x, cursor.y, surfaceSize.height, surfaceSize.width]);

  const Icon = cursor.isClicking ? CursorClickIcon : CursorIcon;

  return (
    <div
      ref={nodeRef}
      className="flex absolute flex-col left-0 top-0 will-change-transform justify-center gap-0.5"
      style={{
        transform: `translate3d(${currentPositionRef.current.x}px, ${currentPositionRef.current.y}px, 0)`,
      }}
    >
      <Icon color={cursor.color} size={28} weight="duotone" />
      <div
        className="flex h-fit max-w-48 justify-center rounded-full px-1.5 text-white truncate"
        role="tooltip"
        style={{ backgroundColor: cursor.color }}
      >
        <span className="truncate text-xs font-medium">{cursor.username}</span>
      </div>
    </div>
  );
});
