import { DEFAULT_CURSOR_ROOM_ID } from '@app/shared';
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

  useEffect(() => {
    const handleConnect = () => {
      setError(undefined);
      setStatus('connected');
    };
    const handleDisconnect = () => {
      setStatus('disconnected');
    };
    const handleConnectError = (connectionError: Error) => {
      setError(connectionError.message);
      setStatus('disconnected');
    };
    const handleReconnectAttempt = () => {
      setStatus('connecting');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.disconnect();
    };
  }, [socket]);

  const value = useMemo(
    () => ({ error, socket, status }),
    [error, socket, status],
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
