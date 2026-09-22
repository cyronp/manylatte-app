import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { hexColorSchema, type CanvasCommand } from '@app/shared';
import { createTestDatabase } from '../../test/database.js';
import { createCanvasPersistence } from './canvas-persistence.js';
import { PersistentCanvas } from './persistent-canvas.js';

const alice = {
  userId: randomUUID(),
  username: 'Alice',
  color: hexColorSchema.parse('#193CB8'),
};
const bob = { ...alice, userId: randomUUID(), username: 'Bob' };
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let canvas: PersistentCanvas;
const command = (body: CanvasCommand['body']): CanvasCommand => ({
  id: randomUUID(),
  body,
});
beforeEach(async () => {
  database = await createTestDatabase();
  await database.lobby.create({
    data: { id: 'room', code: 'TEST-0001', name: 'Test' },
  });
  canvas = new PersistentCanvas('room', createCanvasPersistence(database));
});
afterEach(async () => {
  await database.$disconnect();
});

it('restores complete paginated message history and original authors after reload', async () => {
  const nodeId = randomUUID();
  await canvas.execute(
    command({
      type: 'thread',
      nodeId,
      position: { x: 100, y: 200 },
      message: { id: randomUUID(), text: 'First message' },
    }),
    alice,
  );
  for (let index = 1; index < 55; index++) {
    await canvas.execute(
      command({
        type: 'message',
        input: { nodeId, id: randomUUID(), text: `Reply ${index}` },
      }),
      index % 2 ? bob : alice,
    );
  }
  const before = await canvas.snapshot();
  const recent = await canvas.history({ nodeId });
  const older = await canvas.history({
    nodeId,
    before: recent.messages[0]!.id,
  });
  const deletion = command({
    type: 'mutation',
    mutation: { action: 'delete', nodeId },
  });
  expect(await canvas.execute(deletion, bob)).toMatchObject({
    result: { ok: true, undoableDeletion: true },
  });
  expect(await database.canvasMessage.count()).toBe(0);
  canvas = new PersistentCanvas('room', createCanvasPersistence(database));
  const restore = command({ type: 'restore', deletionId: deletion.id });
  expect(await canvas.execute(restore, alice)).toMatchObject({
    result: { ok: false, code: 'missing' },
  });
  expect(await canvas.execute(restore, bob)).toMatchObject({
    result: { ok: true },
  });
  expect(await canvas.snapshot()).toEqual(before);
  expect(await canvas.history({ nodeId })).toEqual(recent);
  expect(
    await canvas.history({ nodeId, before: recent.messages[0]!.id }),
  ).toEqual(older);
  canvas = new PersistentCanvas('room', createCanvasPersistence(database));
  expect(await canvas.execute(restore, bob)).toMatchObject({
    replayed: true,
    result: { ok: true },
  });
  expect(await canvas.snapshot()).toEqual(before);
  expect(await database.canvasMessage.count()).toBe(55);
});

it('preserves Post-it colors and ownership, and does not reuse an old deletion archive', async () => {
  const nodeId = randomUUID();
  await canvas.execute(
    command({
      type: 'mutation',
      mutation: {
        action: 'create',
        node: {
          id: nodeId,
          type: 'postit',
          position: { x: 10, y: 20 },
          data: { text: 'Keep this note', color: 'purple' },
        },
      },
    }),
    alice,
  );
  const before = await canvas.snapshot();
  const deletion = command({
    type: 'mutation',
    mutation: { action: 'delete', nodeId },
  });
  await canvas.execute(deletion, bob);
  const otherRoom = new PersistentCanvas(
    'other',
    createCanvasPersistence(database),
  );
  expect(
    await otherRoom.execute(
      command({ type: 'restore', deletionId: deletion.id }),
      bob,
    ),
  ).toMatchObject({ result: { ok: false } });
  expect(
    await canvas.execute(
      command({ type: 'restore', deletionId: deletion.id }),
      bob,
    ),
  ).toMatchObject({ result: { ok: true } });
  expect(await canvas.snapshot()).toEqual(before);
  const secondDeletion = command({
    type: 'mutation',
    mutation: { action: 'delete', nodeId },
  });
  await canvas.execute(secondDeletion, bob);
  expect(
    await canvas.execute(
      command({ type: 'restore', deletionId: deletion.id }),
      bob,
    ),
  ).toMatchObject({ result: { ok: false } });
  expect(
    await canvas.execute(
      command({ type: 'restore', deletionId: secondDeletion.id }),
      bob,
    ),
  ).toMatchObject({ result: { ok: true } });
  expect(
    await new PersistentCanvas(
      'room',
      createCanvasPersistence(database),
    ).snapshot(),
  ).toEqual(before);
});

it('rolls back failed deletions and restores and permits safe retries', async () => {
  const nodeId = randomUUID();
  await canvas.execute(
    command({
      type: 'thread',
      nodeId,
      position: { x: 10, y: 20 },
      message: { id: randomUUID(), text: 'Keep me' },
    }),
    alice,
  );
  const before = await canvas.snapshot();
  const deletion = command({
    type: 'mutation',
    mutation: { action: 'delete', nodeId },
  });
  await database.$executeRawUnsafe(
    "CREATE TRIGGER fail_delete BEFORE DELETE ON CanvasNode BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  await expect(canvas.execute(deletion, alice)).rejects.toThrow();
  expect(await canvas.snapshot()).toEqual(before);
  expect(
    await database.canvasOperation.count({ where: { id: deletion.id } }),
  ).toBe(0);
  await database.$executeRawUnsafe('DROP TRIGGER fail_delete');
  await canvas.execute(deletion, alice);
  const restore = command({ type: 'restore', deletionId: deletion.id });
  await database.$executeRawUnsafe(
    "CREATE TRIGGER fail_restore BEFORE INSERT ON CanvasMessage BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  await expect(canvas.execute(restore, alice)).rejects.toThrow();
  expect(await canvas.snapshot()).toEqual([]);
  expect(await database.canvasNode.count()).toBe(0);
  await database.$executeRawUnsafe('DROP TRIGGER fail_restore');
  expect(await canvas.execute(restore, alice)).toMatchObject({
    result: { ok: true },
  });
  expect(await canvas.snapshot()).toEqual(before);
});
