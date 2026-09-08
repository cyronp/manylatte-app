import type { IncomingMessage } from 'node:http';
import proxyaddr from '@fastify/proxy-addr';

export type TrustedProxies = false | string[];

export const parseTrustedProxies = (value = 'false'): TrustedProxies => {
  if (value === 'false' || !value.trim()) return false;
  if (value === 'true') {
    throw new Error(
      'TRUST_PROXY must list trusted proxy IPs or CIDRs, not true',
    );
  }
  const addresses = value
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  proxyaddr.compile(addresses);
  return addresses;
};

export const createAddressResolver = (trusted: TrustedProxies = false) => {
  const trust = trusted ? proxyaddr.compile(trusted) : () => false;
  return (request: IncomingMessage) => proxyaddr(request, trust);
};
