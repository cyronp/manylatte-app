import {
  type ClientToServerEvents,
  type CursorRoomId,
  type ServerToClientEvents,
} from '@app/shared';
import { io, type Socket } from 'socket.io-client';

const DEFAULT_LOCAL_API_URL = 'http://localhost:3000';

interface CursorApiEnvironment {
  PROD?: boolean;
  VITE_API_MODE?: string;
  VITE_FORWARDED_API_URL?: string;
  VITE_LOCAL_API_URL?: string;
}

const normalizeApiUrl = (value: string, isProduction: boolean) => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('Cursor API URL must be a valid absolute URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Cursor API URL must use HTTP or HTTPS');
  }

  if (url.username || url.password) {
    throw new Error('Cursor API URL cannot include credentials');
  }

  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);

  if (isProduction && url.protocol !== 'https:' && !isLoopback) {
    throw new Error('Production cursor API URLs must use HTTPS');
  }

  return url.href.replace(/\/$/, '');
};

export const resolveCursorApiUrl = ({
  PROD: isProduction = false,
  VITE_API_MODE: mode = 'local',
  VITE_FORWARDED_API_URL: forwardedUrl,
  VITE_LOCAL_API_URL: localUrl = DEFAULT_LOCAL_API_URL,
}: CursorApiEnvironment) => {
  if (mode === 'local') {
    return normalizeApiUrl(localUrl, isProduction);
  }

  if (mode === 'forwarded') {
    if (!forwardedUrl) {
      throw new Error(
        'VITE_FORWARDED_API_URL is required when VITE_API_MODE=forwarded',
      );
    }

    return normalizeApiUrl(forwardedUrl, isProduction);
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
