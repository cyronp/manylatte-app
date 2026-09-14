import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_USER_PREFERENCES,
  readStoredUserPreferences,
  USER_PREFERENCES_STORAGE_KEY,
  writeStoredUserPreferences,
} from './user-preferences-storage';

describe('user preferences storage', () => {
  it('reads valid stored preferences', () => {
    const stored = {
      mouseWheelBehavior: 'zoom',
      remoteCursorOpacity: 60,
      showGrid: false,
      snapToGrid: true,
    };

    expect(
      readStoredUserPreferences(() => ({
        getItem: () => JSON.stringify(stored),
      })),
    ).toEqual(stored);
  });

  it('fills missing and invalid values with defaults', () => {
    expect(
      readStoredUserPreferences(() => ({
        getItem: () =>
          JSON.stringify({
            mouseWheelBehavior: 'rotate',
            remoteCursorOpacity: 'quiet',
            showGrid: false,
          }),
      })),
    ).toEqual({ ...DEFAULT_USER_PREFERENCES, showGrid: false });
  });

  it('clamps cursor opacity to the supported percentage range', () => {
    expect(
      readStoredUserPreferences(() => ({
        getItem: () => JSON.stringify({ remoteCursorOpacity: 140 }),
      })).remoteCursorOpacity,
    ).toBe(100);
    expect(
      readStoredUserPreferences(() => ({
        getItem: () => JSON.stringify({ remoteCursorOpacity: -20 }),
      })).remoteCursorOpacity,
    ).toBe(0);
  });

  it('returns defaults when storage is corrupt or unavailable', () => {
    expect(
      readStoredUserPreferences(() => ({ getItem: () => 'not-json' })),
    ).toEqual(DEFAULT_USER_PREFERENCES);
    expect(
      readStoredUserPreferences(() => {
        throw new Error('Storage unavailable');
      }),
    ).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it('stores preferences and tolerates write failures', () => {
    const setItem = vi.fn();

    expect(
      writeStoredUserPreferences(DEFAULT_USER_PREFERENCES, () => ({
        setItem,
      })),
    ).toBe(true);
    expect(setItem).toHaveBeenCalledWith(
      USER_PREFERENCES_STORAGE_KEY,
      JSON.stringify(DEFAULT_USER_PREFERENCES),
    );
    expect(
      writeStoredUserPreferences(DEFAULT_USER_PREFERENCES, () => {
        throw new Error('Storage unavailable');
      }),
    ).toBe(false);
  });
});
