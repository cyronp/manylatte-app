import { cursorUsernameSchema, type CursorUsername } from '@app/shared';

export const USERNAME_STORAGE_KEY = 'manylatte:username';

type StorageReaderProvider = () => Pick<Storage, 'getItem'>;
type StorageWriterProvider = () => Pick<Storage, 'setItem'>;

export const readStoredCursorUsername = (
  getStorage: StorageReaderProvider = () => window.localStorage,
) => {
  try {
    const storedUsername = getStorage().getItem(USERNAME_STORAGE_KEY);
    const result = cursorUsernameSchema.safeParse(storedUsername);
    return result.success ? result.data : '';
  } catch {
    return '';
  }
};

export const writeStoredCursorUsername = (
  username: CursorUsername,
  getStorage: StorageWriterProvider = () => window.localStorage,
) => {
  try {
    getStorage().setItem(USERNAME_STORAGE_KEY, username);
    return true;
  } catch {
    return false;
  }
};
