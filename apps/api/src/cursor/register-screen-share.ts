import {
  MAX_SCREEN_SHARE_VIEWERS,
  screenShareIdSchema,
  screenShareStartSchema,
  screenShareWatchSchema,
  screenShareSignalSchema,
  type ScreenShare,
  type ScreenShareIceServer,
} from '@app/shared';
import type {
  CursorIo,
  CursorSocket,
  CursorRoom,
  Participant,
} from './cursor-types.js';

export interface RoomScreenShare {
  share: ScreenShare;
  viewers: Map<string, string>;
}

export function registerScreenShare(
  io: CursorIo,
  socket: CursorSocket,
  room: CursorRoom,
  participant: Participant,
  acceptMessage: (event: string) => number | undefined,
  iceServers: () => ScreenShareIceServer[],
) {
  const roomId = socket.data.cursorRoomId;
  const accept = (event: string) => {
    if (!socket.connected) return false;
    const time = acceptMessage(event);
    if (time === undefined) return false;
    participant.lastActivityAt = time;
    return true;
  };
  const broadcast = () => {
    if (room.screenShare)
      room.screenShare.share.viewerCount = room.screenShare.viewers.size;
    io.to(roomId).emit('screen:state', room.screenShare?.share ?? null);
  };
  const unwatch = () => {
    const current = room.screenShare;
    const connectionId = current?.viewers.get(socket.id);
    if (!current || !connectionId) return;
    current.viewers.delete(socket.id);
    io.to(current.share.presenterId).emit('screen:viewer', {
      shareId: current.share.id,
      peerId: socket.id,
      connectionId,
      joined: false,
    });
    broadcast();
  };
  socket.on('screen:sync', (ack) => {
    if (typeof ack === 'function' && accept('screen:sync'))
      ack({ share: room.screenShare?.share ?? null, iceServers: iceServers() });
  });
  socket.on('screen:start', (input, ack) => {
    if (typeof ack !== 'function') return;
    if (!accept('screen:start'))
      return ack({ ok: false, message: 'Reconnect or try again shortly.' });
    const parsed = screenShareStartSchema.safeParse(input);
    if (!parsed.success)
      return ack({ ok: false, message: 'Invalid screen share.' });
    if (room.screenShare)
      return ack({
        ok: false,
        message: 'Someone is already sharing in this lobby.',
      });
    room.screenShare = {
      share: {
        id: parsed.data.shareId,
        position: parsed.data.position,
        presenterId: socket.id,
        viewerCount: 0,
        user: {
          userId: participant.userId,
          username: participant.username,
          color: participant.color,
        },
      },
      viewers: new Map(),
    };
    broadcast();
    ack({ ok: true });
  });
  socket.on('screen:stop', (input) => {
    // Cleanup remains possible after a signaling burst exhausts the message budget.
    accept('screen:stop');
    const parsed = screenShareIdSchema.safeParse(input);
    if (
      parsed.success &&
      room.screenShare?.share.id === parsed.data.shareId &&
      room.screenShare.share.presenterId === socket.id
    ) {
      room.screenShare = undefined;
      broadcast();
    }
  });
  socket.on('screen:move', (input) => {
    if (!accept('screen:move')) return;
    const parsed = screenShareStartSchema.safeParse(input);
    if (
      parsed.success &&
      room.screenShare?.share.id === parsed.data.shareId &&
      room.screenShare.share.presenterId === socket.id
    ) {
      room.screenShare.share.position = parsed.data.position;
      broadcast();
    }
  });
  socket.on('screen:watch', (input, ack) => {
    if (typeof ack !== 'function') return;
    if (!accept('screen:watch'))
      return ack({ ok: false, message: 'Reconnect or try again shortly.' });
    const parsed = screenShareWatchSchema.safeParse(input);
    const current = room.screenShare;
    if (
      !parsed.success ||
      !current ||
      current.share.id !== parsed.data.shareId ||
      current.share.presenterId === socket.id
    )
      return ack({
        ok: false,
        message: 'This screen share is no longer available.',
      });
    if (
      !current.viewers.has(socket.id) &&
      current.viewers.size >= MAX_SCREEN_SHARE_VIEWERS
    )
      return ack({
        ok: false,
        message: `This screen share already has ${MAX_SCREEN_SHARE_VIEWERS} viewers.`,
      });
    if (current.viewers.get(socket.id) === parsed.data.connectionId)
      return ack({ ok: true });
    unwatch();
    current.viewers.set(socket.id, parsed.data.connectionId);
    io.to(current.share.presenterId).emit('screen:viewer', {
      ...parsed.data,
      peerId: socket.id,
      joined: true,
    });
    broadcast();
    ack({ ok: true });
  });
  socket.on('screen:unwatch', (input) => {
    accept('screen:unwatch');
    const parsed = screenShareWatchSchema.safeParse(input);
    if (
      parsed.success &&
      room.screenShare?.share.id === parsed.data.shareId &&
      room.screenShare.viewers.get(socket.id) === parsed.data.connectionId
    )
      unwatch();
  });
  socket.on('screen:signal', (input) => {
    if (!accept('screen:signal')) return;
    const parsed = screenShareSignalSchema.safeParse(input);
    const current = room.screenShare;
    if (!parsed.success || !current || current.share.id !== parsed.data.shareId)
      return;
    const { peerId, connectionId, signal } = parsed.data;
    if (!room.participants.has(peerId) || peerId === socket.id) return;
    const isPresenter = current.share.presenterId === socket.id;
    if (
      isPresenter
        ? current.viewers.get(peerId) !== connectionId
        : peerId !== current.share.presenterId ||
          current.viewers.get(socket.id) !== connectionId
    )
      return;
    if (
      (signal.type === 'offer' && !isPresenter) ||
      (signal.type === 'answer' && isPresenter)
    )
      return;
    // Never trust a client-supplied sender identity or room identifier.
    io.to(peerId).emit('screen:signal', { ...parsed.data, peerId: socket.id });
  });
  socket.on('screen:heartbeat', (input) => {
    const parsed = screenShareIdSchema.safeParse(input);
    const current = room.screenShare;
    if (
      parsed.success &&
      current?.share.id === parsed.data.shareId &&
      (current.share.presenterId === socket.id ||
        current.viewers.has(socket.id))
    )
      accept('screen:heartbeat');
  });
  socket.on('disconnect', () => {
    if (room.screenShare?.share.presenterId === socket.id) {
      room.screenShare = undefined;
      broadcast();
    } else unwatch();
  });
}
