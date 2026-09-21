import type {
  ScreenShare,
  ScreenShareSignal,
  ScreenShareSync,
  ScreenShareViewer,
  ScreenShareWatch,
  ScreenShareResult,
} from '@app/shared';
import type { CursorSocket } from '@/lib/socket';

export type ScreenShareState = {
  share: ScreenShare | null;
  stream?: MediaStream;
  local: boolean;
  starting: boolean;
  changing: boolean;
  ready: boolean;
  watching: boolean;
  status: 'idle' | 'connecting' | 'live' | 'failed';
  error?: string;
};
export const initialScreenShareState: ScreenShareState = {
  share: null,
  local: false,
  starting: false,
  changing: false,
  ready: false,
  watching: false,
  status: 'idle',
};

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  pending: RTCIceCandidateInit[];
  queue: Promise<void>;
  timeout?: ReturnType<typeof setTimeout>;
}

const captureScreen = () =>
  navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: 15, max: 30 },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });

// One session per canvas, independent of node mounting, selection, or zoom.
export class ScreenShareSession {
  private state: ScreenShareState = { ...initialScreenShareState };
  private iceServers: RTCIceServer[] = [];
  private iceExpiresAt = Infinity;
  private iceRefresh?: Promise<void>;
  private peers = new Map<string, Peer>();
  private localStream?: MediaStream;
  private retiringStream?: MediaStream;
  private localShareId?: string;
  private connectionId?: string;
  private earlySignals: ScreenShareSignal[] = [];
  private startingViewers = new Map<string, ScreenShareViewer>();
  private localIceReady = false;
  private generation = 0;
  private disposed = false;
  private heartbeat: ReturnType<typeof setInterval>;

  constructor(
    private socket: CursorSocket,
    private update: (state: ScreenShareState) => void,
  ) {
    socket.on('connect', this.sync);
    socket.on('disconnect', this.disconnected);
    socket.on('screen:state', this.receiveState);
    socket.on('screen:viewer', this.receiveViewer);
    socket.on('screen:signal', this.receiveSignal);
    socket.on('screen:ended', this.receiveEnded);
    this.heartbeat = setInterval(() => {
      if (
        socket.connected &&
        this.state.share &&
        (this.localStream || this.connectionId)
      ) {
        socket.emit('screen:heartbeat', { shareId: this.state.share.id });
        // Keep active relay credentials fresh; a transient error retries on the next heartbeat.
        void this.refreshIce().catch(() => undefined);
      }
    }, 15_000);
    if (socket.connected) this.sync();
  }

  private publish(patch: Partial<ScreenShareState>) {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.update(this.state);
  }

  private sync = () => {
    const generation = this.generation;
    this.socket
      .timeout(5_000)
      .emit('screen:sync', (error: Error | null, result: ScreenShareSync) => {
        if (
          this.disposed ||
          generation !== this.generation ||
          !this.socket.connected
        )
          return;
        if (error)
          return this.publish({
            ready: false,
            error: 'Could not connect screen sharing. Reconnect to try again.',
          });
        this.iceServers = result.iceServers;
        this.publish({ ready: true });
        this.receiveState(result.share);
      });
  };

