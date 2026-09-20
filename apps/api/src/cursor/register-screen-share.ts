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
import { TokenBucket } from './token-bucket.js';

export interface RoomScreenShare {
  share: ScreenShare;
  viewers: Map<string, string>;
  negotiations: TokenBucket;
}

export interface ScreenShareMetrics {
  activeShares: number;
  activeViewers: number;
  credentialRequests: number;
  invalidMessages: number;
  signalMessages: number;
  starts: number;
  stops: number;
  unwatchers: number;
  watchRejects: number;
  watches: number;
}

export function registerScreenShare(
  io: CursorIo,
  socket: CursorSocket,
  room: CursorRoom,
  participant: Participant,
  acceptMessage: (event: string) => number | undefined,
  recordViolation: (reason: string, issueCodes?: string[]) => void,
  iceServers: () => ScreenShareIceServer[],
  metrics: ScreenShareMetrics,
) {
  const roomId = socket.data.cursorRoomId;
  // A retry is expensive for the presenter even when the viewer sends no media.
  const watchBudget = new TokenBucket(3, 1 / 5);
  const signalBudget = new TokenBucket(
    80 * MAX_SCREEN_SHARE_VIEWERS,
    20 * MAX_SCREEN_SHARE_VIEWERS,
  );
  let moveBroadcastTimer: ReturnType<typeof setTimeout> | undefined;
  const accept = (event: string) => {
    if (!socket.connected) return false;
    const time = acceptMessage(event);
    if (time === undefined) return false;
    return time;
  };
  const markActivity = (time: number | false) => {
    if (time !== false) participant.lastActivityAt = time;
  };
  const invalid = (event: string, issues: string[]) => {
    metrics.invalidMessages++;
    recordViolation(`invalid:${event}`, issues);
  };
  const broadcast = () => {
    if (room.screenShare)
      room.screenShare.share.viewerCount = room.screenShare.viewers.size;
    io.to(roomId).emit('screen:state', room.screenShare?.share ?? null);
  };
  const cancelMoveBroadcast = () => {
    if (moveBroadcastTimer === undefined) return;
    clearTimeout(moveBroadcastTimer);
    moveBroadcastTimer = undefined;
  };
  const broadcastMove = () => {
    if (moveBroadcastTimer !== undefined) return;
    moveBroadcastTimer = setTimeout(() => {
      moveBroadcastTimer = undefined;
      broadcast();
    }, 50);
    moveBroadcastTimer.unref?.();
  };
  const stopShare = () => {
    if (!room.screenShare) return;
    metrics.activeShares--;
    metrics.activeViewers -= room.screenShare.viewers.size;
    metrics.stops++;
    room.screenShare = undefined;
    cancelMoveBroadcast();
    broadcast();
  };
  const unwatch = () => {
    const current = room.screenShare;
    const connectionId = current?.viewers.get(socket.id);
    if (!current || !connectionId) return;
    current.viewers.delete(socket.id);
    metrics.activeViewers--;
    metrics.unwatchers++;
    io.to(current.share.presenterId).emit('screen:viewer', {
      shareId: current.share.id,
      peerId: socket.id,
      connectionId,
      joined: false,
    });
    broadcast();
  };
  socket.on('screen:sync', (ack) => {
    if (typeof ack !== 'function') return;
    const acceptedAt = accept('screen:sync');
    if (acceptedAt === false) return;
    markActivity(acceptedAt);
    ack({ share: room.screenShare?.share ?? null, iceServers: [] });
  });
  socket.on('screen:start', (input, ack) => {
    if (typeof ack !== 'function') return;
    const acceptedAt = accept('screen:start');
    if (acceptedAt === false)
      return ack({ ok: false, message: 'Reconnect or try again shortly.' });
    const parsed = screenShareStartSchema.safeParse(input);
    if (!parsed.success) {
      invalid(
        'screen:start',
        parsed.error.issues.map((issue) => issue.code),
      );
      return ack({ ok: false, message: 'Invalid screen share.' });
    }
    markActivity(acceptedAt);
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
      negotiations: new TokenBucket(16, 1),
    };
    metrics.activeShares++;
    metrics.starts++;
    broadcast();
    ack({ ok: true, iceServers: iceServers() });
  });
  socket.on('screen:stop', (input) => {
    // Cleanup remains possible after a signaling burst exhausts the message budget.
    const acceptedAt = accept('screen:stop');
    const parsed = screenShareIdSchema.safeParse(input);
    if (!parsed.success) {
      if (acceptedAt !== false)
        invalid(
          'screen:stop',
          parsed.error.issues.map((issue) => issue.code),
        );
      return;
    }
    if (
      room.screenShare?.share.id === parsed.data.shareId &&
      room.screenShare.share.presenterId === socket.id
    ) {
      markActivity(acceptedAt);
      stopShare();
    }
  });
  socket.on('screen:move', (input) => {
    const acceptedAt = accept('screen:move');
    if (acceptedAt === false) return;
    const parsed = screenShareStartSchema.safeParse(input);
    if (!parsed.success) {
      invalid(
        'screen:move',
        parsed.error.issues.map((issue) => issue.code),
      );
      return;
    }
    if (
      room.screenShare?.share.id === parsed.data.shareId &&
      room.screenShare.share.presenterId === socket.id
    ) {
      markActivity(acceptedAt);
      room.screenShare.share.position = parsed.data.position;
      broadcastMove();
    }
  });
  socket.on('screen:watch', (input, ack) => {
    if (typeof ack !== 'function') return;
    const acceptedAt = accept('screen:watch');
    if (acceptedAt === false)
      return ack({ ok: false, message: 'Reconnect or try again shortly.' });
    const parsed = screenShareWatchSchema.safeParse(input);
    if (!parsed.success) {
      invalid(
        'screen:watch',
        parsed.error.issues.map((issue) => issue.code),
      );
      metrics.watchRejects++;
      return ack({
        ok: false,
        message: 'This screen share is no longer available.',
      });
    }
    markActivity(acceptedAt);
    const current = room.screenShare;
    if (
      !current ||
      current.share.id !== parsed.data.shareId ||
      current.share.presenterId === socket.id
    ) {
      metrics.watchRejects++;
      return ack({
        ok: false,
        message: 'This screen share is no longer available.',
      });
    }
    if (
      !current.viewers.has(socket.id) &&
      current.viewers.size >= MAX_SCREEN_SHARE_VIEWERS
    ) {
      metrics.watchRejects++;
      return ack({
        ok: false,
        message: `This screen share already has ${MAX_SCREEN_SHARE_VIEWERS} viewers.`,
      });
    }
    if (current.viewers.get(socket.id) === parsed.data.connectionId)
      return ack({ ok: true, iceServers: iceServers() });
    if (
      !watchBudget.take(acceptedAt) ||
      !current.negotiations.take(acceptedAt)
    ) {
      metrics.watchRejects++;
      return ack({
        ok: false,
        message: 'Please wait a few seconds before retrying.',
      });
    }
    unwatch();
    current.viewers.set(socket.id, parsed.data.connectionId);
    metrics.activeViewers++;
    metrics.watches++;
    io.to(current.share.presenterId).emit('screen:viewer', {
      ...parsed.data,
      peerId: socket.id,
      joined: true,
    });
    broadcast();
    ack({ ok: true, iceServers: iceServers() });
  });
  socket.on('screen:unwatch', (input) => {
    const acceptedAt = accept('screen:unwatch');
    const parsed = screenShareWatchSchema.safeParse(input);
    if (!parsed.success) {
      if (acceptedAt !== false)
        invalid(
          'screen:unwatch',
          parsed.error.issues.map((issue) => issue.code),
        );
      return;
    }
    if (
      room.screenShare?.share.id === parsed.data.shareId &&
      room.screenShare.viewers.get(socket.id) === parsed.data.connectionId
    ) {
      markActivity(acceptedAt);
      unwatch();
    }
  });
  socket.on('screen:signal', (input) => {
    // Fanout produces legitimate bursts of offers and ICE. Bound that traffic
    // separately; peer-induced responses must not kick the presenter for abuse.
    const acceptedAt = Date.now();
    if (!socket.connected || !signalBudget.take(acceptedAt)) return;
    metrics.signalMessages++;
    const parsed = screenShareSignalSchema.safeParse(input);
    if (!parsed.success) {
      invalid(
        'screen:signal',
        parsed.error.issues.map((issue) => issue.code),
      );
      return;
    }
    const current = room.screenShare;
    if (!current || current.share.id !== parsed.data.shareId) return;
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
    markActivity(acceptedAt);
    // Never trust a client-supplied sender identity or room identifier.
    io.to(peerId).emit('screen:signal', { ...parsed.data, peerId: socket.id });
  });
  socket.on('screen:heartbeat', (input) => {
    const acceptedAt = accept('screen:heartbeat');
    if (acceptedAt === false) return;
    const parsed = screenShareIdSchema.safeParse(input);
    if (!parsed.success) {
      invalid(
        'screen:heartbeat',
        parsed.error.issues.map((issue) => issue.code),
      );
      return;
    }
    const current = room.screenShare;
    if (
      current?.share.id === parsed.data.shareId &&
      (current.share.presenterId === socket.id ||
        current.viewers.has(socket.id))
    )
      markActivity(acceptedAt);
  });
  socket.on('disconnect', () => {
    cancelMoveBroadcast();
    if (room.screenShare?.share.presenterId === socket.id) {
      stopShare();
    } else unwatch();
  });
}
