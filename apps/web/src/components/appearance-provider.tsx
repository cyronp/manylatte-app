import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

import {
  type Appearance,
  readStoredAppearance,
  shouldUseDarkAppearance,
  writeStoredAppearance,
} from '@/lib/appearance-storage';

const DARK_MODE_MEDIA_QUERY = '(prefers-color-scheme: dark)';

interface AppearanceContextValue {
  appearance: Appearance;
  isDark: boolean;
  setAppearance: (appearance: Appearance) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

const getSystemPrefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia(DARK_MODE_MEDIA_QUERY).matches;

interface AppearanceProviderProps {
  children: ReactNode;
}

export function AppearanceProvider({ children }: AppearanceProviderProps) {
  const [appearance, setAppearanceState] =
    useState<Appearance>(readStoredAppearance);
  const [systemPrefersDark, setSystemPrefersDark] =
    useState(getSystemPrefersDark);
  const isDark = shouldUseDarkAppearance(appearance, systemPrefersDark);

  useEffect(() => {
    const colorScheme = window.matchMedia(DARK_MODE_MEDIA_QUERY);
    const handleColorSchemeChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };

    colorScheme.addEventListener('change', handleColorSchemeChange);
    return () =>
      colorScheme.removeEventListener('change', handleColorSchemeChange);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  const setAppearance = useCallback((nextAppearance: Appearance) => {
    setAppearanceState(nextAppearance);
    writeStoredAppearance(nextAppearance);
  }, []);

  const value = useMemo(
    () => ({ appearance, isDark, setAppearance }),
    [appearance, isDark, setAppearance],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);

  if (!context) {
    throw new Error('useAppearance must be used within an AppearanceProvider');
  }

  return context;
}
