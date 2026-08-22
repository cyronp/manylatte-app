import {
  CURSOR_CLICK_DURATION_MS,
  CURSOR_EVENTS,
  CURSOR_MOVE_INTERVAL_MS,
  type CursorPosition,
  type CursorUpdate,
  type CursorUser,
  type RemoteCursor,
} from '@app/shared';
import { type RefObject, useEffect, useRef, useState } from 'react';

import { useSocket } from '../../components/socket-provider';
import { normalizeCursorPosition } from './cursor-position';

export type RemoteCursorView = RemoteCursor & {
  isClicking: boolean;
};

export const useRemoteCursors = (surfaceRef: RefObject<HTMLElement | null>) => {
  const { socket } = useSocket();
  const [cursors, setCursors] = useState<RemoteCursorView[]>([]);
  const sequenceRef = useRef(0);

  useEffect(() => {
    const cursorMap = new Map<string, RemoteCursorView>();
    const userMap = new Map<string, CursorUser>();
    const clickTimers = new Map<string, number>();
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
      const clickTimer = clickTimers.get(userId);

      if (clickTimer !== undefined) {
        window.clearTimeout(clickTimer);
        clickTimers.delete(userId);
      }

      if (cursorMap.delete(userId)) {
        scheduleRender();
      }
    };

    const applyCursor = (
      cursor: CursorUpdate | RemoteCursor,
      isClicking = false,
    ) => {
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
        isClicking: isClicking || currentCursor?.isClicking === true,
        username,
      });
      scheduleRender();
    };

    const handleSession: Parameters<typeof socket.on<'cursor:session'>>[1] = (
      session,
    ) => {
      selfUserId = session.self.userId;
      clickTimers.forEach((timer) => window.clearTimeout(timer));
      clickTimers.clear();
      cursorMap.clear();
      userMap.clear();
      userMap.set(session.self.userId, session.self);
      session.cursors.forEach((cursor) => {
        userMap.set(cursor.userId, cursor);
        applyCursor(cursor);
      });
      scheduleRender();
    };

    const handlePresence: Parameters<typeof socket.on<'cursor:presence'>>[1] = (
      user,
    ) => {
      userMap.set(user.userId, user);
    };

    const handleBatch: Parameters<typeof socket.on<'cursor:batch'>>[1] = (
      batch,
    ) => {
      batch.cursors.forEach((cursor) => applyCursor(cursor));
    };

    const handleClick: Parameters<typeof socket.on<'cursor:click'>>[1] = (
      cursor,
    ) => {
      const activeTimer = clickTimers.get(cursor.userId);

      if (activeTimer !== undefined) {
        window.clearTimeout(activeTimer);
      }

      applyCursor(cursor, true);
      clickTimers.set(
        cursor.userId,
        window.setTimeout(() => {
          clickTimers.delete(cursor.userId);
          const currentCursor = cursorMap.get(cursor.userId);

          if (!currentCursor) {
            return;
          }

          cursorMap.set(cursor.userId, {
            ...currentCursor,
            isClicking: false,
          });
          scheduleRender();
        }, CURSOR_CLICK_DURATION_MS),
      );
    };

    const handleRemoval: Parameters<typeof socket.on<'cursor:remove'>>[1] = ({
      userId,
    }) => {
      userMap.delete(userId);
      clearCursor(userId);
    };

    const resetCursors = () => {
      selfUserId = undefined;
      clickTimers.forEach((timer) => window.clearTimeout(timer));
      clickTimers.clear();
      cursorMap.clear();
      userMap.clear();
      scheduleRender();
    };

    socket.on(CURSOR_EVENTS.session, handleSession);
    socket.on(CURSOR_EVENTS.batch, handleBatch);
    socket.on(CURSOR_EVENTS.click, handleClick);
    socket.on(CURSOR_EVENTS.presence, handlePresence);
    socket.on(CURSOR_EVENTS.remove, handleRemoval);
    socket.on('disconnect', resetCursors);

    return () => {
      socket.off(CURSOR_EVENTS.session, handleSession);
      socket.off(CURSOR_EVENTS.batch, handleBatch);
      socket.off(CURSOR_EVENTS.click, handleClick);
      socket.off(CURSOR_EVENTS.presence, handlePresence);
      socket.off(CURSOR_EVENTS.remove, handleRemoval);
      socket.off('disconnect', resetCursors);
      clickTimers.forEach((timer) => window.clearTimeout(timer));

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
      normalizeCursorPosition(event, surface.getBoundingClientRect());

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

    const handlePointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || !socket.connected) {
        return;
      }

      const position = getPosition(event);

      if (!position) {
        return;
      }

      socket.volatile.emit(CURSOR_EVENTS.click, {
        ...position,
        sequence: nextSequence(),
      });
    };

    surface.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    });
    surface.addEventListener('pointerdown', handlePointerDown, {
      passive: true,
    });

    return () => {
      surface.removeEventListener('pointermove', handlePointerMove);
      surface.removeEventListener('pointerdown', handlePointerDown);

      if (moveTimer !== undefined) {
        window.clearTimeout(moveTimer);
      }
    };
  }, [socket, surfaceRef]);

  return cursors;
};
