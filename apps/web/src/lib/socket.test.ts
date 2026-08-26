import { describe, expect, it } from 'vitest';

import { resolveCursorApiUrl } from './socket';

describe('cursor API URL', () => {
  it('uses localhost by default', () => {
    expect(resolveCursorApiUrl({})).toBe('http://localhost:3000');
  });

  it('selects the configured local URL', () => {
    expect(
      resolveCursorApiUrl({
        VITE_API_MODE: 'local',
        VITE_LOCAL_API_URL: 'http://api.internal:4000',
      }),
    ).toBe('http://api.internal:4000');
  });

  it('selects the forwarded URL', () => {
    expect(
      resolveCursorApiUrl({
        VITE_API_MODE: 'forwarded',
        VITE_FORWARDED_API_URL: 'https://api-tunnel.example',
      }),
    ).toBe('https://api-tunnel.example');
  });

  it('rejects missing forwarded configuration and unsupported modes', () => {
    expect(() => resolveCursorApiUrl({ VITE_API_MODE: 'forwarded' })).toThrow(
      /VITE_FORWARDED_API_URL/,
    );
    expect(() => resolveCursorApiUrl({ VITE_API_MODE: 'staging' })).toThrow(
      /Unsupported VITE_API_MODE/,
    );
  });

  it('rejects unsafe API URLs', () => {
    expect(() =>
      resolveCursorApiUrl({
        VITE_API_MODE: 'forwarded',
        VITE_FORWARDED_API_URL: 'javascript:alert(1)',
      }),
    ).toThrow(/HTTP or HTTPS/);
    expect(() =>
      resolveCursorApiUrl({
        PROD: true,
        VITE_API_MODE: 'forwarded',
        VITE_FORWARDED_API_URL: 'http://api.example',
      }),
    ).toThrow(/must use HTTPS/);
    expect(() =>
      resolveCursorApiUrl({
        VITE_API_MODE: 'forwarded',
        VITE_FORWARDED_API_URL: 'https://user:secret@api.example',
      }),
    ).toThrow(/credentials/);
  });
});
