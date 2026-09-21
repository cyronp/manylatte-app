import { afterEach, describe, expect, it, vi } from 'vitest';
import { hexColorSchema } from '@app/shared';
import type {
  ScreenShare,
  ScreenShareStart,
  ScreenShareSync,
  ScreenShareResult,
} from '@app/shared';
import type { CursorSocket } from '@/lib/socket';
import { ScreenShareSession } from './screen-share-session';

function fakeCapture() {
  const track = {
    kind: 'video',
    readyState: 'live',
    stop: vi.fn(),
    onended: null as (() => void) | null,
    contentHint: '',
  };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  return { track, stream };
}

function setup() {
  const listeners = new Map<string, (input?: unknown) => void>();
  const socket = {
    id: 'presenter',
    connected: true,
    on: vi.fn((event: string, handler: (input?: unknown) => void) =>
      listeners.set(event, handler),
    ),
    off: vi.fn((event: string) => listeners.delete(event)),
    timeout: () => socket,
    emit: vi.fn((event: string, input: unknown) => {
      if (event === 'screen:sync')
        (input as (error: null, result: ScreenShareSync) => void)(null, {
          share: null,
          iceServers: [],
        });
    }),
    emitWithAck: vi.fn(
      async (
        _event: string,
        input: ScreenShareStart,
      ): Promise<ScreenShareResult> => {
        listeners.get('screen:state')?.({
          id: input.shareId,
          presenterId: socket.id,
          position: input.position,
          viewerCount: 0,
          user: {
            userId: 'user',
            username: 'Presenter',
            color: hexColorSchema.parse('#000000'),
          },
        } satisfies ScreenShare);
        return { ok: true, iceServers: [] };
      },
    ),
  };
  const { track, stream } = fakeCapture();
  const capture = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: capture } });
  vi.stubGlobal('RTCPeerConnection', vi.fn());
  const update = vi.fn();
  const session = new ScreenShareSession(
    socket as unknown as CursorSocket,
    update,
  );
  return { session, socket, listeners, track, stream, capture, update };
}

