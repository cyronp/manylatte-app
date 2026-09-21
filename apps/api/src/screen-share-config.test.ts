import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  readScreenShareConfig,
  SCREEN_SHARE_TURN_CREDENTIAL_TTL_SECONDS,
  screenShareIceServers,
} from './screen-share-config.js';

describe('screen share network configuration', () => {
  it('issues temporary TURN credentials without exposing the server secret', () => {
    const secret = 'server-only-secret-with-at-least-32-bytes';
    const config = readScreenShareConfig({
      WEBRTC_STUN_URLS: '',
      WEBRTC_TURN_URLS:
        'turn:relay.example:3478,turns:relay.example:5349?transport=tcp',
      WEBRTC_TURN_SECRET: secret,
    });
    const [server] = screenShareIceServers(config, 'socket-id');
    expect(server.username).toMatch(/^\d+:socket-id$/);
    expect(server.credential).toBe(
      createHmac('sha1', secret).update(server.username!).digest('base64'),
    );
    expect(JSON.stringify(server)).not.toContain(secret);
    const expiresAt = Number(server.username!.split(':')[0]);
    expect(expiresAt).toBeGreaterThan(Date.now() / 1000);
    expect(expiresAt).toBeLessThanOrEqual(
      Math.ceil(Date.now() / 1000) + SCREEN_SHARE_TURN_CREDENTIAL_TTL_SECONDS,
    );
  });
  it('rejects short or whitespace-containing TURN secrets without exposing them', () => {
    for (const secret of [
      'short-secret',
      'x'.repeat(31),
      ' '.repeat(64),
      'x'.repeat(32) + '\n',
    ]) {
      expect(() =>
        readScreenShareConfig({
          WEBRTC_TURN_URLS: 'turn:relay.example',
          WEBRTC_TURN_SECRET: secret,
        }),
      ).toThrow(
        'WEBRTC_TURN_SECRET must contain at least 32 bytes and no whitespace',
      );
    }
  });
  it('rejects invalid or incomplete relay configuration and supports local-only discovery', () => {
    expect(() =>
      readScreenShareConfig({ WEBRTC_STUN_URLS: 'https://invalid' }),
    ).toThrow(/WEBRTC_STUN_URLS/);
    expect(() =>
      readScreenShareConfig({ WEBRTC_TURN_URLS: 'turn:relay.example' }),
    ).toThrow(/configured together/);
    expect(() =>
      readScreenShareConfig({ WEBRTC_TURN_SECRET: 'secret' }),
    ).toThrow(/configured together/);
    expect(
      screenShareIceServers(
        readScreenShareConfig({ WEBRTC_STUN_URLS: '' }),
        'socket',
      ),
    ).toEqual([]);
  });
});
