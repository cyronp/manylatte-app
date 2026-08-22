import { createFileRoute } from '@tanstack/react-router';
import { useRef } from 'react';

import { RemoteCursorOverlay } from '../components/remote-cursor-overlay';
import { useSocket } from '../components/socket-provider';
import { useRemoteCursors } from '../features/cursors/use-remote-cursors';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  const surfaceRef = useRef<HTMLElement>(null);
  const cursors = useRemoteCursors(surfaceRef);
  const { error, status } = useSocket();

  return (
    <main
      ref={surfaceRef}
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden"
    >
      <div>
        <h1 className="text-3xl font-bold">ManyLatte</h1>
      </div>

      {status !== 'connected' && (
        <div
          aria-live="polite"
          className="absolute right-4 bottom-4 rounded-full bg-slate-900 px-3 py-1.5 text-sm text-white shadow"
          title={error}
        >
          {status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </div>
      )}

      <RemoteCursorOverlay cursors={cursors} />
    </main>
  );
}
