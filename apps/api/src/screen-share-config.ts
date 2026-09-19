import { createHmac } from 'node:crypto';
import type { ScreenShareIceServer } from '@app/shared';

export interface ScreenShareConfig {
  stunUrls: string[];
  turnUrls: string[];
  turnSecret?: string;
}

export function readScreenShareConfig(
  environment: NodeJS.ProcessEnv,
): ScreenShareConfig {
  const urls = (value: string, protocol: RegExp, name: string) => {
    const list = value
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
    if (
      list.length > 8 ||
      list.some((url) => !protocol.test(url) || /\s/.test(url))
    )
      throw new Error(
        `Invalid API environment: ${name} contains invalid ICE URLs`,
      );
    return list;
  };
  const stunUrls = urls(
    environment.WEBRTC_STUN_URLS ?? 'stun:stun.l.google.com:19302',
    /^stuns?:[^/?#]+$/,
    'WEBRTC_STUN_URLS',
  );
  const turnUrls = urls(
    environment.WEBRTC_TURN_URLS ?? '',
    /^turns?:[^/?#]+(?:\?transport=(?:udp|tcp))?$/,
    'WEBRTC_TURN_URLS',
  );
  const turnSecret = environment.WEBRTC_TURN_SECRET || undefined;
  if (Boolean(turnUrls.length) !== Boolean(turnSecret))
    throw new Error(
      'Invalid API environment: WEBRTC_TURN_URLS and WEBRTC_TURN_SECRET must be configured together',
    );
  return { stunUrls, turnUrls, turnSecret };
}

export function screenShareIceServers(
  config: ScreenShareConfig,
  socketId: string,
): ScreenShareIceServer[] {
  const servers: ScreenShareIceServer[] = config.stunUrls.length
    ? [{ urls: config.stunUrls }]
    : [];
  if (config.turnUrls.length && config.turnSecret) {
    // Coturn REST authentication: the shared secret stays on the API server.
    const username = `${Math.floor(Date.now() / 1000) + 86_400}:${socketId}`;
    servers.push({
      urls: config.turnUrls,
      username,
      credential: createHmac('sha1', config.turnSecret)
        .update(username)
        .digest('base64'),
    });
  }
  return servers;
}
