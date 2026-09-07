import { useEffect, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { Lobby } from '@app/shared';

import { Button } from '../../components/ui/button';
import { loadLobby } from '../../lib/lobby';

export function LobbySession({
  roomId,
  children,
}: {
  roomId: string;
  children: (lobby: Lobby) => ReactNode;
}) {
  const [lobby, setLobby] = useState<Lobby>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(undefined);
    void loadLobby(roomId, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setLobby(result);
      },
      (cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not open this lobby.',
          );
      },
    );
    return () => controller.abort();
  }, [roomId, attempt]);

  if (lobby) return children(lobby);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      {error ? (
        <>
          <h1 className="text-xl font-semibold">Unable to join lobby</h1>
          <p role="alert" className="text-muted-foreground">
            {error}
          </p>
          <div className="flex gap-2">
            <Button onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </Button>
            <Button asChild variant="outline">
              <Link to="/" search={{}}>
                Enter a lobby code
              </Link>
            </Button>
          </div>
        </>
      ) : (
        <p role="status">Opening lobby…</p>
      )}
    </main>
  );
}
