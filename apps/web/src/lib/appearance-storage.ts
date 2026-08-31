export const APPEARANCE_STORAGE_KEY = 'manylatte:appearance';

export type Appearance = 'dark' | 'light' | 'system';

type StorageReaderProvider = () => Pick<Storage, 'getItem'>;
type StorageWriterProvider = () => Pick<Storage, 'setItem'>;

const isAppearance = (value: string | null): value is Appearance =>
  value === 'dark' || value === 'light' || value === 'system';

export const readStoredAppearance = (
  getStorage: StorageReaderProvider = () => window.localStorage,
): Appearance => {
  try {
    const appearance = getStorage().getItem(APPEARANCE_STORAGE_KEY);
    return isAppearance(appearance) ? appearance : 'system';
  } catch {
    return 'system';
  }
};

export const writeStoredAppearance = (
  appearance: Appearance,
  getStorage: StorageWriterProvider = () => window.localStorage,
) => {
  try {
    getStorage().setItem(APPEARANCE_STORAGE_KEY, appearance);
    return true;
  } catch {
    return false;
  }
};

export const shouldUseDarkAppearance = (
  appearance: Appearance,
  systemPrefersDark: boolean,
) => appearance === 'dark' || (appearance === 'system' && systemPrefersDark);
