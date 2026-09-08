import type { IncomingMessage } from 'node:http';
import { expect, it } from 'vitest';
import {
  createAddressResolver,
  parseTrustedProxies,
} from './client-address.js';

it('ignores spoofed headers and stops at the first untrusted hop', () => {
  const request = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.10' },
  } as IncomingMessage;
  expect(createAddressResolver()(request)).toBe('127.0.0.1');
  expect(createAddressResolver(['loopback'])(request)).toBe('203.0.113.10');
  expect(() => parseTrustedProxies('true')).toThrow(/not true/);
  expect(() => parseTrustedProxies('invalid')).toThrow();
});
