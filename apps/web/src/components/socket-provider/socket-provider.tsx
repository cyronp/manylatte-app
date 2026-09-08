import {
  CANVAS_EVENTS,
  CURSOR_EVENTS,
  type CursorRoomId,
  hexColorSchema,
  type CursorUser,
  type CanvasCommandBody,
  type CanvasCommandResult,
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

import {
  bindSocketLifecycle,
  type SocketStatus,
} from '../../lib/socket-lifecycle';
import { createCommandQueue } from '../../lib/canvas-commands';
export type { SocketStatus } from '../../lib/socket-lifecycle';

const USER_COLOR_UPDATE_DEBOUNCE_MS = 150;

interface SocketContextValue {
  error?: string;
  execute: (
    body: CanvasCommandBody,
    operationId?: string,
  ) => Promise<CanvasCommandResult>;
  retryConnect: () => void;
  setUserColor: (color: string) => void;
  socket: CursorSocket;
  status: SocketStatus;
  user?: CursorUser;
  users: CursorUser[];
}

interface SocketProviderProps extends PropsWithChildren {
  roomId: CursorRoomId;
  username: string;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export const SocketProvider = ({
  children,
  roomId,
  username,
}: SocketProviderProps) => {
  const socket = useMemo(
    () => createCursorSocket(roomId, username),
    [roomId, username],
  );
  const readyRef = useRef(false);
  const commands = useMemo(() => createCommandQueue(socket, () => readyRef.current), [socket]);
  const retryRef = useRef<() => void>(() => socket.connect());
  const retryConnect = useCallback(() => retryRef.current(), []);
  const execute = useCallback(
    async (
      body: CanvasCommandBody,
      operationId: string = crypto.randomUUID(),
    ) => {
      const result = await commands.send({
        id: operationId,
        body,
      });
      setError(result.ok ? undefined : result.message);
      return result;
    },
    [commands],
  );
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [error, setError] = useState<string>();
  const [user, setUser] = useState<CursorUser>();
  const [users, setUsers] = useState<CursorUser[]>([]);
  const colorUpdateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const setUserColor = useCallback(
    (color: string) => {
      const result = hexColorSchema.safeParse(color);

      if (!result.success) {
        return;
      }

      try {
        localStorage.setItem('manylatte:color', result.data);
      } catch {
        /* Storage is optional. */
      }
      setUser((currentUser) =>
        currentUser ? { ...currentUser, color: result.data } : currentUser,
      );
      setUsers((currentUsers) =>
        currentUsers.map((currentUser) =>
          currentUser.userId === user?.userId
            ? { ...currentUser, color: result.data }
            : currentUser,
        ),
      );

      if (colorUpdateTimer.current !== undefined) {
        clearTimeout(colorUpdateTimer.current);
      }

      colorUpdateTimer.current = setTimeout(() => {
        colorUpdateTimer.current = undefined;
        if (readyRef.current && socket.connected)
          socket.emit(CURSOR_EVENTS.color, { color: result.data });
      }, USER_COLOR_UPDATE_DEBOUNCE_MS);
    },
    [socket, user?.userId],
  );

  useEffect(() => {
    const lifecycle = bindSocketLifecycle(
      socket,
      (nextStatus, nextError) => {
        setStatus(nextStatus);
        setError(nextError);
      },
      (ready) => {
        readyRef.current = ready;
      if (!ready) commands.clear();
      },
    );
    retryRef.current = lifecycle.retry;

    setError(undefined);
    setStatus('connecting');
    setUser(undefined);
    setUsers([]);

    const handleDisconnect = () => {
      setUser(undefined);
      setUsers([]);
    };
    const handleCanvasError = ({ message }: { message: string }) =>
      setError(message);
    const handleSession: Parameters<typeof socket.on<'cursor:session'>>[1] = (
      session,
    ) => {
      setUser(session.self);
      setUsers(session.users);
      try {
        const color = hexColorSchema.safeParse(
          localStorage.getItem('manylatte:color'),
        );
        if (color.success && socket.connected)
          socket.emit(CURSOR_EVENTS.color, { color: color.data });
      } catch {
        /* Storage is optional. */
      }
    };
    const handlePresence: Parameters<typeof socket.on<'cursor:presence'>>[1] = (
      nextUser,
    ) => {
      setUser((currentUser) =>
        currentUser?.userId === nextUser.userId ? nextUser : currentUser,
      );
      setUsers((currentUsers) => {
        const userIndex = currentUsers.findIndex(
          ({ userId }) => userId === nextUser.userId,
        );

        if (userIndex === -1) {
          return [...currentUsers, nextUser];
        }

        return currentUsers.map((currentUser, index) =>
          index === userIndex ? nextUser : currentUser,
        );
      });
    };
    const handleRemoval: Parameters<typeof socket.on<'cursor:remove'>>[1] = ({
      reason,
      userId,
    }) => {
      if (reason === 'idle') {
        return;
      }

      setUsers((currentUsers) =>
        currentUsers.filter((currentUser) => currentUser.userId !== userId),
      );
    };
    socket.on(CANVAS_EVENTS.error, handleCanvasError);
    socket.on('disconnect', handleDisconnect);
    socket.on(CURSOR_EVENTS.session, handleSession);
    socket.on(CURSOR_EVENTS.presence, handlePresence);
    socket.on(CURSOR_EVENTS.remove, handleRemoval);
    socket.connect();

    return () => {
      lifecycle.dispose();
      socket.off(CANVAS_EVENTS.error, handleCanvasError);
      socket.off('disconnect', handleDisconnect);
      socket.off(CURSOR_EVENTS.session, handleSession);
      socket.off(CURSOR_EVENTS.presence, handlePresence);
      socket.off(CURSOR_EVENTS.remove, handleRemoval);

      if (colorUpdateTimer.current !== undefined) {
        clearTimeout(colorUpdateTimer.current);
        colorUpdateTimer.current = undefined;
      }

      socket.disconnect();
    };
  }, [socket, commands]);

  const value = useMemo(
    () => ({
      error,
      execute,
      retryConnect,
      setUserColor,
      socket,
      status,
      user,
      users,
    }),
    [error, execute, retryConnect, setUserColor, socket, status, user, users],
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
