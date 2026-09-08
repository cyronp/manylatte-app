import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { hexColorSchema, type CanvasCommand } from '@app/shared';
import { createTestDatabase } from '../../test/database.js';
import { createCanvasPersistence } from './canvas-persistence.js';
import { PersistentCanvas } from './persistent-canvas.js';
import { WorkBudget } from './work-budget.js';

const user = {
  userId: randomUUID(),
  username: 'Alice',
  color: hexColorSchema.parse('#193CB8'),
};
const thread = (): CanvasCommand => ({
  id: randomUUID(),
  body: {
    type: 'thread',
    nodeId: randomUUID(),
    position: { x: 20, y: 30 },
    message: { id: randomUUID(), text: 'First message' },
  },
});

it('commits a thread and message atomically, and retries safely after reload', async () => {
  const database = await createTestDatabase();
  try {
    const persistence = createCanvasPersistence(database);
    const canvas = new PersistentCanvas('room', persistence);
    const command = thread();
    await database.$executeRawUnsafe(
      `CREATE TRIGGER fail_message BEFORE INSERT ON CanvasMessage BEGIN SELECT RAISE(ABORT, 'test write failure'); END`,
    );
    await expect(canvas.execute(command, user)).rejects.toThrow();
    expect(await canvas.snapshot()).toEqual([]);
    expect(await database.canvasNode.count()).toBe(0);
    expect(await database.canvasOperation.count()).toBe(0);
    await database.$executeRawUnsafe('DROP TRIGGER fail_message');
    const saved = await canvas.execute(command, user);
    expect(saved.result.ok).toBe(true);
    const replay = await new PersistentCanvas('room', persistence).execute(
      command,
      { ...user, userId: randomUUID() },
    );
    expect(replay).toEqual({ result: saved.result, replayed: true });
    expect(await database.canvasMessage.count()).toBe(1);
    expect(await database.canvasNode.count()).toBe(1);
    expect(
      await canvas.execute({ ...thread(), id: command.id }, user),
    ).toMatchObject({ result: { ok: false, code: 'conflict' } });
  } finally {
    await database.$disconnect();
  }
});

it('keeps snapshots compact while returning complete ordered history in pages', async () => {
  const database = await createTestDatabase();
  try {
    const canvas = new PersistentCanvas(
      'room',
      createCanvasPersistence(database),
    );
    const command = thread();
    if (command.body.type !== 'thread') throw new Error('Expected thread');
    const nodeId = command.body.nodeId;
    await canvas.execute(command, user);
    for (let index = 1; index < 76; index++)
      await canvas.appendMessage(nodeId, {
        id: randomUUID(),
        text: `message ${index}`,
        author: user,
      });
    const reloaded = new PersistentCanvas(
      'room',
      createCanvasPersistence(database),
    );
    expect((await reloaded.snapshot())[0]).toMatchObject({
      data: { messageCount: 76, messages: [{ text: 'message 75' }] },
    });
    const latest = await reloaded.history({ nodeId });
    expect(latest.messages).toHaveLength(50);
    expect(latest.hasMore).toBe(true);
    const older = await reloaded.history({
      nodeId,
      before: latest.messages[0]!.id,
    });
    expect(older.messages).toHaveLength(26);
    expect(older.hasMore).toBe(false);
    expect(older.messages[0]?.text).toBe('First message');
    expect(
      new Set(
        [...older.messages, ...latest.messages].map((message) => message.id),
      ).size,
    ).toBe(76);
    await expect(
      new PersistentCanvas('other', createCanvasPersistence(database)).history({
        nodeId,
      }),
    ).rejects.toThrow(/no longer exists/);
  } finally {
    await database.$disconnect();
  }
});

it('bounds outstanding work and releases capacity after stalled storage resumes', async () => {
  const database = await createTestDatabase();
  try {
    const persistence = createCanvasPersistence(database);
    let resume!: () => void;
    const stalled = new Promise<void>((resolve) => {
      resume = resolve;
    });
    vi.spyOn(persistence, 'load').mockImplementation(async () => {
      await stalled;
      return [];
    });
    const budget = new WorkBudget(2);
    const first = new PersistentCanvas('first', persistence, budget);
    const second = new PersistentCanvas('second', persistence, budget);
    const waiting = [first.snapshot(), second.snapshot()];
    await expect(first.snapshot()).rejects.toThrow(/busy/);
    expect(budget.pending).toBe(2);
    resume();
    await Promise.all(waiting);
    expect(budget.pending).toBe(0);
    expect(budget.peak).toBe(2);
    expect(await first.snapshot()).toEqual([]);
  } finally {
    await database.$disconnect();
  }
});
