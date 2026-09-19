import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/components/socket-provider';
import {
  initialScreenShareState,
  ScreenShareSession,
} from './screen-share-session';

export function useScreenShare() {
  const { socket } = useSocket();
  const [state, setState] = useState(initialScreenShareState);
  const session = useRef<ScreenShareSession | undefined>(undefined);
  useEffect(() => {
    const current = new ScreenShareSession(socket, setState);
    session.current = current;
    return () => {
      current.dispose();
      session.current = undefined;
    };
  }, [socket]);
  const start = useCallback((position: { x: number; y: number }) => {
    void session.current?.start(position);
  }, []);
  const stop = useCallback(() => session.current?.stop(), []);
  const changeScreen = useCallback(() => {
    void session.current?.changeScreen();
  }, []);
  const watch = useCallback(() => {
    void session.current?.watch();
  }, []);
  const unwatch = useCallback(() => session.current?.unwatch(), []);
  const move = useCallback(
    (shareId: string, position: { x: number; y: number }) => {
      if (socket.connected) socket.emit('screen:move', { shareId, position });
    },
    [socket],
  );
  return { ...state, start, stop, changeScreen, watch, unwatch, move };
}
