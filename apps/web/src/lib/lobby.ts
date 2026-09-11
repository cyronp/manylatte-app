import {
  cursorRoomIdSchema,
  lobbyCreatedSchema,
  lobbySchema,
} from '@app/shared';
import { saveLobbyCredential } from './lobby-credential';

import { resolveCursorApiUrl } from './socket';

export const lobbySearch = (
  search: Record<string, unknown>,
): { lobby?: string } => ({
  lobby:
    search.lobby === undefined
      ? undefined
      : typeof search.lobby === 'string'
        ? search.lobby
        : '',
});

export const lobbyInviteUrl = (pageUrl: string, roomId: string) => {
  const url = new URL(pageUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('lobby', roomId);
  return url.href;
};

const requestLobby = async (path: string, options?: RequestInit) => {
  const response = await fetch(
    `${resolveCursorApiUrl(import.meta.env)}/lobbies${path}`,
    {
      ...options,
      signal: options?.signal ?? AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    if (response.status === 404)
      throw new Error('This lobby does not exist. Check the invite link.');
    if (response.status === 429)
      throw new Error('Too many requests. Please try again in a minute.');
    throw new Error('Could not reach the lobby. Please try again.');
  }
  return response.json() as Promise<unknown>;
};

export const loadLobby = (roomId: string, signal: AbortSignal) => {
  const result = cursorRoomIdSchema.safeParse(roomId);
  if (!result.success)
    return Promise.reject(
      new Error('Invalid lobby link. Ask your friend for a new invite.'),
    );
  return requestLobby(`/${encodeURIComponent(result.data)}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  }).then((data) => lobbySchema.parse(data));
};

export const createLobby = async (name: string) => {
  const created = lobbyCreatedSchema.parse(
    await requestLobby('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  );
  saveLobbyCredential(created.id, created.token);
  return lobbySchema.parse(created);
};
