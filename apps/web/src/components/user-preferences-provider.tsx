import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import {
  type MouseWheelBehavior,
  readStoredUserPreferences,
  type UserPreferences,
  writeStoredUserPreferences,
} from '@/lib/user-preferences-storage';

interface UserPreferencesContextValue extends UserPreferences {
  setMouseWheelBehavior: (behavior: MouseWheelBehavior) => void;
  setRemoteCursorOpacity: (opacity: number) => void;
  setShowGrid: (showGrid: boolean) => void;
  setSnapToGrid: (snapToGrid: boolean) => void;
}

const UserPreferencesContext =
  createContext<UserPreferencesContextValue | null>(null);

interface UserPreferencesProviderProps {
  children: ReactNode;
}

export function UserPreferencesProvider({
  children,
}: UserPreferencesProviderProps) {
  const [preferences, setPreferences] = useState(readStoredUserPreferences);

  const updatePreference = useCallback(
    <Key extends keyof UserPreferences>(
      key: Key,
      value: UserPreferences[Key],
    ) => {
      setPreferences((current) => {
        const next = { ...current, [key]: value };
        writeStoredUserPreferences(next);
        return next;
      });
    },
    [],
  );

  const value = useMemo<UserPreferencesContextValue>(
    () => ({
      ...preferences,
      setMouseWheelBehavior: (behavior) =>
        updatePreference('mouseWheelBehavior', behavior),
      setRemoteCursorOpacity: (opacity) =>
        updatePreference('remoteCursorOpacity', opacity),
      setShowGrid: (showGrid) => updatePreference('showGrid', showGrid),
      setSnapToGrid: (snapToGrid) => updatePreference('snapToGrid', snapToGrid),
    }),
    [preferences, updatePreference],
  );

  return (
    <UserPreferencesContext.Provider value={value}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext);

  if (!context) {
    throw new Error(
      'useUserPreferences must be used within a UserPreferencesProvider',
    );
  }

  return context;
}
