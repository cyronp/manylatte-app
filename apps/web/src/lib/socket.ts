import {
  type ClientToServerEvents,
  type CursorRoomId,
  type ServerToClientEvents,
} from '@app/shared';
import { io, type Socket } from 'socket.io-client';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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
  });
