import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import type { ScreenShareResult, ScreenShareWatch } from '@app/shared';
import type { CursorSocket } from '@/lib/socket';
import { ScreenShareSession } from './screen-share-session';

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const events = new EventEmitter();
  const iceServers = [
    {
      urls: ['turn:example.invalid:3478'],
      username: 'expiry:viewer',
      credential: 'test',
    },
  ];
  let resolve!: (result: ScreenShareResult) => void;
  const ack = new Promise<ScreenShareResult>((done) => {
    resolve = done;
  });
  const share = {
    id: 'share',
    presenterId: 'presenter',
    viewerCount: 0,
    position: { x: 0, y: 0 },
    user: {},
  };
  const socket = {
    id: 'viewer',
    connected: true,
    on: events.on.bind(events),
    off: events.off.bind(events),
    timeout: () => socket,
    emit: vi.fn((event: string, input: unknown) => {
      if (event === 'screen:sync')
        (input as (error: null, result: unknown) => void)(null, {
          share,
          iceServers: [],
        });
    }),
    emitWithAck: vi
      .fn<
        (event: string, input: ScreenShareWatch) => Promise<ScreenShareResult>
      >()
      .mockReturnValue(ack),
  };
  const pc = {
    close: vi.fn(),
    remoteDescription: null,
    setRemoteDescription: vi.fn().mockResolvedValue(undefined),
    setLocalDescription: vi.fn().mockResolvedValue(undefined),
    addIceCandidate: vi.fn().mockResolvedValue(undefined),
    createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'answer' }),
  };
  const constructor = vi.fn(function () {
    return pc;
  });
  vi.stubGlobal('RTCPeerConnection', constructor);
  const update = vi.fn();
  const session = new ScreenShareSession(
    socket as unknown as CursorSocket,
    update,
  );
  return {
    session,
    socket,
    events,
    iceServers,
    resolve,
    pc,
    constructor,
    update,
  };
}

it('uses returned ICE servers on the first connection and preserves signals arriving before the ack', async () => {
  const { session, socket, events, iceServers, resolve, pc, constructor } =
    setup();
  try {
    const pending = session.watch();
    const input = socket.emitWithAck.mock.calls[0][1];
    events.emit('screen:signal', {
      ...input,
      peerId: 'presenter',
      signal: { type: 'candidate', candidate: { candidate: 'candidate' } },
    });
    events.emit('screen:signal', {
      ...input,
      peerId: 'presenter',
      signal: { type: 'offer', sdp: 'offer' },
    });
    expect(constructor).not.toHaveBeenCalled();
    resolve({ ok: true, iceServers });
    await pending;
    expect(constructor).toHaveBeenCalledWith({ iceServers });
    await vi.waitFor(() => expect(pc.createAnswer).toHaveBeenCalledOnce());
    expect(pc.setRemoteDescription).toHaveBeenCalledWith({
      type: 'offer',
      sdp: 'offer',
    });
    expect(pc.addIceCandidate).toHaveBeenCalledWith({ candidate: 'candidate' });
  } finally {
    session.dispose();
  }
});

it('does not resurrect a viewer when the watch acknowledgement arrives after cancellation', async () => {
  const { session, resolve, iceServers, constructor } = setup();
  try {
    const pending = session.watch();
    session.unwatch();
    resolve({ ok: true, iceServers });
    await pending;
    expect(constructor).not.toHaveBeenCalled();
  } finally {
    session.dispose();
  }
});

it('releases a viewer when the server ends its reservation, ignoring stale notifications', async () => {
  const { session, socket, events, resolve, iceServers, pc, update } = setup();
  try {
    const pending = session.watch();
    const input = socket.emitWithAck.mock.calls[0][1];
    resolve({ ok: true, iceServers });
    await pending;
    events.emit('screen:ended', { ...input, connectionId: 'stale' });
    expect(pc.close).not.toHaveBeenCalled();
    events.emit('screen:ended', input);
    expect(pc.close).toHaveBeenCalledOnce();
    expect(update.mock.lastCall?.[0]).toMatchObject({
      watching: false,
      status: 'failed',
    });
  } finally {
    session.dispose();
  }
});
