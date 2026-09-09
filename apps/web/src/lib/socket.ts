import {
  type ClientToServerEvents,
  type CursorRoomId,
  type ServerToClientEvents,
} from '@app/shared';
import { io, type Socket } from 'socket.io-client';

import { resolveCursorApiUrl } from './api-environment';
export { resolveCursorApiUrl } from './api-environment';

const apiUrl = resolveCursorApiUrl(import.meta.env);

export type CursorSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const createCursorSocket = (
  roomId: CursorRoomId,
  username: string,
): CursorSocket =>
  io(apiUrl, {
    auth: {
      roomId,
      username,
    },
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
  });
