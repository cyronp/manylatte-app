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

  it('preserves reaction authors through reload, movement, and edits by another user', async () => {
    database = await createTestDatabase();
    const persistence = createCanvasPersistence(database);
    const canvas = new PersistentCanvas('lobby', persistence);
    const id = randomUUID();
    await canvas.applyMutation(
      {
        action: 'create',
        node: {
          id,
          type: 'emoji',
          position: { x: 20, y: 30 },
          data: { emoji: '☕', label: 'Coffee' },
        },
      },
      author,
    );
    const reloaded = new PersistentCanvas('lobby', persistence);
    expect(await reloaded.snapshot()).toEqual([
      {
        id,
        type: 'emoji',
        position: { x: 20, y: 30 },
        data: { emoji: '☕', label: 'Coffee', user: author },
      },
    ]);
    const editor = { ...author, userId: randomUUID(), username: 'Bob' };
    await reloaded.applyMutation(
      { action: 'move', nodeId: id, position: { x: 40, y: 50 } },
      editor,
    );
    await reloaded.applyMutation(
      {
        action: 'update-reaction',
        nodeId: id,
        data: { emoji: '❤️', label: 'Heart' },
      },
      editor,
    );
    expect(await new PersistentCanvas('lobby', persistence).snapshot()).toEqual(
      [
        {
          id,
          type: 'emoji',
          position: { x: 40, y: 50 },
          data: { emoji: '❤️', label: 'Heart', user: author },
        },
      ],
    );
    await reloaded.applyMutation({ action: 'delete', nodeId: id }, editor);
    expect(await new PersistentCanvas('lobby', persistence).snapshot()).toEqual(
      [],
    );
  });

  it('loads and edits legacy reactions without inventing an author', async () => {
    database = await createTestDatabase();
    const id = randomUUID();
    await database.canvasNode.create({
      data: {
        id,
        roomId: 'lobby',
        type: 'emoji',
        x: 20,
        y: 30,
        emoji: '☕',
        label: 'Coffee',
      },
    });
    const persistence = createCanvasPersistence(database);
    const canvas = new PersistentCanvas('lobby', persistence);
    expect((await canvas.snapshot())[0]?.data).toEqual({
      emoji: '☕',
      label: 'Coffee',
    });
    await canvas.applyMutation(
      {
        action: 'update-reaction',
        nodeId: id,
        data: { emoji: '❤️', label: 'Heart' },
      },
      author,
    );
    expect(
      (await new PersistentCanvas('lobby', persistence).snapshot())[0]?.data,
    ).toEqual({ emoji: '❤️', label: 'Heart' });
  });

  it('rejects reaction edits on missing nodes and message nodes', async () => {
    database = await createTestDatabase();
    const canvas = new PersistentCanvas(
      'lobby',
      createCanvasPersistence(database),
    );
    const id = randomUUID();
    const edit = {
      action: 'update-reaction',
      nodeId: id,
      data: { emoji: '☕', label: 'Coffee' },
    } as const;
    expect(await canvas.applyMutation(edit, author)).toEqual({
      status: 'rejected',
      reason: 'node-missing',
    });
    await canvas.applyMutation(createNode(id), author);
    expect(await canvas.applyMutation(edit, author)).toEqual({
      status: 'rejected',
      reason: 'not-emoji-node',
    });
    expect(
      await database.canvasNode.findUnique({ where: { id } }),
    ).toMatchObject({ type: 'message', emoji: null });
  });

  it('reloads nodes, ordered messages, and positions; deletion cascades to history', async () => {
    database = await createTestDatabase();
    const persistence = createCanvasPersistence(database);
    const canvas = new PersistentCanvas('lobby', persistence);
    const id = randomUUID();
    const messages = [message('first'), message('second')];
    // The UI sends create and first message without waiting between commands.
    await Promise.all([
      canvas.applyMutation(createNode(id), author),
      ...messages.map((item) => canvas.appendMessage(id, item)),
      canvas.applyMutation(
        {
          action: 'move',
          nodeId: id,
          position: { x: 40, y: 50 },
        },
        author,
      ),
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
    await reloaded.applyMutation({ action: 'delete', nodeId: id }, author);
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
    await expect(canvas.applyMutation(mutation, author)).rejects.toThrow(
      'disk full',
    );
    expect(await canvas.snapshot()).toEqual([]);
    expect(await database.canvasNode.count()).toBe(0);
    mutate.mockRestore();
    await expect(canvas.applyMutation(mutation, author)).resolves.toMatchObject(
      {
        status: 'applied',
      },
    );
    expect(await database.canvasNode.count()).toBe(1);
  });
});
