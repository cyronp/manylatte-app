import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  canvasCommandSchema,
  canvasNodeMutationSchema,
  hexColorSchema,
  type CanvasNodeMutation,
} from '@app/shared';
import { createTestDatabase } from '../../test/database.js';
import { createCanvasPersistence } from './canvas-persistence.js';
import { PersistentCanvas } from './persistent-canvas.js';

it('persists Post-it text and ownership and rejects edits by another user', async () => {
  const database = await createTestDatabase();
  const owner = {
    userId: randomUUID(),
    username: 'Alice',
    color: hexColorSchema.parse('#193CB8'),
  };
  const visitor = { ...owner, userId: randomUUID(), username: 'Bob' };
  try {
    await database.lobby.create({
      data: { id: 'room', code: 'TEST-0001', name: 'Test' },
    });
    const persistence = createCanvasPersistence(database);
    const canvas = new PersistentCanvas('room', persistence);
    const nodeId = randomUUID();
    const execute = (mutation: CanvasNodeMutation, user = owner) =>
      canvas.execute(
        { id: randomUUID(), body: { type: 'mutation', mutation } },
        user,
      );
    expect(
      await execute({
        action: 'create',
        node: {
          id: nodeId,
          position: { x: 20, y: 30 },
          type: 'postit',
          data: { text: '' },
        },
      }),
    ).toMatchObject({ result: { ok: true } });
    expect(
      await execute({
        action: 'update-postit',
        nodeId,
        text: '  First line\nSecond line ☕',
      }),
    ).toMatchObject({ result: { ok: true } });
    expect(
      await execute(
        { action: 'update-postit', nodeId, text: 'Overwrite' },
        visitor,
      ),
    ).toMatchObject({
      result: { ok: false, message: 'Only the owner can edit this Post-it.' },
    });
    const reloaded = new PersistentCanvas('room', persistence);
    expect(
      await execute({ action: 'update-postit', nodeId, color: 'purple' }),
    ).toMatchObject({
      result: {
        ok: true,
        change: {
          type: 'upsert',
          node: {
            data: { color: 'purple', text: '  First line\nSecond line ☕' },
          },
        },
      },
    });
    expect(
      await execute(
        { action: 'update-postit', nodeId, color: 'green' },
        visitor,
      ),
    ).toMatchObject({
      result: { ok: false, message: 'Only the owner can edit this Post-it.' },
    });
    expect(await reloaded.snapshot()).toMatchObject([
      {
        id: nodeId,
        type: 'postit',
        data: {
          user: owner,
          text: '  First line\nSecond line ☕',
          color: 'purple',
        },
      },
    ]);
    expect(
      await reloaded.execute(
        {
          id: randomUUID(),
          body: {
            type: 'mutation',
            mutation: { action: 'update-postit', nodeId, text: '' },
          },
        },
        owner,
      ),
    ).toMatchObject({ result: { ok: true } });
    expect(
      await new PersistentCanvas('room', persistence).snapshot(),
    ).toMatchObject([{ data: { text: '', user: owner, color: 'purple' } }]);
    expect(
      await execute({
        action: 'update-postit',
        nodeId: randomUUID(),
        text: 'Missing',
      }),
    ).toMatchObject({ result: { ok: false } });
    expect(await execute({ action: 'delete', nodeId })).toMatchObject({
      result: { ok: true, change: { type: 'remove', nodeId } },
    });
    expect(await new PersistentCanvas('room', persistence).snapshot()).toEqual(
      [],
    );
  } finally {
    await database.$disconnect();
  }
});

it('accepts only predefined colors and rejects empty Post-it updates', () => {
  const mutation = { action: 'update-postit', nodeId: randomUUID() };
  for (const color of ['yellow', 'pink', 'blue', 'green', 'purple']) {
    expect(
      canvasNodeMutationSchema.safeParse({ ...mutation, color }).success,
    ).toBe(true);
  }
  expect(
    canvasNodeMutationSchema.safeParse({ ...mutation, color: 'red' }).success,
  ).toBe(false);
  expect(canvasNodeMutationSchema.safeParse(mutation).success).toBe(false);
});

it('bounds Post-it text and rejects client-supplied ownership', () => {
  const command = {
    id: randomUUID(),
    body: {
      type: 'mutation',
      mutation: {
        action: 'update-postit',
        nodeId: randomUUID(),
        text: 'a'.repeat(1001),
      },
    },
  };
  expect(canvasCommandSchema.safeParse(command).success).toBe(false);
  expect(
    canvasCommandSchema.safeParse({
      ...command,
      body: {
        type: 'mutation',
        mutation: {
          action: 'create',
          node: {
            id: randomUUID(),
            type: 'postit',
            position: { x: 0, y: 0 },
            data: { text: '', user: { userId: randomUUID() } },
          },
        },
      },
    }).success,
  ).toBe(false);
});