  private closePeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    this.peers.delete(peerId);
    clearTimeout(peer.timeout);
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
  }

  private clearMedia() {
    this.iceServers = [];
    this.iceExpiresAt = Infinity;
    this.iceRefresh = undefined;
    this.earlySignals = [];
    this.startingViewers.clear();
    this.localIceReady = false;
    for (const peerId of this.peers.keys()) this.closePeer(peerId);
    for (const track of [
      ...(this.localStream?.getTracks() ?? []),
      ...(this.retiringStream?.getTracks() ?? []),
    ]) {
      track.onended = null;
      track.stop();
    }
    this.localStream = undefined;
    this.retiringStream = undefined;
    this.localShareId = undefined;
    this.connectionId = undefined;
  }

  private disconnected = () => {
    this.generation++;
    this.clearMedia();
    this.publish({
      ...initialScreenShareState,
      stream: undefined,
      error: undefined,
    });
  };

  private receiveState = (share: ScreenShare | null) => {
    if (this.state.share?.id !== share?.id) {
      // A new local capture is created before its start acknowledgment arrives.
      if (!share || share.id !== this.localShareId) this.clearMedia();
      this.publish({
        stream: this.localStream,
        watching: false,
        changing: false,
        error: undefined,
        status: this.localStream ? 'live' : 'idle',
      });
    }
    this.publish({
      share,
      local: Boolean(share && share.presenterId === this.socket.id),
    });
  };

  async start(position: { x: number; y: number }) {
    if (
      this.state.starting ||
      this.state.share ||
      !this.state.ready ||
      !this.socket.connected
    )
      return;
    if (
      !navigator.mediaDevices?.getDisplayMedia ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      this.publish({
        error:
          'Screen sharing requires a supported desktop browser on HTTPS or localhost.',
      });
      return;
    }
    const generation = this.generation;
    this.publish({ starting: true, error: undefined });
    let stream: MediaStream | undefined;
    let shareId: string | undefined;
    try {
      // Must run directly from the click, before awaiting signaling or permissions elsewhere.
      stream = await captureScreen();
      if (
        this.disposed ||
        generation !== this.generation ||
        !this.socket.connected ||
        this.state.share
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState === 'ended')
        throw new Error('Screen capture ended before it could start.');
      track.contentHint = 'detail';
      shareId = crypto.randomUUID();
      this.localStream = stream;
      this.localShareId = shareId;
      track.onended = () => this.stop();
      const result = await this.socket
        .timeout(5_000)
        .emitWithAck('screen:start', { shareId, position });
      if (!result.ok) throw new Error(result.message);
      if (
        this.disposed ||
        generation !== this.generation ||
        this.localShareId !== shareId
      ) {
        if (this.socket.connected) this.socket.emit('screen:stop', { shareId });
        stream.getTracks().forEach((item) => item.stop());
        return;
      }
      this.applyIce(result);
      this.localIceReady = true;
      for (const viewer of this.startingViewers.values())
        this.receiveViewer(viewer);
      this.startingViewers.clear();
      this.publish({ stream, local: true, status: 'live' });
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (shareId && this.socket.connected)
        this.socket.emit('screen:stop', { shareId });
      if (generation === this.generation && !this.disposed) {
        if (this.localShareId === shareId) this.clearMedia();
        this.publish({
          stream: undefined,
          local: false,
          status: 'idle',
          error:
            error instanceof DOMException && error.name === 'NotAllowedError'
              ? 'Screen sharing was cancelled or permission was denied.'
              : error instanceof Error
                ? error.message
                : 'Could not start screen sharing.',
        });
      }
    } finally {
      if (generation === this.generation) this.publish({ starting: false });
    }
  }

  changeScreen = async () => {
    const previous = this.localStream;
    const shareId = this.localShareId;
    if (!previous || !shareId || this.state.changing || !this.socket.connected)
      return;
    const generation = this.generation;
    this.publish({ changing: true, error: undefined });
    let replacement: MediaStream | undefined;
    try {
      // Open the picker synchronously from the menu selection; keep broadcasting until it completes.
      replacement = await captureScreen();
      if (
        this.disposed ||
        generation !== this.generation ||
        this.localShareId !== shareId ||
        this.localStream !== previous
      ) {
        replacement.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = replacement.getVideoTracks()[0];
      if (!track || track.readyState === 'ended')
        throw new Error('The selected screen is no longer available.');
      track.contentHint = 'detail';
      this.retiringStream = previous;
      previous.getTracks().forEach((item) => {
        item.onended = null;
      });
      this.localStream = replacement;
      track.onended = () => this.stop();
      this.publish({ stream: replacement });
      // New viewers use localStream immediately; existing peers keep their connections.
      await Promise.all(
        Array.from(this.peers, async ([peerId, peer]) => {
          try {
            const sender = peer.pc
              .getSenders()
              .find((item) => item.track?.kind === 'video');
            if (!sender) throw new Error('Missing video sender');
            await sender.replaceTrack(track);
          } catch {
            this.fail(peerId, peer);
          }
        }),
      );
      previous.getTracks().forEach((item) => item.stop());
      if (this.retiringStream === previous) this.retiringStream = undefined;
    } catch (error) {
      replacement?.getTracks().forEach((track) => track.stop());
      if (
        !this.disposed &&
        generation === this.generation &&
        this.localShareId === shareId &&
        !(error instanceof DOMException && error.name === 'NotAllowedError')
      )
        this.publish({
          error:
            'Could not change the shared screen. Your current screen is still being shared.',
        });
    } finally {
      if (generation === this.generation && this.localShareId === shareId)
        this.publish({ changing: false });
    }
  };

  stop = () => {
    const shareId = this.localShareId;
    this.clearMedia();
    if (shareId && this.socket.connected)
      this.socket.emit('screen:stop', { shareId });
    this.publish({
      stream: undefined,
      watching: false,
      changing: false,
      status: 'idle',
    });
  };

  watch = async () => {
    const share = this.state.share;
    if (
      !share ||
      this.state.local ||
      !this.socket.connected ||
      !this.state.ready
    )
      return;
    this.unwatch();
    const connectionId = crypto.randomUUID();
    this.connectionId = connectionId;
    this.publish({ watching: true, status: 'connecting', error: undefined });
    try {
      const result = await this.socket
        .timeout(5_000)
        .emitWithAck('screen:watch', { shareId: share.id, connectionId });
      if (
        this.disposed ||
        !this.socket.connected ||
        this.connectionId !== connectionId ||
        this.state.share?.id !== share.id
      )
        return;
      if (!result.ok) throw new Error(result.message);
      this.applyIce(result);
      this.createPeer(share.presenterId, connectionId);
      for (const signal of this.earlySignals.splice(0))
        this.receiveSignal(signal);
    } catch (error) {
      if (this.connectionId !== connectionId) return;
      this.unwatch();
      this.publish({
        status: 'failed',
        error:
          error instanceof Error
            ? error.message
            : 'Could not join this screen share.',
      });
    }
  };

  unwatch = () => {
    this.earlySignals = [];
    if (this.connectionId && this.state.share && this.socket.connected)
      this.socket.emit('screen:unwatch', {
        shareId: this.state.share.id,
        connectionId: this.connectionId,
      });
    this.connectionId = undefined;
    for (const peerId of this.peers.keys()) this.closePeer(peerId);
    this.publish({ stream: undefined, watching: false, status: 'idle' });
  };

  private send(
    peerId: string,
    peer: Peer,
    signal: ScreenShareSignal['signal'],
  ) {
    const shareId = this.localShareId ?? this.state.share?.id;
    if (shareId && this.socket.connected && this.peers.get(peerId) === peer)
      this.socket.emit('screen:signal', {
        shareId,
        peerId,
        connectionId: peer.id,
        signal,
      });
  }

  private fail(peerId: string, peer: Peer) {
    if (this.peers.get(peerId) !== peer) return;
    this.reportPeer(peerId, peer, false);
    this.closePeer(peerId);
    if (!this.localStream) {
      this.unwatch();
      this.publish({
        status: 'failed',
        error:
          'Could not connect to the shared screen. Retry or ask the presenter to restart sharing.',
      });
    } else
      this.publish({
        error:
          'A viewer could not connect. They can retry from the screen node.',
      });
  }

  private reportPeer(peerId: string, peer: Peer, connected: boolean) {
    if (this.localShareId && this.socket.connected)
      this.socket.emit('screen:peer-status', {
        shareId: this.localShareId,
        peerId,
        connectionId: peer.id,
        connected,
      });
  }

  private applyIce(result: Extract<ScreenShareResult, { ok: true }>) {
    this.iceServers = result.iceServers;
    this.iceExpiresAt = result.iceServersExpiresAt ?? Infinity;
  }

  private refreshIce(): Promise<void> {
    if (Date.now() < this.iceExpiresAt - 60_000) return Promise.resolve();
    if (this.iceRefresh) return this.iceRefresh;
    const shareId =
      this.localShareId ??
      (this.connectionId ? this.state.share?.id : undefined);
    if (!shareId || !this.socket.connected || this.disposed)
      return Promise.resolve();
    const generation = this.generation;
    const pending = this.socket
      .timeout(5_000)
      .emitWithAck('screen:credentials', { shareId })
      .then((result) => {
        if (
          this.disposed ||
          generation !== this.generation ||
          shareId !==
            (this.localShareId ??
              (this.connectionId ? this.state.share?.id : undefined))
        )
          return;
        if (!result.ok) throw new Error(result.message);
        this.applyIce(result);
        for (const peer of this.peers.values())
          peer.pc.setConfiguration({ iceServers: this.iceServers });
      })
      .finally(() => {
        if (this.iceRefresh === pending) this.iceRefresh = undefined;
      });
    this.iceRefresh = pending;
    return pending;
  }

  private receiveEnded = (input: ScreenShareWatch) => {
    if (
      input.shareId !== this.state.share?.id ||
      input.connectionId !== this.connectionId
    )
      return;
    this.unwatch();
    this.publish({
      status: 'failed',
      error: 'The screen connection ended. Retry to watch again.',
    });
  };

  private createPeer(peerId: string, connectionId: string) {
    this.closePeer(peerId);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer: Peer = {
      id: connectionId,
      pc,
      pending: [],
      queue: Promise.resolve(),
    };
    this.peers.set(peerId, peer);
    peer.timeout = setTimeout(() => this.fail(peerId, peer), 25_000);
    pc.onicecandidate = ({ candidate }) => {
      if (candidate)
        this.send(peerId, peer, {
          type: 'candidate',
          candidate: { ...candidate.toJSON(), candidate: candidate.candidate },
        });
    };
    pc.ontrack = ({ track, streams }) => {
      if (this.localStream || this.peers.get(peerId) !== peer) return;
      this.publish({ stream: streams[0] ?? new MediaStream([track]) });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.reportPeer(peerId, peer, true);
        clearTimeout(peer.timeout);
        peer.timeout = undefined;
        if (!this.localStream)
          this.publish({ status: 'live', error: undefined });
      } else if (pc.connectionState === 'failed') this.fail(peerId, peer);
      else if (pc.connectionState === 'disconnected') {
        if (!this.localStream) this.publish({ status: 'connecting' });
        clearTimeout(peer.timeout);
        peer.timeout = setTimeout(() => this.fail(peerId, peer), 10_000);
      }
    };
    return peer;
  }

  private enqueue(peerId: string, peer: Peer, task: () => Promise<void>) {
    peer.queue = peer.queue
      .then(async () => {
        if (this.peers.get(peerId) === peer) await task();
      })
      .catch(() => this.fail(peerId, peer));
  }

  private receiveViewer = (viewer: ScreenShareViewer) => {
    if (!this.localStream || viewer.shareId !== this.localShareId) return;
    if (!this.localIceReady) {
      if (viewer.joined) this.startingViewers.set(viewer.peerId, viewer);
      else this.startingViewers.delete(viewer.peerId);
      return;
    }
    if (!viewer.joined) {
      if (this.peers.get(viewer.peerId)?.id === viewer.connectionId)
        this.closePeer(viewer.peerId);
      return;
    }
    try {
      const peer = this.createPeer(viewer.peerId, viewer.connectionId);
      for (const track of this.localStream.getVideoTracks())
        peer.pc.addTrack(track, this.localStream);
      this.enqueue(viewer.peerId, peer, async () => {
        await this.refreshIce();
        if (this.peers.get(viewer.peerId) !== peer) return;
        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);
        this.send(viewer.peerId, peer, { type: 'offer', sdp: offer.sdp! });
      });
    } catch {
      this.closePeer(viewer.peerId);
      this.socket.emit('screen:peer-status', {
        shareId: viewer.shareId,
        peerId: viewer.peerId,
        connectionId: viewer.connectionId,
        connected: false,
      });
      this.publish({ error: 'Could not connect a viewer to this screen.' });
    }
  };

  private receiveSignal = (input: ScreenShareSignal) => {
    if (input.shareId !== (this.localShareId ?? this.state.share?.id)) return;
    const peer = this.peers.get(input.peerId);
    if (
      !peer &&
      this.connectionId === input.connectionId &&
      input.peerId === this.state.share?.presenterId
    ) {
      if (this.earlySignals.length < 65) this.earlySignals.push(input);
      else {
        this.unwatch();
        this.publish({
          status: 'failed',
          error:
            'Too much signaling before the connection was ready. Retry to watch again.',
        });
      }
      return;
    }
    if (!peer || peer.id !== input.connectionId) return;
    this.enqueue(input.peerId, peer, async () => {
      const { signal } = input;
      if (signal.type === 'candidate') {
        if (peer.pc.remoteDescription)
          await peer.pc.addIceCandidate(signal.candidate);
        else if (peer.pending.length < 64) peer.pending.push(signal.candidate);
        return;
      }
      if ((signal.type === 'offer') === Boolean(this.localStream)) return;
      await peer.pc.setRemoteDescription(signal);
      for (const candidate of peer.pending.splice(0))
        await peer.pc.addIceCandidate(candidate);
      if (signal.type === 'offer') {
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.send(input.peerId, peer, { type: 'answer', sdp: answer.sdp! });
      }
    });
  };

  dispose() {
    this.disposed = true;
    this.generation++;
    clearInterval(this.heartbeat);
    if (this.localShareId) this.stop();
    else this.unwatch();
    this.clearMedia();
    this.socket.off('connect', this.sync);
    this.socket.off('disconnect', this.disconnected);
    this.socket.off('screen:state', this.receiveState);
    this.socket.off('screen:viewer', this.receiveViewer);
    this.socket.off('screen:signal', this.receiveSignal);
    this.socket.off('screen:ended', this.receiveEnded);
  }
}
