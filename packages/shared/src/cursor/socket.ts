import type {
  ScreenShare,
  ScreenShareStart,
  ScreenShareWatch,
  ScreenShareSignal,
  ScreenShareResult,
  ScreenShareSync,
  ScreenShareViewer,
} from '../screen-share.js';
import type {
  LobbyModeration,
  LobbyModerationResult,
  LobbyOwnership,
} from '../lobby.js';
import type {
  CursorBatch,
  CursorColorInput,
  CursorDisconnectNotice,
  CursorInput,
  CursorRemoval,
  CursorSession,
  CursorUpdate,
  CursorUser,
} from './schemas.js';
import type {
  CanvasMessageInput,
  CanvasNode,
  CanvasNodeMutation,
  CanvasSnapshot,
  CanvasTypingInput,
  CanvasTypingUpdate,
} from '../canvas/schemas.js';
import type {
  CanvasCommand,
  CanvasCommandAck,
  CanvasChange,
  CanvasHistoryInput,
  CanvasHistoryResult,
} from '../canvas/commands.js';

export interface ClientToServerEvents {
  'screen:sync': (ack: (result: ScreenShareSync) => void) => void;
  'screen:start': (
    input: ScreenShareStart,
    ack: (result: ScreenShareResult) => void,
  ) => void;
  'screen:stop': (input: { shareId: string }) => void;
  'screen:move': (input: ScreenShareStart) => void;
  'screen:watch': (
    input: ScreenShareWatch,
    ack: (result: ScreenShareResult) => void,
  ) => void;
  'screen:unwatch': (input: ScreenShareWatch) => void;
  'screen:peer-status': (
    input: import('../screen-share.js').ScreenSharePeerStatus,
  ) => void;
  'screen:signal': (input: ScreenShareSignal) => void;
  'screen:heartbeat': (input: { shareId: string }) => void;
  'lobby:moderate': (
    input: LobbyModeration,
    ack: (result: LobbyModerationResult) => void,
  ) => void;
  'canvas:command': (input: CanvasCommand, ack: CanvasCommandAck) => void;
  'canvas:history': (
    input: CanvasHistoryInput,
    ack: (result: CanvasHistoryResult) => void,
  ) => void;
  'canvas:message-send': (input: CanvasMessageInput) => void;
  'canvas:mutation': (mutation: CanvasNodeMutation) => void;
  'canvas:typing': (input: CanvasTypingInput) => void;
  'cursor:click': (input: CursorInput) => void;
  'cursor:color': (input: CursorColorInput) => void;
  'cursor:move': (input: CursorInput) => void;
}

export interface ServerToClientEvents {
  'screen:state': (share: ScreenShare | null) => void;
  'screen:viewer': (viewer: ScreenShareViewer) => void;
  'screen:ended': (input: ScreenShareWatch) => void;
  'screen:signal': (input: ScreenShareSignal) => void;
  'lobby:ownership': (ownership: LobbyOwnership) => void;
  'canvas:change': (change: CanvasChange) => void;
  'canvas:error': (error: { message: string }) => void;
  'canvas:node-upsert': (node: CanvasNode) => void;
  'canvas:node-remove': (removal: { nodeId: string }) => void;
  'canvas:snapshot': (snapshot: CanvasSnapshot) => void;
  'canvas:typing': (update: CanvasTypingUpdate) => void;
  'cursor:batch': (batch: CursorBatch) => void;
  'cursor:click': (cursor: CursorUpdate) => void;
  'cursor:disconnect': (notice: CursorDisconnectNotice) => void;
  'cursor:presence': (user: CursorUser) => void;
  'cursor:remove': (removal: CursorRemoval) => void;
  'cursor:session': (session: CursorSession) => void;
}
