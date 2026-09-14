export const USER_PREFERENCES_STORAGE_KEY = 'manylatte:user-preferences';

export type MouseWheelBehavior = 'pan' | 'zoom';

export interface UserPreferences {
  mouseWheelBehavior: MouseWheelBehavior;
  remoteCursorOpacity: number;
  showGrid: boolean;
  snapToGrid: boolean;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  mouseWheelBehavior: 'pan',
  remoteCursorOpacity: 100,
  showGrid: true,
  snapToGrid: false,
};

type StorageReaderProvider = () => Pick<Storage, 'getItem'>;
type StorageWriterProvider = () => Pick<Storage, 'setItem'>;

const isMouseWheelBehavior = (value: unknown): value is MouseWheelBehavior =>
  value === 'pan' || value === 'zoom';

const normalizeRemoteCursorOpacity = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : DEFAULT_USER_PREFERENCES.remoteCursorOpacity;

export const readStoredUserPreferences = (
  getStorage: StorageReaderProvider = () => window.localStorage,
): UserPreferences => {
  try {
    const stored = JSON.parse(
      getStorage().getItem(USER_PREFERENCES_STORAGE_KEY) ?? '{}',
    ) as Record<string, unknown>;

    return {
      mouseWheelBehavior: isMouseWheelBehavior(stored.mouseWheelBehavior)
        ? stored.mouseWheelBehavior
        : DEFAULT_USER_PREFERENCES.mouseWheelBehavior,
      remoteCursorOpacity: normalizeRemoteCursorOpacity(
        stored.remoteCursorOpacity,
      ),
      showGrid:
        typeof stored.showGrid === 'boolean'
          ? stored.showGrid
          : DEFAULT_USER_PREFERENCES.showGrid,
      snapToGrid:
        typeof stored.snapToGrid === 'boolean'
          ? stored.snapToGrid
          : DEFAULT_USER_PREFERENCES.snapToGrid,
    };
  } catch {
    return DEFAULT_USER_PREFERENCES;
  }
};

export const writeStoredUserPreferences = (
  preferences: UserPreferences,
  getStorage: StorageWriterProvider = () => window.localStorage,
) => {
  try {
    getStorage().setItem(
      USER_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
    return true;
  } catch {
    return false;
  }
};
