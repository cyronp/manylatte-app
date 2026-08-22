import { describe, expect, it, vi } from 'vitest';

import {
  readStoredCursorUsername,
  USERNAME_STORAGE_KEY,
  writeStoredCursorUsername,
} from './username-storage';

describe('cursor username storage', () => {
  it('reads and normalizes a valid stored username', () => {
    const getItem = vi.fn(() => '  Espresso Fan  ');

    expect(readStoredCursorUsername(() => ({ getItem }))).toBe('Espresso Fan');
    expect(getItem).toHaveBeenCalledWith(USERNAME_STORAGE_KEY);
  });

  it('ignores invalid and unavailable storage values', () => {
    expect(readStoredCursorUsername(() => ({ getItem: () => '   ' }))).toBe('');
    expect(
      readStoredCursorUsername(() => {
        throw new Error('Storage unavailable');
      }),
    ).toBe('');
  });

  it('stores a validated username and tolerates write failures', () => {
    const setItem = vi.fn();

    expect(
      writeStoredCursorUsername('Latte Lover', () => ({
        setItem,
      })),
    ).toBe(true);
    expect(setItem).toHaveBeenCalledWith(USERNAME_STORAGE_KEY, 'Latte Lover');
    expect(
      writeStoredCursorUsername('Latte Lover', () => {
        throw new Error('Storage unavailable');
      }),
    ).toBe(false);
  });
});
