import { z } from 'zod';
import { DEFAULT_DATABASE_URL, resolveDatabaseUrl } from '@app/db';

import {
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_CURSOR_CONNECTION_IDLE_TIMEOUT_MS,
  DEFAULT_CURSOR_MAX_CONNECTIONS_PER_IP,
  DEFAULT_CURSOR_MAX_PARTICIPANTS_PER_ROOM,
  DEFAULT_CURSOR_MAX_TOTAL_CONNECTIONS,
  DEFAULT_SOCKET_MAX_HTTP_BUFFER_BYTES,
} from './security-config.js';

const redisUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      return ['redis:', 'rediss:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, 'must be a valid redis:// or rediss:// URL');

const rawApiEnvironmentSchema = z.object({
  DATABASE_URL: z.string().default(DEFAULT_DATABASE_URL),
  ALLOWED_ORIGINS: z.string().optional(),
  CURSOR_CONNECTION_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(30_000)
    .default(DEFAULT_CURSOR_CONNECTION_IDLE_TIMEOUT_MS),
  CURSOR_MAX_CONNECTIONS_PER_IP: z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .default(DEFAULT_CURSOR_MAX_CONNECTIONS_PER_IP),
  CURSOR_MAX_PARTICIPANTS_PER_ROOM: z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .default(DEFAULT_CURSOR_MAX_PARTICIPANTS_PER_ROOM),
  CURSOR_MAX_TOTAL_CONNECTIONS: z.coerce
    .number()
    .int()
    .min(1)
    .max(100_000)
    .default(DEFAULT_CURSOR_MAX_TOTAL_CONNECTIONS),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  REDIS_URL: redisUrlSchema.optional(),
  SOCKET_MAX_HTTP_BUFFER_BYTES: z.coerce
    .number()
    .int()
    .min(512)
    .max(65_536)
    .default(DEFAULT_SOCKET_MAX_HTTP_BUFFER_BYTES),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

const parseAllowedOrigins = (
  configuredOrigins: string | undefined,
  nodeEnvironment: 'development' | 'production' | 'test',
) => {
  const origins = configuredOrigins
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const selectedOrigins =
    origins && origins.length > 0
      ? origins
      : nodeEnvironment === 'production'
        ? []
        : [...DEFAULT_ALLOWED_ORIGINS];

  if (selectedOrigins.length === 0) {
    throw new Error(
      'Invalid API environment: ALLOWED_ORIGINS is required in production',
    );
  }

  return selectedOrigins.map((origin) => {
    let parsedOrigin: URL;

    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error(
        `Invalid API environment: ALLOWED_ORIGINS contains an invalid URL: ${origin}`,
      );
    }

    if (
      !['http:', 'https:'].includes(parsedOrigin.protocol) ||
      parsedOrigin.origin !== origin
    ) {
      throw new Error(
        `Invalid API environment: ALLOWED_ORIGINS must contain exact HTTP origins without paths: ${origin}`,
      );
    }

    if (
      nodeEnvironment === 'production' &&
      parsedOrigin.protocol !== 'https:'
    ) {
      throw new Error(
        `Invalid API environment: production origins must use HTTPS: ${origin}`,
      );
    }

    return parsedOrigin.origin;
  });
};

export const readApiEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
) => {
  const result = rawApiEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    const issues = result.error.issues
      .map(
        (issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`,
      )
      .join('; ');
    throw new Error(`Invalid API environment: ${issues}`);
  }

  return {
    databaseUrl: resolveDatabaseUrl(result.data.DATABASE_URL),
    allowedOrigins: parseAllowedOrigins(
      result.data.ALLOWED_ORIGINS,
      result.data.NODE_ENV,
    ),
    connectionIdleTimeoutMs: result.data.CURSOR_CONNECTION_IDLE_TIMEOUT_MS,
    maxConnectionsPerIp: result.data.CURSOR_MAX_CONNECTIONS_PER_IP,
    maxHttpBufferBytes: result.data.SOCKET_MAX_HTTP_BUFFER_BYTES,
    maxParticipantsPerRoom: result.data.CURSOR_MAX_PARTICIPANTS_PER_ROOM,
    maxTotalConnections: result.data.CURSOR_MAX_TOTAL_CONNECTIONS,
    nodeEnvironment: result.data.NODE_ENV,
    port: result.data.PORT,
    redisUrl: result.data.REDIS_URL,
    trustProxy: result.data.TRUST_PROXY,
  };
};
