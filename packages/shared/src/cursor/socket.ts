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