describe('screen capture lifetime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('refreshes expired presenter credentials before offering to a late viewer', async () => {
    vi.useFakeTimers();
    const { session, socket, listeners } = setup();
    const oldServers = [
      {
        urls: ['turn:example.invalid'],
        username: 'presenter',
        credential: 'old',
      },
    ];
    const newServers = [{ ...oldServers[0]!, credential: 'new' }];
    const pc = {
      addTrack: vi.fn(),
      close: vi.fn(),
      setConfiguration: vi.fn(),
      createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'offer' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal(
      'RTCPeerConnection',
      vi.fn(function () {
        return pc;
      }),
    );
    socket.emitWithAck.mockResolvedValueOnce({
      ok: true,
      iceServers: oldServers,
      iceServersExpiresAt: Date.now() + 60_000,
    });
    socket.emitWithAck.mockResolvedValue({
      ok: true,
      iceServers: newServers,
      iceServersExpiresAt: Date.now() + 900_000,
    });
    try {
      await session.start({ x: 0, y: 0 });
      const shareId = socket.emitWithAck.mock.calls[0]![1].shareId;
      // Model a throttled background tab whose refresh timer has not run.
      vi.setSystemTime(Date.now() + 70_000);
      listeners.get('screen:viewer')?.({
        shareId,
        peerId: 'viewer',
        connectionId: 'connection',
        joined: true,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(socket.emitWithAck).toHaveBeenLastCalledWith(
        'screen:credentials',
        { shareId },
      );
      expect(pc.setConfiguration).toHaveBeenCalledWith({
        iceServers: newServers,
      });
      expect(pc.setConfiguration.mock.invocationCallOrder[0]).toBeLessThan(
        pc.createOffer.mock.invocationCallOrder[0]!,
      );
    } finally {
      session.dispose();
    }
  });

  it('waits for presenter ICE configuration when viewers join before the start acknowledgement', async () => {
    const { session, socket, listeners } = setup();
    const iceServers = [
      {
        urls: ['turn:example.invalid'],
        username: 'presenter',
        credential: 'test',
      },
    ];
    const pc = {
      addTrack: vi.fn(),
      close: vi.fn(),
      createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'offer' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
    };
    const constructor = vi.fn(function () {
      return pc;
    });
    vi.stubGlobal('RTCPeerConnection', constructor);
    socket.emitWithAck.mockImplementation(async (_event, input) => {
      listeners.get('screen:viewer')?.({
        shareId: input.shareId,
        peerId: 'viewer',
        connectionId: 'connection',
        joined: true,
      });
      expect(constructor).not.toHaveBeenCalled();
      return { ok: true, iceServers };
    });
    try {
      await session.start({ x: 0, y: 0 });
      expect(constructor).toHaveBeenCalledWith({ iceServers });
    } finally {
      session.dispose();
    }
  });

  it('reports connected and failed viewer connections to release server reservations', async () => {
    const { session, socket, listeners, update } = setup();
    const pc = {
      connectionState: 'new',
      onconnectionstatechange: null as (() => void) | null,
      addTrack: vi.fn(),
      close: vi.fn(),
      createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'offer' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal(
      'RTCPeerConnection',
      vi.fn(function () {
        return pc;
      }),
    );
    try {
      await session.start({ x: 0, y: 0 });
      const peer = {
        shareId: update.mock.lastCall?.[0].share.id,
        peerId: 'viewer',
        connectionId: 'connection',
      };
      listeners.get('screen:viewer')?.({ ...peer, joined: true });
      pc.connectionState = 'connected';
      pc.onconnectionstatechange?.();
      expect(socket.emit).toHaveBeenCalledWith('screen:peer-status', {
        ...peer,
        connected: true,
      });
      pc.connectionState = 'failed';
      pc.onconnectionstatechange?.();
      expect(socket.emit).toHaveBeenCalledWith('screen:peer-status', {
        ...peer,
        connected: false,
      });
      expect(pc.close).toHaveBeenCalledOnce();
    } finally {
      session.dispose();
    }
  });

  it('stops a capture that resolves after leaving without publishing it', async () => {
    const { session, capture, stream, track, socket } = setup();
    let finish!: (stream: MediaStream) => void;
    capture.mockReturnValue(
      new Promise<MediaStream>((resolve) => {
        finish = resolve;
      }),
    );
    const pending = session.start({ x: 10, y: 20 });
    session.dispose();
    finish(stream);
    await pending;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(socket.emitWithAck).not.toHaveBeenCalled();
  });

  it('stops and releases capture on signaling disconnect, without resuming after reconnect', async () => {
    const { session, capture, track, socket, listeners, update } = setup();
    try {
      await session.start({ x: 10, y: 20 });
      expect(update.mock.lastCall?.[0].status).toBe('live');
      socket.connected = false;
      listeners.get('disconnect')?.();
      expect(track.stop).toHaveBeenCalledOnce();
      expect(update.mock.lastCall?.[0]).toMatchObject({
        share: null,
        stream: undefined,
        ready: false,
      });
      socket.connected = true;
      listeners.get('connect')?.();
      expect(capture).toHaveBeenCalledOnce();
      expect(update.mock.lastCall?.[0].share).toBeNull();
    } finally {
      session.dispose();
    }
  });

  it('releases capture and attempts server cleanup when the start acknowledgement is lost', async () => {
    const { session, track, socket, update } = setup();
    socket.emitWithAck.mockRejectedValue(new Error('operation has timed out'));
    try {
      await session.start({ x: 10, y: 20 });
      expect(track.stop).toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('screen:stop', {
        shareId: expect.any(String),
      });
      expect(update.mock.lastCall?.[0]).toMatchObject({
        starting: false,
        stream: undefined,
        error: 'operation has timed out',
      });
    } finally {
      session.dispose();
    }
  });

  it('stops on the browser ended event and never captures audio', async () => {
    const { session, track, socket, capture } = setup();
    try {
      await session.start({ x: 10, y: 20 });
      expect(capture).toHaveBeenCalledWith(
        expect.objectContaining({ audio: false }),
      );
      track.onended?.();
      expect(track.stop).toHaveBeenCalledOnce();
      expect(socket.emit).toHaveBeenCalledWith('screen:stop', {
        shareId: expect.any(String),
      });
    } finally {
      session.dispose();
    }
  });

  it('replaces the video sender without restarting the share or closing the viewer connection', async () => {
    const { session, capture, track, listeners, update, socket } = setup();
    const next = fakeCapture();
    const sender = {
      track,
      replaceTrack: vi.fn().mockResolvedValue(undefined),
    };
    const pc = {
      addTrack: vi.fn(),
      getSenders: () => [sender],
      close: vi.fn(),
      createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'offer' }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal(
      'RTCPeerConnection',
      vi.fn(function () {
        return pc;
      }),
    );
    try {
      await session.start({ x: 10, y: 20 });
      const shareId = update.mock.lastCall?.[0].share.id;
      listeners.get('screen:viewer')?.({
        shareId,
        peerId: 'viewer',
        connectionId: 'connection',
        joined: true,
      });
      capture.mockResolvedValue(next.stream);
      await session.changeScreen();
      expect(sender.replaceTrack).toHaveBeenCalledWith(next.track);
      expect(track.stop).toHaveBeenCalledOnce();
      expect(next.track.stop).not.toHaveBeenCalled();
      expect(pc.close).not.toHaveBeenCalled();
      expect(update.mock.lastCall?.[0]).toMatchObject({
        stream: next.stream,
        changing: false,
        share: { id: shareId },
      });
      expect(socket.emitWithAck).toHaveBeenCalledOnce();
    } finally {
      session.dispose();
    }
  });

  it('keeps the current screen when the change picker is cancelled', async () => {
    const { session, capture, track, stream, update } = setup();
    try {
      await session.start({ x: 10, y: 20 });
      capture.mockRejectedValue(
        new DOMException('Cancelled', 'NotAllowedError'),
      );
      await session.changeScreen();
      expect(track.stop).not.toHaveBeenCalled();
      expect(update.mock.lastCall?.[0]).toMatchObject({
        stream,
        changing: false,
        status: 'live',
        error: undefined,
      });
    } finally {
      session.dispose();
    }
  });

  it('discards the replacement if sharing is stopped while the picker is open', async () => {
    const { session, capture, track, update } = setup();
    const next = fakeCapture();
    let finish!: (stream: MediaStream) => void;
    try {
      await session.start({ x: 10, y: 20 });
      capture.mockReturnValue(
        new Promise<MediaStream>((resolve) => {
          finish = resolve;
        }),
      );
      const pending = session.changeScreen();
      session.stop();
      finish(next.stream);
      await pending;
      expect(track.stop).toHaveBeenCalledOnce();
      expect(next.track.stop).toHaveBeenCalledOnce();
      expect(update.mock.lastCall?.[0]).toMatchObject({
        stream: undefined,
        changing: false,
      });
    } finally {
      session.dispose();
    }
  });
});
