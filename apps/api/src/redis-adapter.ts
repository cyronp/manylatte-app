import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

import type { CursorIo } from './cursor/cursor-server.js';

interface RedisLogger {
  error: (context: object, message: string) => void;
}

export const attachRedisAdapter = async (
  io: CursorIo,
  redisUrl: string,
  logger: RedisLogger,
) => {
  const publisher = createClient({ url: redisUrl });
  const subscriber = publisher.duplicate();

  publisher.on('error', (error) => {
    logger.error({ error }, 'Cursor Redis publisher error');
  });
  subscriber.on('error', (error) => {
    logger.error({ error }, 'Cursor Redis subscriber error');
  });

  await Promise.all([publisher.connect(), subscriber.connect()]);
  io.adapter(createAdapter(publisher, subscriber));

  return async () => {
    await Promise.all([publisher.close(), subscriber.close()]);
  };
};
