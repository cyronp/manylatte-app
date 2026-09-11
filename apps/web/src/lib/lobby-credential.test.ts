// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { getLobbyCredential, saveLobbyCredential } from './lobby-credential';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it('reuses a private credential per lobby without reusing public invite IDs', () => {
  const roomId = crypto.randomUUID();
  const token = getLobbyCredential(roomId);
  expect(token).not.toBe(roomId);
  expect(getLobbyCredential(roomId)).toBe(token);
  expect(getLobbyCredential('another-room')).not.toBe(token);
  expect(localStorage.getItem(`manylatte:lobby-credential:${roomId}`)).toBe(
    token,
  );
});

it('keeps the creator credential and recovers it after a page reload', async () => {
  const token = crypto.randomUUID();
  saveLobbyCredential('created', token);
  vi.resetModules();
  const reloaded = await import('./lobby-credential');
  expect(reloaded.getLobbyCredential('created')).toBe(token);
});

it('retains identity in memory when storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Disabled');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Disabled');
  });
  const token = getLobbyCredential('private');
  expect(getLobbyCredential('private')).toBe(token);
  const ownerToken = crypto.randomUUID();
  saveLobbyCredential('private-owner', ownerToken);
  expect(getLobbyCredential('private-owner')).toBe(ownerToken);
});
