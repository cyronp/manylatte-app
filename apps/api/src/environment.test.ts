import { describe, expect, it } from 'vitest';

import { readApiEnvironment } from './environment.js';
import { DEFAULT_ALLOWED_ORIGINS } from './security-config.js';

describe('API environment', () => {
  it('uses safe local development defaults', () => {
    const environment = readApiEnvironment({});

    expect(environment.allowedOrigins).toEqual(DEFAULT_ALLOWED_ORIGINS);
    expect(environment.maxHttpBufferBytes).toBe(4_096);
    expect(environment.port).toBe(3_000);
    expect(environment.databaseUrl).toMatch(/^file:.*manylatte\.db$/);
  });

  it('rejects non-SQLite database URLs', () => {
    expect(() =>
      readApiEnvironment({ DATABASE_URL: 'postgresql://localhost/old' }),
    ).toThrow(/SQLite/);
    expect(() => readApiEnvironment({ DATABASE_URL: 'file:' })).toThrow(
      /SQLite/,
    );
  });

  it('parses explicit production security settings', () => {
    const environment = readApiEnvironment({
      ALLOWED_ORIGINS: 'https://app.example,https://admin.example',
      CURSOR_MAX_CONNECTIONS_PER_IP: '12',
      NODE_ENV: 'production',
      PORT: '8080',
      REDIS_URL: 'rediss://redis.example:6380',
      TRUST_PROXY: 'true',
    });

    expect(environment.allowedOrigins).toEqual([
      'https://app.example',
      'https://admin.example',
    ]);
    expect(environment.maxConnectionsPerIp).toBe(12);
    expect(environment.port).toBe(8_080);
    expect(environment.trustProxy).toBe(true);
  });

  it('fails closed for missing or insecure production origins', () => {
    expect(() => readApiEnvironment({ NODE_ENV: 'production' })).toThrow(
      /ALLOWED_ORIGINS is required/,
    );
    expect(() =>
      readApiEnvironment({
        ALLOWED_ORIGINS: 'http://app.example',
        NODE_ENV: 'production',
      }),
    ).toThrow(/must use HTTPS/);
  });

  it('rejects malformed ports, Redis URLs, and origins with paths', () => {
    expect(() => readApiEnvironment({ PORT: '70000' })).toThrow(/PORT/);
    expect(() =>
      readApiEnvironment({ REDIS_URL: 'https://redis.example' }),
    ).toThrow(/REDIS_URL/);
    expect(() =>
      readApiEnvironment({ ALLOWED_ORIGINS: 'https://app.example/path' }),
    ).toThrow(/without paths/);
  });
});
