import { describe, expect, it, vi } from 'vitest';
import {
  hexColorSchema,
  type CanvasCommand,
  type CanvasCommandResult,
} from '@app/shared';
import { createCanvasInsertionHistory } from './canvas-insertion-history';

const reaction = (id = crypto.randomUUID()): CanvasCommand => ({
  id: crypto.randomUUID(),
  body: {
    type: 'mutation',
    mutation: {
      action: 'create',
      node: {
        id,
        type: 'emoji',
        position: { x: 20, y: 30 },
        data: { emoji: '☕', label: 'Coffee' },
      },
    },
  },
});
const saved = (command: CanvasCommand): CanvasCommandResult => ({
  ok: true,
  operationId: command.id,
});
const failed = (command: CanvasCommand): CanvasCommandResult => ({
  ok: false,
  operationId: command.id,
  code: 'storage',
  message: 'Try again.',
});
const setup = () => {
  const send = vi.fn(async (command: CanvasCommand) => saved(command));
  return { send, history: createCanvasInsertionHistory(send) };
};

describe('canvas insertion history', () => {
  it('restores the latest saved Post-it text on redo', async () => {
    const { send, history } = setup();
    const node = {
      id: crypto.randomUUID(),
      type: 'postit' as const,
      position: { x: 20, y: 30 },
      data: { text: '' },
    };
    await history.execute({
      id: crypto.randomUUID(),
      body: { type: 'mutation', mutation: { action: 'create', node } },
    });
    history.change({
      type: 'upsert',
      node: {
        ...node,
        data: {
          text: 'Edited note',
          user: {
            userId: crypto.randomUUID(),
            username: 'Alice',
            color: hexColorSchema.parse('#193CB8'),
          },
        },
      },
    });
    await history.undo();
    await history.redo();
    expect(send.mock.lastCall?.[0].body).toMatchObject({
      mutation: { node: { type: 'postit', data: { text: 'Edited note' } } },
    });
  });
  it('serializes insertion, undo, redo, and repeated cycles with fresh operation IDs', async () => {
    const { send, history } = setup();
    const first = reaction();
    await Promise.all([
      history.execute(first),
      history.undo(),
      history.redo(),
      history.undo(),
      history.redo(),
    ]);
    const commands = send.mock.calls.map(([command]) => command);
    expect(
      commands.map(
        ({ body }) => body.type === 'mutation' && body.mutation.action,
      ),
    ).toEqual(['create', 'delete', 'create', 'delete', 'create']);
    expect(new Set(commands.map(({ id }) => id)).size).toBe(5);
    expect(commands[2]!.body).toEqual(first.body);
    expect(commands[4]!.body).toEqual(first.body);
  });

  it('undoes local insertions in reverse order and clears redo on a new insertion', async () => {
    const { send, history } = setup();
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    await history.execute(reaction(firstId));
    await history.execute(reaction(secondId));
    await history.undo();
    expect(send.mock.lastCall?.[0].body).toMatchObject({
      mutation: { nodeId: secondId },
    });
    await history.undo();
    expect(send.mock.lastCall?.[0].body).toMatchObject({
      mutation: { nodeId: firstId },
    });
    await history.redo();
    expect(send.mock.lastCall?.[0].body).toMatchObject({
      mutation: { node: { id: firstId } },
    });
    await history.execute(reaction());
    send.mockClear();
    await history.redo();
    expect(send).not.toHaveBeenCalled();
  });

  it('does not record failed insertions or clear redo after a failed insertion', async () => {
    const { send, history } = setup();
    const command = reaction();
    await history.execute(command);
    await history.undo();
    send.mockImplementationOnce(async (command) => failed(command));
    await history.execute(reaction());
    await history.redo();
    expect(send.mock.lastCall?.[0].body).toEqual(command.body);
    await history.undo();
    send.mockClear();
    await history.undo();
    expect(send).not.toHaveBeenCalled();
  });

  it('retries uncertain undo and redo acknowledgements with the same operation IDs', async () => {
    const { send, history } = setup();
    const id = crypto.randomUUID();
    await history.execute(reaction(id));
    send.mockImplementationOnce(async (command) => {
      history.change({ type: 'remove', nodeId: id });
      return failed(command);
    });
    await history.undo();
    const undo = send.mock.lastCall?.[0];
    await history.undo();
    expect(send.mock.lastCall?.[0]).toEqual(undo);
    send.mockImplementationOnce(async (command) => failed(command));
    await history.redo();
    const redo = send.mock.lastCall?.[0];
    await history.redo();
    expect(send.mock.lastCall?.[0]).toEqual(redo);
  });

  it('skips deleted nodes and never records remote insertions', async () => {
    const { send, history } = setup();
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    await history.execute(reaction(firstId));
    await history.execute(reaction(secondId));
    history.snapshot([firstId, crypto.randomUUID()]);
    await history.undo();
    expect(send.mock.lastCall?.[0].body).toMatchObject({
      mutation: { nodeId: firstId },
    });
    send.mockClear();
    await history.undo();
    expect(send).not.toHaveBeenCalled();
  });

  it('preserves reaction edits and moves when restoring an insertion', async () => {
    const { send, history } = setup();
    const id = crypto.randomUUID();
    await history.execute(reaction(id));
    history.change({
      type: 'upsert',
      node: {
        id,
        type: 'emoji',
        position: { x: 20, y: 30 },
        data: { emoji: '❤️', label: 'Heart' },
      },
    });
    history.change({ type: 'move', nodeId: id, position: { x: 100, y: 200 } });
    await history.undo();
    await history.redo();
    expect(send.mock.lastCall?.[0].body).toMatchObject({
      mutation: {
        node: {
          id,
          position: { x: 100, y: 200 },
          data: { emoji: '❤️', label: 'Heart' },
        },
      },
    });
  });

  it('protects message threads and lets undo continue past a thread with replies', async () => {
    const { send, history } = setup();
    const previousId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    await history.execute(reaction(previousId));
    await history.execute({
      id: crypto.randomUUID(),
      body: {
        type: 'thread',
        nodeId: crypto.randomUUID(),
        position: { x: 10, y: 10 },
        message: { id: messageId, text: 'Hello' },
      },
    });
    send.mockImplementationOnce(async (command) => ({
      ok: false,
      operationId: command.id,
      code: 'conflict',
      message: 'Thread has replies.',
    }));
    await history.undo();
    expect(send.mock.lastCall?.[0].body).toMatchObject({
      mutation: { expectedMessageId: messageId },
    });
    await history.undo();
    expect(send.mock.lastCall?.[0].body).toMatchObject({
      mutation: { nodeId: previousId },
    });
  });

  it('cancels queued work on disconnect instead of replaying it after reconnect', async () => {
    const { send, history } = setup();
    let finish!: (result: CanvasCommandResult) => void;
    send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const command = reaction();
    const first = history.execute(command);
    await Promise.resolve();
    const waiting = history.execute(reaction());
    const undo = history.undo();
    history.disconnect();
    finish(saved(command));
    await first;
    expect(await waiting).toMatchObject({ ok: false, code: 'offline' });
    await undo;
    expect(send).toHaveBeenCalledTimes(1);
    history.snapshot([]);
  });
});
