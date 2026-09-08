const DEFAULT_LOCAL_API_URL = 'http://localhost:3000';

interface CursorApiEnvironment {
  PROD?: boolean;
  VITE_API_MODE?: string;
  VITE_FORWARDED_API_URL?: string;
  VITE_LOCAL_API_URL?: string;
}

const normalizeApiUrl = (value: string, isProduction: boolean) => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('Cursor API URL must be a valid absolute URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Cursor API URL must use HTTP or HTTPS');
  }

  if (url.username || url.password) {
    throw new Error('Cursor API URL cannot include credentials');
  }

  if (url.pathname !== '/' || url.search || url.hash)
    throw new Error(
      'Cursor API URL must be an origin without a path, query, or fragment',
    );

  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

  if (isProduction && url.protocol !== 'https:' && !isLoopback) {
    throw new Error('Production cursor API URLs must use HTTPS');
  }

  return url.origin;
};

export const resolveCursorApiUrl = ({
  PROD: isProduction = false,
  VITE_API_MODE: mode = 'local',
  VITE_FORWARDED_API_URL: forwardedUrl,
  VITE_LOCAL_API_URL: localUrl = DEFAULT_LOCAL_API_URL,
}: CursorApiEnvironment) => {
  if (mode === 'local') {
    return normalizeApiUrl(localUrl, isProduction);
  }

  if (mode === 'forwarded') {
    if (!forwardedUrl) {
      throw new Error(
        'VITE_FORWARDED_API_URL is required when VITE_API_MODE=forwarded',
      );
    }

    return normalizeApiUrl(forwardedUrl, isProduction);
  }

  throw new Error(`Unsupported VITE_API_MODE: ${mode}`);
};
