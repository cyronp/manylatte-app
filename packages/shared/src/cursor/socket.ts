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
  CanvasSnapshot,
  CanvasTypingInput,
  CanvasTypingUpdate,
} from '../canvas/schemas.js';

export interface ClientToServerEvents {
  'canvas:message-send': (input: CanvasMessageInput) => void;
  'canvas:node-upsert': (node: CanvasNode) => void;
  'canvas:typing': (input: CanvasTypingInput) => void;
  'cursor:click': (input: CursorInput) => void;
  'cursor:color': (input: CursorColorInput) => void;
  'cursor:move': (input: CursorInput) => void;
}

export interface ServerToClientEvents {
  'canvas:node-upsert': (node: CanvasNode) => void;
  'canvas:snapshot': (snapshot: CanvasSnapshot) => void;
  'canvas:typing': (update: CanvasTypingUpdate) => void;
  'cursor:batch': (batch: CursorBatch) => void;
  'cursor:click': (cursor: CursorUpdate) => void;
  'cursor:disconnect': (notice: CursorDisconnectNotice) => void;
  'cursor:presence': (user: CursorUser) => void;
  'cursor:remove': (removal: CursorRemoval) => void;
  'cursor:session': (session: CursorSession) => void;
}
