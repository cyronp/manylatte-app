import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  readScreenShareConfig,
  SCREEN_SHARE_TURN_CREDENTIAL_TTL_SECONDS,
  screenShareIceServers,
} from './screen-share-config.js';

describe('screen share network configuration', () => {
  it('issues temporary TURN credentials without exposing the server secret', () => {
    const config = readScreenShareConfig({
      WEBRTC_STUN_URLS: '',
      WEBRTC_TURN_URLS:
        'turn:relay.example:3478,turns:relay.example:5349?transport=tcp',
      WEBRTC_TURN_SECRET: 'server-only-secret',
    });
    const [server] = screenShareIceServers(config, 'socket-id');
    expect(server.username).toMatch(/^\d+:socket-id$/);
    expect(server.credential).toBe(
      createHmac('sha1', 'server-only-secret')
        .update(server.username!)
        .digest('base64'),
    );
    expect(JSON.stringify(server)).not.toContain('server-only-secret');
    const expiresAt = Number(server.username!.split(':')[0]);
    expect(expiresAt).toBeGreaterThan(Date.now() / 1000);
    expect(expiresAt).toBeLessThanOrEqual(
      Math.ceil(Date.now() / 1000) + SCREEN_SHARE_TURN_CREDENTIAL_TTL_SECONDS,
    );
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
