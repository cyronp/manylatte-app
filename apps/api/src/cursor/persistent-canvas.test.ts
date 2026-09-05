import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@app/db';
import {
  hexColorSchema,
  type CanvasMessage,
  type CanvasNodeMutation,
} from '@app/shared';

import { createTestDatabase } from '../../test/database.js';
import { createCanvasPersistence } from './canvas-persistence.js';
import { PersistentCanvas } from './persistent-canvas.js';

const author = {
  userId: randomUUID(),
  username: 'Alice',
  color: hexColorSchema.parse('#193CB8'),
};
const message = (text: string): CanvasMessage => ({
  id: randomUUID(),
  text,
  author,
});
const createNode = (id: string): CanvasNodeMutation => ({
  action: 'create',
  node: { id, type: 'message', position: { x: 20, y: 30 } },
});

describe('SQLite canvas persistence', () => {
  let database: Database | undefined;
  afterEach(async () => {
    await database?.$disconnect();
  });

  it('reloads nodes, ordered messages, and positions; deletion cascades to history', async () => {
    database = await createTestDatabase();
    const persistence = createCanvasPersistence(database);
    const canvas = new PersistentCanvas('lobby', persistence);
    const id = randomUUID();
    const messages = [message('first'), message('second')];
    // The UI sends create and first message without waiting between commands.
    await Promise.all([
      canvas.applyMutation(createNode(id)),
      ...messages.map((item) => canvas.appendMessage(id, item)),
      canvas.applyMutation({
        action: 'move',
        nodeId: id,
        position: { x: 40, y: 50 },
      }),
    ]);
    const reloaded = new PersistentCanvas('lobby', persistence);
    expect(await reloaded.snapshot()).toEqual([
      { id, type: 'message', position: { x: 40, y: 50 }, data: { messages } },
    ]);
    expect(await new PersistentCanvas('other', persistence).snapshot()).toEqual(
      [],
    );
    await reloaded.appendMessage(id, messages[0]!);
    expect(await database.canvasMessage.count()).toBe(2);
    await reloaded.applyMutation({ action: 'delete', nodeId: id });
    expect(await database.canvasMessage.count()).toBe(0);
    expect(await new PersistentCanvas('lobby', persistence).snapshot()).toEqual(
      [],
    );
  });

  it('keeps failed writes out of visible state and permits a later retry', async () => {
    database = await createTestDatabase();
    const persistence = createCanvasPersistence(database);
    const mutate = vi
      .spyOn(persistence, 'mutate')
      .mockRejectedValueOnce(new Error('disk full'));
    const canvas = new PersistentCanvas('lobby', persistence);
    const mutation = createNode(randomUUID());
    await expect(canvas.applyMutation(mutation)).rejects.toThrow('disk full');
    expect(await canvas.snapshot()).toEqual([]);
    expect(await database.canvasNode.count()).toBe(0);
    mutate.mockRestore();
    await expect(canvas.applyMutation(mutation)).resolves.toMatchObject({
      status: 'applied',
    });
    expect(await database.canvasNode.count()).toBe(1);
  });
});
