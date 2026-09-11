import { createConnection } from 'node:net';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { createApp } from './app.js';
import { createTestDatabase } from '../test/database.js';

it('shuts down with an unused browser preconnection still open', async () => {
  const app = await createApp({
    database: await createTestDatabase(),
    logger: false,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing address');
  const connected = once(app.server, 'connection');
  const socket = createConnection(address.port, '127.0.0.1');
  const closed = once(socket, 'close');
  try {
    await connected;
    await app.close();
    await closed;
    expect(socket.destroyed).toBe(true);
  } finally {
    socket.destroy();
    await app.close();
  }
});
