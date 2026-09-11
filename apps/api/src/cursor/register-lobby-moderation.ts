import type { Database } from '@app/db';
import {
  CURSOR_EVENTS,
  lobbyModerationSchema,
  type LobbyModerationResult,
} from '@app/shared';
import type {
  CursorIo,
  CursorSocket,
  CursorRoom,
  Participant,
  CursorLogger,
} from './cursor-types.js';

export function registerLobbyModeration(
  io: CursorIo,
  socket: CursorSocket,
  room: CursorRoom,
  participant: Participant,
  database: Database,
  acceptMessageBudget: (event: string) => number | undefined,
  logger: CursorLogger,
) {
  const roomId = socket.data.cursorRoomId;
  const readOwner = async () =>
    (
      await database.lobby.findUnique({
        where: { id: roomId, archivedAt: null },
        select: { ownerId: true },
      })
    )?.ownerId ?? null;
  const reportError = (error: unknown) =>
    logger.warn(
      { errorType: error instanceof Error ? error.name : 'unknown' },
      'Lobby moderation failed',
    );
  // Initial reads and commands share a queue so stale reads cannot undo a transfer
  // in clients, and a former owner's queued kick cannot run after a transfer.
  room.moderation = (room.moderation ?? Promise.resolve())
    .then(async () => {
      const ownerId = await readOwner();
      if (socket.connected) socket.emit('lobby:ownership', { ownerId });
    })
    .catch(reportError);

  let pending = false;
  socket.on('lobby:moderate', (input, ack) => {
    if (typeof ack !== 'function') return;
    const reject = (message: string) => ack({ ok: false, message });
    if (acceptMessageBudget('lobby:moderate') === undefined || pending)
      return reject('Please wait before trying again.');
    const parsed = lobbyModerationSchema.safeParse(input);
    if (!parsed.success) return reject('Invalid lobby action.');
    pending = true;
    const execute = async (): Promise<LobbyModerationResult> => {
      const ownerId = await readOwner();
      if (!socket.connected || ownerId !== participant.userId)
        return { ok: false, message: 'Only the lobby owner can manage users.' };
      const { action, userId } = parsed.data;
      if (userId === ownerId)
        return { ok: false, message: 'Choose another user in this lobby.' };
      const targets = Array.from(room.participants.values())
        .filter((user) => user.userId === userId)
        .flatMap((user) => {
          const target = io.sockets.sockets.get(user.socketId);
          return target?.connected ? [target] : [];
        });
      if (!targets.length)
        return { ok: false, message: 'This user has left the lobby.' };
      if (action === 'transfer') {
        const updated = await database.lobby.updateMany({
          where: { id: roomId, ownerId, archivedAt: null },
          data: { ownerId: userId },
        });
        if (updated.count !== 1)
          return {
            ok: false,
            message: 'Lobby ownership has changed. Try again.',
          };
        io.to(roomId).emit('lobby:ownership', { ownerId: userId });
      } else {
        await database.lobbyBan.upsert({
          where: { roomId_userId: { roomId, userId } },
          create: { roomId, userId },
          update: {},
        });
        for (const user of room.participants.values()) {
          if (user.userId !== userId) continue;
          const target = io.sockets.sockets.get(user.socketId);
          target?.emit(CURSOR_EVENTS.disconnect, { reason: 'kicked' });
          target?.disconnect(true);
        }
      }
      return { ok: true };
    };
    room.moderation = (room.moderation ?? Promise.resolve()).then(async () => {
      try {
        ack(await execute());
      } catch (error) {
        reportError(error);
        reject('Could not update the lobby. Please try again.');
      } finally {
        pending = false;
      }
    });
  });
}
