import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@app/db';
import {
  CANVAS_PREVIEW_MESSAGES,
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

  it('reads only the latest previews from SQLite, scoped to the requested lobby', async () => {
    database = await createTestDatabase();
    await database.lobby.createMany({
      data: [
        { id: 'lobby', code: 'TEST-0001', name: 'Test' },
        { id: 'other', code: 'TEST-0002', name: 'Other' },
      ],
    });
    const ids = Array.from({ length: 4 }, () => randomUUID());
    await database.canvasNode.createMany({
      data: ids.map((id, index) => ({
        id,
        roomId: index === 3 ? 'other' : 'lobby',
        type: 'message',
        x: 0,
        y: 0,
        messageCount: index === 2 ? 0 : 80,
        textBytes: index === 2 ? 0 : 80,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })),
    });
    // Interleave sequences between threads so a global LIMIT would be incorrect.
    const entries = Array.from({ length: 80 }, (_, index) =>
      [ids[0]!, ids[1]!, ids[3]!].map((nodeId) => ({
        id: randomUUID(),
        nodeId,
        text: `${index}`,
        authorId: author.userId,
        authorUsername: author.username,
        authorColor: author.color,
      })),
    ).flat();
    await database.canvasMessage.createMany({ data: entries });
    const query = vi.spyOn(database, '$queryRaw');
    const persistence = createCanvasPersistence(database);
    const nodes = await persistence.load('lobby');
    expect(nodes.map((node) => node.id)).toEqual(ids.slice(0, 3).sort());
    for (const node of nodes) {
      expect(node).toMatchObject({
        data: {
          messageCount: node.id === ids[2] ? 0 : 80,
          messages: entries
            .filter((entry) => entry.nodeId === node.id)
            .slice(-CANVAS_PREVIEW_MESSAGES)
            .map((entry) => ({ id: entry.id, text: entry.text, author })),
        },
      });
    }
    // Bound rows crossing the database adapter, not just the final snapshot size.
    expect(query).toHaveBeenCalledOnce();
    expect(await query.mock.results[0]!.value).toHaveLength(
      2 * CANVAS_PREVIEW_MESSAGES,
    );
    expect(
      (await persistence.history('lobby', { nodeId: ids[0]! })).messages,
    ).toHaveLength(50);
    expect(await persistence.load('missing')).toEqual([]);
  });

  it('preserves reaction authors through reload, movement, and edits by another user', async () => {
    database = await createTestDatabase();
    await database.lobby.create({
      data: { id: 'lobby', code: 'TEST-0001', name: 'Test' },
    });
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
    await database.lobby.create({
      data: { id: 'lobby', code: 'TEST-0001', name: 'Test' },
    });
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
    await database.lobby.create({
      data: { id: 'lobby', code: 'TEST-0001', name: 'Test' },
    });
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
    await database.lobby.create({
      data: { id: 'lobby', code: 'TEST-0001', name: 'Test' },
    });
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
      {
        id,
        type: 'message',
        position: { x: 40, y: 50 },
        data: { messages: messages.slice(-1), messageCount: 2, textBytes: 11 },
      },
    ]);
    expect(await new PersistentCanvas('other', persistence).snapshot()).toEqual(
      [],
    );
    expect(await reloaded.history({ nodeId: id })).toEqual({
      messages,
      hasMore: false,
    });
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
    await database.lobby.create({
      data: { id: 'lobby', code: 'TEST-0001', name: 'Test' },
    });
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
