import {
  CURSOR_EVENTS,
  DEFAULT_CURSOR_ROOM_ID,
  type CursorUser,
} from '@app/shared';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { createCursorSocket, type CursorSocket } from '../../lib/socket';

export type SocketStatus = 'connected' | 'connecting' | 'disconnected';

interface SocketContextValue {
  error?: string;
  socket: CursorSocket;
  status: SocketStatus;
  user?: CursorUser;
}

interface SocketProviderProps extends PropsWithChildren {
  username: string;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export const SocketProvider = ({ children, username }: SocketProviderProps) => {
  const [socket] = useState(() =>
    createCursorSocket(DEFAULT_CURSOR_ROOM_ID, username),
  );
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [error, setError] = useState<string>();
  const [user, setUser] = useState<CursorUser>();

  useEffect(() => {
    const handleConnect = () => {
      setError(undefined);
      setStatus('connected');
    };
    const handleDisconnect = () => {
      setUser(undefined);
      setStatus('disconnected');
    };
    const handleConnectError = (connectionError: Error) => {
      setError(connectionError.message);
      setStatus('disconnected');
    };
    const handleReconnectAttempt = () => {
      setStatus('connecting');
    };
    const handleSession: Parameters<typeof socket.on<'cursor:session'>>[1] = (
      session,
    ) => {
      setUser(session.self);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.on(CURSOR_EVENTS.session, handleSession);
    socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.off(CURSOR_EVENTS.session, handleSession);
      socket.disconnect();
    };
  }, [socket]);

  const value = useMemo(
    () => ({ error, socket, status, user }),
    [error, socket, status, user],
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
