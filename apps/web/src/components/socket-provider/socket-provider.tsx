import {
  CURSOR_EVENTS,
  DEFAULT_CURSOR_ROOM_ID,
  hexColorSchema,
  type CursorUser,
} from '@app/shared';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { createCursorSocket, type CursorSocket } from '../../lib/socket';

export type SocketStatus = 'connected' | 'connecting' | 'disconnected';

const USER_COLOR_UPDATE_DEBOUNCE_MS = 150;

interface SocketContextValue {
  error?: string;
  setUserColor: (color: string) => void;
  socket: CursorSocket;
  status: SocketStatus;
  user?: CursorUser;
}

interface SocketProviderProps extends PropsWithChildren {
  username: string;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export const SocketProvider = ({ children, username }: SocketProviderProps) => {
  const socket = useMemo(
    () => createCursorSocket(DEFAULT_CURSOR_ROOM_ID, username),
    [username],
  );
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [error, setError] = useState<string>();
  const [user, setUser] = useState<CursorUser>();
  const colorUpdateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const setUserColor = useCallback(
    (color: string) => {
      const result = hexColorSchema.safeParse(color);

      if (!result.success) {
        return;
      }

      setUser((currentUser) =>
        currentUser ? { ...currentUser, color: result.data } : currentUser,
      );

      if (colorUpdateTimer.current !== undefined) {
        clearTimeout(colorUpdateTimer.current);
      }

      colorUpdateTimer.current = setTimeout(() => {
        colorUpdateTimer.current = undefined;
        socket.emit(CURSOR_EVENTS.color, { color: result.data });
      }, USER_COLOR_UPDATE_DEBOUNCE_MS);
    },
    [socket],
  );

  useEffect(() => {
    let reconnectOnUserActivity = false;

    setError(undefined);
    setStatus('connecting');
    setUser(undefined);

    const handleConnect = () => {
      reconnectOnUserActivity = false;
      setError(undefined);
      setStatus('connected');
    };
    const handleDisconnect: Parameters<typeof socket.on<'disconnect'>>[1] = (
      reason,
    ) => {
      if (reason !== 'io server disconnect') {
        reconnectOnUserActivity = false;
      }
      setUser(undefined);
      setStatus('disconnected');
    };
    const handleDisconnectNotice: Parameters<
      typeof socket.on<'cursor:disconnect'>
    >[1] = ({ reason }) => {
      reconnectOnUserActivity = reason === 'idle';
    };
    const handleConnectError = (connectionError: Error) => {
      setError(connectionError.message);
      setStatus('disconnected');
    };
    const handleReconnectAttempt = () => {
      setStatus('connecting');
    };
    const handleUserActivity = () => {
      if (!reconnectOnUserActivity) {
        return;
      }

      reconnectOnUserActivity = false;
      setStatus('connecting');
      socket.connect();
    };
    const handleSession: Parameters<typeof socket.on<'cursor:session'>>[1] = (
      session,
    ) => {
      setUser(session.self);
    };
    const handlePresence: Parameters<typeof socket.on<'cursor:presence'>>[1] = (
      nextUser,
    ) => {
      setUser((currentUser) =>
        currentUser?.userId === nextUser.userId ? nextUser : currentUser,
      );
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.on(CURSOR_EVENTS.session, handleSession);
    socket.on(CURSOR_EVENTS.presence, handlePresence);
    socket.on(CURSOR_EVENTS.disconnect, handleDisconnectNotice);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('pointerdown', handleUserActivity, {
      passive: true,
    });
    window.addEventListener('pointermove', handleUserActivity, {
      passive: true,
    });
    socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.off(CURSOR_EVENTS.session, handleSession);
      socket.off(CURSOR_EVENTS.presence, handlePresence);
      socket.off(CURSOR_EVENTS.disconnect, handleDisconnectNotice);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('pointerdown', handleUserActivity);
      window.removeEventListener('pointermove', handleUserActivity);

      if (colorUpdateTimer.current !== undefined) {
        clearTimeout(colorUpdateTimer.current);
        colorUpdateTimer.current = undefined;
      }

      socket.disconnect();
    };
  }, [socket]);

  const value = useMemo(
    () => ({ error, setUserColor, socket, status, user }),
    [error, setUserColor, socket, status, user],
  );

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);

  if (!context) {
    throw new Error('useSocket must be used inside SocketProvider');
  }

  return context;
};
