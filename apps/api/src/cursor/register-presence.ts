import {
  CANVAS_EVENTS,
  CURSOR_EVENTS,
  cursorColorInputSchema,
  type CursorInput,
  type CursorUpdate,
  type RemoteCursor,
} from '@app/shared';
import type {
  CursorIo,
  CursorSocket,
  CursorRoom,
  Participant,
} from './cursor-types.js';
import type { TokenBucket } from './token-bucket.js';
export function registerPresence(
  io: CursorIo,
  socket: CursorSocket,
  room: CursorRoom,
  participant: Participant,
  now: () => number,
  acceptMessageBudget: (event: string) => number | undefined,
  recordViolation: (reason: string, issueCodes?: string[]) => void,
  acceptCursorInput: (
    input: unknown,
    limiter: TokenBucket,
    event: string,
  ) => CursorInput | undefined,
) {
  const roomId = socket.data.cursorRoomId;
  socket.on(CURSOR_EVENTS.color, (input) => {
    const acceptedAt = acceptMessageBudget(CURSOR_EVENTS.color);

    if (acceptedAt === undefined) {
      return;
    }

    const result = cursorColorInputSchema.safeParse(input);

    if (!result.success) {
      recordViolation(
        `invalid:${CURSOR_EVENTS.color}`,
        result.error.issues.map((issue) => issue.code),
      );
      return;
    }

    if (!participant.colorLimiter.take(acceptedAt)) {
      recordViolation(`rate:${CURSOR_EVENTS.color}`);
      return;
    }

    participant.lastActivityAt = acceptedAt;
    participant.color = result.data.color;
    socket.data.cursorColor = result.data.color;

    if (participant.lastCursor) {
      participant.lastCursor = {
        ...participant.lastCursor,
        color: result.data.color,
      };
      socket.data.cursorLastPosition = participant.lastCursor;
    }

    const pendingMove = room.pendingMoves.get(participant.userId);

    if (pendingMove) {
      room.pendingMoves.set(participant.userId, {
        ...pendingMove,
        color: result.data.color,
      });
    }

    io.to(roomId).emit(CURSOR_EVENTS.presence, {
      color: participant.color,
      username: participant.username,
      userId: participant.userId,
    });
    for (const nodeId of participant.typingNodeIds) {
      socket.to(roomId).emit(CANVAS_EVENTS.typing, {
        isTyping: true,
        nodeId,
        user: {
          color: participant.color,
          username: participant.username,
          userId: participant.userId,
        },
      });
    }
  });

  socket.on(CURSOR_EVENTS.move, (input) => {
    const acceptedInput = acceptCursorInput(
      input,
      participant.moveLimiter,
      CURSOR_EVENTS.move,
    );

    if (!acceptedInput) {
      return;
    }

    const update: CursorUpdate = {
      ...acceptedInput,
      color: participant.color,
      updatedAt: now(),
      userId: participant.userId,
    };
    const cursor: RemoteCursor = {
      ...update,
      username: participant.username,
    };
    participant.lastCursor = cursor;
    socket.data.cursorLastPosition = cursor;
    room.pendingMoves.set(participant.userId, update);
  });

  socket.on(CURSOR_EVENTS.click, (input) => {
    const acceptedInput = acceptCursorInput(
      input,
      participant.clickLimiter,
      CURSOR_EVENTS.click,
    );

    if (!acceptedInput) {
      return;
    }

    const update: CursorUpdate = {
      ...acceptedInput,
      color: participant.color,
      updatedAt: now(),
      userId: participant.userId,
    };
    const cursor: RemoteCursor = {
      ...update,
      username: participant.username,
    };
    participant.lastCursor = cursor;
    socket.data.cursorLastPosition = cursor;
    room.pendingMoves.delete(participant.userId);
    socket.to(roomId).volatile.emit(CURSOR_EVENTS.click, update);
  });
}
