import {
  CURSOR_EVENTS,
  CURSOR_IDLE_TIMEOUT_MS,
  CURSOR_MOVE_INTERVAL_MS,
  type CursorPosition,
  type CursorUpdate,
  type CursorUser,
  type RemoteCursor,
} from '@app/shared';
import { type RefObject, useEffect, useRef, useState } from 'react';

import { useSocket } from '../../components/socket-provider';

interface PointerCoordinates {
  x: number;
  y: number;
}

type ProjectCursorPosition = (
  position: PointerCoordinates,
) => CursorPosition | undefined;

export type RemoteCursorView = RemoteCursor & {
  isInactive: boolean;
};

const CURSOR_INACTIVE_AFTER_MS = CURSOR_IDLE_TIMEOUT_MS / 2;
const CURSOR_ACTIVITY_CHECK_INTERVAL_MS = 1_000;

export const useRemoteCursors = (
  surfaceRef: RefObject<HTMLElement | null>,
  projectCursorPosition: ProjectCursorPosition,
) => {
  const { socket } = useSocket();
  const [cursors, setCursors] = useState<RemoteCursorView[]>([]);
  const sequenceRef = useRef(0);

  useEffect(() => {
    const cursorMap = new Map<string, RemoteCursorView>();
    const userMap = new Map<string, CursorUser>();
    let renderFrame: number | undefined;
    let selfUserId: string | undefined;

    const scheduleRender = () => {
      if (renderFrame !== undefined) {
        return;
      }

      renderFrame = window.requestAnimationFrame(() => {
        renderFrame = undefined;
        setCursors(Array.from(cursorMap.values()));
      });
    };

    const clearCursor = (userId: string) => {
      if (cursorMap.delete(userId)) {
        scheduleRender();
      }
    };

    const applyCursor = (cursor: CursorUpdate | RemoteCursor) => {
      if (cursor.userId === selfUserId) {
        return;
      }

      const currentCursor = cursorMap.get(cursor.userId);
      const username =
        'username' in cursor
          ? cursor.username
          : userMap.get(cursor.userId)?.username;

      if (
        !username ||
        (currentCursor && cursor.sequence <= currentCursor.sequence)
      ) {
        return;
      }

      cursorMap.set(cursor.userId, {
        ...cursor,
        isInactive: false,
        username,
      });
      scheduleRender();
    };

    const handleSession: Parameters<typeof socket.on<'cursor:session'>>[1] = (
      session,
    ) => {
      selfUserId = session.self.userId;
      cursorMap.clear();
      userMap.clear();
      session.users.forEach((user) => userMap.set(user.userId, user));
      session.cursors.forEach((cursor) => {
        applyCursor(cursor);
      });
      scheduleRender();
    };

    const handlePresence: Parameters<typeof socket.on<'cursor:presence'>>[1] = (
      user,
    ) => {
      userMap.set(user.userId, user);
      const currentCursor = cursorMap.get(user.userId);

      if (currentCursor) {
        cursorMap.set(user.userId, {
          ...currentCursor,
          color: user.color,
          username: user.username,
        });
        scheduleRender();
      }
    };

    const handleBatch: Parameters<typeof socket.on<'cursor:batch'>>[1] = (
      batch,
    ) => {
      batch.cursors.forEach((cursor) => applyCursor(cursor));
    };

    const handleRemoval: Parameters<typeof socket.on<'cursor:remove'>>[1] = ({
      reason,
      userId,
    }) => {
      if (reason === 'disconnect') {
        userMap.delete(userId);
      }
      clearCursor(userId);
    };

    const resetCursors = () => {
      selfUserId = undefined;
      cursorMap.clear();
      userMap.clear();
      scheduleRender();
    };

    const activityTimer = window.setInterval(() => {
      const currentTime = Date.now();
      let activityChanged = false;

      cursorMap.forEach((cursor, userId) => {
        const isInactive =
          currentTime - cursor.updatedAt >= CURSOR_INACTIVE_AFTER_MS;

        if (cursor.isInactive === isInactive) {
          return;
        }

        cursorMap.set(userId, { ...cursor, isInactive });
        activityChanged = true;
      });

      if (activityChanged) {
        scheduleRender();
      }
    }, CURSOR_ACTIVITY_CHECK_INTERVAL_MS);

    socket.on(CURSOR_EVENTS.session, handleSession);
    socket.on(CURSOR_EVENTS.batch, handleBatch);
    socket.on(CURSOR_EVENTS.presence, handlePresence);
    socket.on(CURSOR_EVENTS.remove, handleRemoval);
    socket.on('disconnect', resetCursors);

    return () => {
      socket.off(CURSOR_EVENTS.session, handleSession);
      socket.off(CURSOR_EVENTS.batch, handleBatch);
      socket.off(CURSOR_EVENTS.presence, handlePresence);
      socket.off(CURSOR_EVENTS.remove, handleRemoval);
      socket.off('disconnect', resetCursors);
      window.clearInterval(activityTimer);

      if (renderFrame !== undefined) {
        window.cancelAnimationFrame(renderFrame);
      }
    };
  }, [socket]);

  useEffect(() => {
    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    let pendingPosition: CursorPosition | undefined;
    let moveTimer: number | undefined;

    const nextSequence = () => {
      const sequence = sequenceRef.current;
      sequenceRef.current += 1;
      return sequence;
    };

    const getPosition = (event: PointerEvent) =>
      projectCursorPosition({ x: event.clientX, y: event.clientY });

    const flushMove = () => {
      moveTimer = undefined;

      if (!pendingPosition) {
        return;
      }

      const position = pendingPosition;
      pendingPosition = undefined;

      if (socket.connected) {
        socket.volatile.emit(CURSOR_EVENTS.move, {
          ...position,
          sequence: nextSequence(),
        });
      }

      moveTimer = window.setTimeout(flushMove, CURSOR_MOVE_INTERVAL_MS);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!event.isPrimary) {
        return;
      }

      pendingPosition = getPosition(event);

      if (pendingPosition && moveTimer === undefined) {
        flushMove();
      }
    };

    surface.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    });

    return () => {
      surface.removeEventListener('pointermove', handlePointerMove);

      if (moveTimer !== undefined) {
        window.clearTimeout(moveTimer);
      }
    };
  }, [projectCursorPosition, socket, surfaceRef]);

  return cursors;
};
