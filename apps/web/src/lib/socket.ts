import {
  type ClientToServerEvents,
  type CursorRoomId,
  type ServerToClientEvents,
} from '@app/shared';
import { io, type Socket } from 'socket.io-client';

const DEFAULT_LOCAL_API_URL = 'http://localhost:3000';

interface CursorApiEnvironment {
  VITE_API_MODE?: string;
  VITE_FORWARDED_API_URL?: string;
  VITE_LOCAL_API_URL?: string;
}

export const resolveCursorApiUrl = ({
  VITE_API_MODE: mode = 'local',
  VITE_FORWARDED_API_URL: forwardedUrl,
  VITE_LOCAL_API_URL: localUrl = DEFAULT_LOCAL_API_URL,
}: CursorApiEnvironment) => {
  if (mode === 'local') {
    return localUrl;
  }

  if (mode === 'forwarded') {
    if (!forwardedUrl) {
      throw new Error(
        'VITE_FORWARDED_API_URL is required when VITE_API_MODE=forwarded',
      );
    }

    return forwardedUrl;
  }

  throw new Error(`Unsupported VITE_API_MODE: ${mode}`);
};

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
  });
