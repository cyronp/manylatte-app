import { CANVAS_EVENTS, canvasTypingInputSchema } from '@app/shared';
import type {
  CursorIo,
  CursorSocket,
  CursorRoom,
  Participant,
  CursorLogger,
} from './cursor-types.js';

export function clearTyping(
  io: CursorIo,
  roomId: string,
  participant: Participant,
) {
  for (const nodeId of participant.typingNodeIds) {
    io.to(roomId).emit(CANVAS_EVENTS.typing, {
      isTyping: false,
      nodeId,
      user: {
        userId: participant.userId,
        username: participant.username,
        color: participant.color,
      },
    });
  }
  participant.typingNodeIds.clear();
  participant.typingExpiresAt = undefined;
}

export function registerTyping(
  socket: CursorSocket,
  room: CursorRoom,
  participant: Participant,
  now: () => number,
  budget: (event: string) => number | undefined,
  logger: CursorLogger,
) {
  socket.on(CANVAS_EVENTS.typing, (input) => {
    const at = budget(CANVAS_EVENTS.typing);
    if (at === undefined) return;
    const parsed = canvasTypingInputSchema.safeParse(input);
    if (!parsed.success) return;
    void (async () => {
      const { isTyping, nodeId } = parsed.data;
      if (isTyping && !(await room.canvas.hasMessageNode(nodeId))) return;
      if (!socket.connected) return;
      const user = {
        color: participant.color,
        userId: participant.userId,
        username: participant.username,
      };
      for (const previous of participant.typingNodeIds) {
        if (previous !== nodeId || !isTyping) {
          participant.typingNodeIds.delete(previous);
          socket.to(socket.data.cursorRoomId).emit(CANVAS_EVENTS.typing, {
            isTyping: false,
            nodeId: previous,
            user,
          });
        }
      }
      if (isTyping) participant.typingNodeIds.add(nodeId);
      participant.typingExpiresAt = isTyping ? now() + 5_000 : undefined;
      participant.lastActivityAt = at;
      socket
        .to(socket.data.cursorRoomId)
        .emit(CANVAS_EVENTS.typing, { ...parsed.data, user });
    })().catch(() =>
      logger.warn({ socketId: socket.id }, 'Typing update unavailable'),
    );
  });
}
