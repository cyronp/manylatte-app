import { io, type Socket } from 'socket.io-client';
import { expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { createTestDatabase } from '../../test/database.js';

it('admits one participant when authorizations finish concurrently', async () => {
  const database = await createTestDatabase();
  await database.lobby.create({
    data: { id: 'race', code: 'RACE-0001', name: 'Race' },
  });
  const app = await createApp({
    database,
    logger: false,
    maxParticipantsPerRoom: 1,
  });
  const original = database.lobby.findUnique.bind(database.lobby);
  const releases: (() => void)[] = [];
  vi.spyOn(database.lobby, 'findUnique').mockImplementation(async (args) => {
    if (args.select?.id)
      await new Promise<void>((resolve) => releases.push(resolve));
    return original(args);
  });
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  const clients: Socket[] = [];
  try {
    const outcomes = Array.from(
      { length: 5 },
      () =>
        new Promise<string>((resolve) => {
          const client = io(url, {
            auth: { roomId: 'race' },
            transports: ['websocket'],
            reconnection: false,
          });
          clients.push(client);
          client.once('connect', () => resolve('connected'));
          client.once('connect_error', (error) => resolve(error.message));
        }),
    );
    await vi.waitFor(() => expect(releases).toHaveLength(5));
    releases.forEach((release) => release());
    expect(
      (await Promise.all(outcomes)).filter((value) => value === 'connected'),
    ).toHaveLength(1);
  } finally {
    clients.forEach((client) => client.disconnect());
    await app.close();
  }
});

it('charges invalid-room attempts before looking up another room', async () => {
  const database = await createTestDatabase();
  const app = await createApp({
    database,
    logger: false,
    maxConnectionsPerIp: 1,
  });
  const lookup = vi.spyOn(database.lobby, 'findUnique');
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  try {
    for (let i = 0; i < 3; i++) {
      const client = io(url, {
        auth: { roomId: 'missing' },
        transports: ['websocket'],
        reconnection: false,
      });
      try {
        await new Promise<void>((resolve) =>
          client.once('connect_error', () => resolve()),
        );
      } finally {
        client.disconnect();
      }
    }
    expect(lookup).toHaveBeenCalledTimes(1);
  } finally {
    await app.close();
  }
});
