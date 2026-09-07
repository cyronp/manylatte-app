import { CursorIcon } from '@phosphor-icons/react';
import { useEffect, useRef } from 'react';

const COFFEE_CURSORS = [
  { name: 'Espresso', color: '#193CB8', x: 15, y: 20, duration: 2800 },
  { name: 'Cappuccino', color: '#e11d48', x: 80, y: 30, duration: 3400 },
  { name: 'Mocha', color: '#059669', x: 65, y: 85, duration: 3100 },
  { name: 'Latte', color: '#7c3aed', x: 95, y: 45, duration: 3100 },
  { name: 'Frappuccino', color: '#d97706', x: 100, y: 25, duration: 3100 },
];

export function DecorativeCursors() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const cursorRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const positions = COFFEE_CURSORS.map(({ x, y }) => ({ x, y }));
    let width = surface.clientWidth;
    let height = surface.clientHeight;

    const updateTransform = (index: number) => {
      const node = cursorRefs.current[index];
      const position = positions[index];
      const anchor = COFFEE_CURSORS[index];
      if (!node || !position || !anchor) return;

      const x = ((position.x - anchor.x) / 100) * width;
      const y = ((position.y - anchor.y) / 100) * height;
      node.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return;
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      positions.forEach((_, index) => updateTransform(index));
    });
    resizeObserver.observe(surface);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timers: number[] = [];

    const syncMotion = () => {
      timers.forEach((timer) => window.clearInterval(timer));
      timers = [];
      if (reducedMotion.matches || document.hidden) return;

      timers = COFFEE_CURSORS.map((cursor, index) =>
        window.setInterval(() => {
          positions[index] = { x: Math.random() * 100, y: Math.random() * 100 };
          updateTransform(index);
        }, cursor.duration + 1000),
      );
    };

    syncMotion();
    reducedMotion.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncMotion);

    return () => {
      timers.forEach((timer) => window.clearInterval(timer));
      resizeObserver.disconnect();
      reducedMotion.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncMotion);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      <div
        ref={surfaceRef}
        className="absolute bottom-16 left-4 right-28 top-4"
      >
        {COFFEE_CURSORS.map((cursor, index) => (
          <div
            key={cursor.name}
            ref={(node) => {
              cursorRefs.current[index] = node;
            }}
            className="absolute transition-transform ease-in-out motion-reduce:transition-none"
            style={{
              left: `${cursor.x}%`,
              top: `${cursor.y}%`,
              transitionDuration: `${cursor.duration}ms`,
              color: cursor.color,
            }}
          >
            <CursorIcon size={28} weight="duotone" />
            <span
              className="mt-0.5 block w-max rounded-full px-1.5 text-xs font-medium text-white"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
