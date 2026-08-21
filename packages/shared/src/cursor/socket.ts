import type {
  CursorBatch,
  CursorInput,
  CursorRemoval,
  CursorSession,
  RemoteCursor,
} from './schemas.js';

export interface ClientToServerEvents {
  'cursor:click': (input: CursorInput) => void;
  'cursor:move': (input: CursorInput) => void;
}

export interface ServerToClientEvents {
  'cursor:batch': (batch: CursorBatch) => void;
  'cursor:click': (cursor: RemoteCursor) => void;
  'cursor:remove': (removal: CursorRemoval) => void;
  'cursor:session': (session: CursorSession) => void;
}
