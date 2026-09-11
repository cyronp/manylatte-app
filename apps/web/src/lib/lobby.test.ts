// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLobbyCredential } from './lobby-credential';

import { createLobby, loadLobby, lobbyInviteUrl, lobbySearch } from './lobby';

afterEach(() => vi.unstubAllGlobals());

describe('lobby invites', () => {
  it('round-trips invite IDs and removes unrelated search and hash data', () => {
    const invite = lobbyInviteUrl(
      'https://manylatte.example/?lobby=old&extra=secret#canvas',
      'AB12-CD34',
    );
    expect(invite).toBe('https://manylatte.example/?lobby=AB12-CD34');
    expect(
      lobbySearch(Object.fromEntries(new URL(invite).searchParams)),
    ).toEqual({ lobby: 'AB12-CD34' });
  });

  it('keeps the home page disconnected and rejects malformed invites', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(lobbySearch({})).toEqual({ lobby: undefined });
    for (const value of ['', 123, ['friends'], 'bad id']) {
      const { lobby } = lobbySearch({ lobby: value });
      await expect(
        loadLobby(lobby!, new AbortController().signal),
      ).rejects.toThrow('Invalid lobby link');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('persists a lobby before returning the invite and reports missing lobbies', async () => {
    const token = crypto.randomUUID();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'friends',
            code: 'AB12-CD34',
            name: 'Friends',
            token,
          }),
          {
            status: 201,
          },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await createLobby('Friends')).toEqual({
      id: 'friends',
      code: 'AB12-CD34',
      name: 'Friends',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/lobbies$/),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Friends' }),
      }),
    );
    expect(getLobbyCredential('friends')).toBe(token);
    expect(localStorage.getItem('manylatte:lobby-credential:friends')).toBe(
      token,
    );
    await expect(
      loadLobby('missing', new AbortController().signal),
    ).rejects.toThrow('does not exist');
  });
});
