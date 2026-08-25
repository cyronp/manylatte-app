import type {
  CursorBatch,
  CursorColorInput,
  CursorInput,
  CursorRemoval,
  CursorSession,
  CursorUpdate,
  CursorUser,
} from './schemas.js';

export interface ClientToServerEvents {
  'cursor:click': (input: CursorInput) => void;
  'cursor:color': (input: CursorColorInput) => void;
  'cursor:move': (input: CursorInput) => void;
}

export interface ServerToClientEvents {
  'cursor:batch': (batch: CursorBatch) => void;
  'cursor:click': (cursor: CursorUpdate) => void;
  'cursor:presence': (user: CursorUser) => void;
  'cursor:remove': (removal: CursorRemoval) => void;
  'cursor:session': (session: CursorSession) => void;
}
