import {
  hexColorSchema,
  MAX_CANVAS_ROOM_MESSAGES,
  MAX_CANVAS_ROOM_TEXT_BYTES,
  type CanvasMessage,
  type CanvasNode,
  type CanvasNodeMutation,
} from '@app/shared';
import { describe, expect, it } from 'vitest';

import { CanvasState } from './canvas-state.js';

const MESSAGE_NODE_ID = '21c9b25b-4656-47ba-b95d-94ad13ba8a3b';
const EMOJI_NODE_ID = 'd599a14f-1078-4c17-b809-f7fe3e9902ec';

const createMessageNode: CanvasNodeMutation = {
  action: 'create',
  node: {
    id: MESSAGE_NODE_ID,
    position: { x: 100, y: 200 },
    type: 'message',
  },
};

const message: CanvasMessage = {
  author: {
    color: hexColorSchema.parse('#034EB2'),
    userId: 'f88131a4-f8f3-49b3-84a9-d04f4428131f',
    username: 'Latte-1234',
  },
  id: '3817c8a6-9f88-478f-b03c-c3b06b095a47',
  text: 'Hello everyone',
};

describe('CanvasState', () => {
  it('keeps room message capacity isolated across forks and repeated deletions', () => {
    const nodes: CanvasNode[] = Array.from({ length: 10 }, (_, index) => ({
      id: `full-thread-${index}`,
      type: 'message',
      position: { x: 0, y: 0 },
      data: {
        messages: [{ ...message, id: `preview-${index}` }],
        messageCount: MAX_CANVAS_ROOM_MESSAGES / 10,
        textBytes: 1000,
      },
    }));
    const original = new CanvasState({ nodes, retainedMessages: 1 });
    original.applyMutation(createMessageNode, message.author);
    const candidate = original.fork();
    const deletion = { action: 'delete', nodeId: nodes[0]!.id } as const;
    // Rejected undo and duplicate appends must not free or consume capacity.
    expect(
      candidate.applyMutation(
        { ...deletion, expectedMessageId: 'preview-0' },
        message.author,
      ),
    ).toMatchObject({ status: 'rejected' });
    expect(candidate.appendMessage(MESSAGE_NODE_ID, message)).toMatchObject({
      reason: 'room-limit',
    });
    candidate.applyMutation(deletion, message.author);
    candidate.applyMutation(deletion, message.author);
    for (let index = 0; index < 200; index++) {
      const entry = { ...message, id: `new-${index}` };
      expect(candidate.appendMessage(MESSAGE_NODE_ID, entry).status).toBe(
        'applied',
      );
      expect(candidate.appendMessage(MESSAGE_NODE_ID, entry).status).toBe(
        'ignored',
      );
    }
    candidate.applyMutation(
      {
        ...createMessageNode,
        node: { ...createMessageNode.node, id: 'extra' },
      },
      message.author,
    );
    expect(candidate.appendMessage('extra', message)).toMatchObject({
      reason: 'room-limit',
    });
    expect(original.appendMessage(MESSAGE_NODE_ID, message)).toMatchObject({
      reason: 'room-limit',
    });
    expect(original.hasNode(nodes[0]!.id)).toBe(true);
  });

  it('counts UTF-8 bytes from legacy nodes and preserves byte limits across forks', () => {
    const legacy: CanvasNode = {
      id: 'legacy',
      type: 'message',
      position: { x: 0, y: 0 },
      data: { messages: [{ ...message, text: '😀' }] },
    };
    const canvas = new CanvasState({
      nodes: [
        legacy,
        {
          id: 'large',
          type: 'message',
          position: { x: 0, y: 0 },
          data: {
            messages: [message],
            messageCount: 1,
            textBytes: MAX_CANVAS_ROOM_TEXT_BYTES - 4,
          },
        },
      ],
    });
    canvas.applyMutation(createMessageNode, message.author);
    expect(
      canvas.appendMessage(MESSAGE_NODE_ID, { ...message, text: 'a' }),
    ).toMatchObject({ reason: 'room-limit' });
    const candidate = canvas.fork();
    candidate.applyMutation(
      { action: 'delete', nodeId: legacy.id },
      message.author,
    );
    candidate.applyMutation(
      { action: 'delete', nodeId: legacy.id },
      message.author,
    );
    expect(
      candidate.appendMessage(MESSAGE_NODE_ID, { ...message, text: '☕' })
        .status,
    ).toBe('applied');
    expect(
      candidate.appendMessage(MESSAGE_NODE_ID, {
        ...message,
        id: 'too-large',
        text: 'é',
      }),
    ).toMatchObject({ reason: 'room-limit' });
    expect(
      candidate.appendMessage(MESSAGE_NODE_ID, {
        ...message,
        id: 'fits',
        text: 'a',
      }).status,
    ).toBe('applied');
    expect(
      candidate.appendMessage(MESSAGE_NODE_ID, {
        ...message,
        id: 'full',
        text: 'a',
      }),
    ).toMatchObject({ reason: 'room-limit' });
    expect(
      canvas.appendMessage(MESSAGE_NODE_ID, { ...message, text: 'a' }),
    ).toMatchObject({ reason: 'room-limit' });
  });

  it('restores message totals even when only one preview is retained', () => {
    const archived: CanvasNode = {
      id: MESSAGE_NODE_ID,
      type: 'message',
      position: { x: 0, y: 0 },
      data: {
        messages: Array.from({ length: 200 }, (_, index) => ({
          ...message,
          id: `restored-${index}`,
        })),
      },
    };
    const canvas = new CanvasState({
      retainedMessages: 1,
      nodes: [
        {
          id: 'existing',
          type: 'message',
          position: { x: 0, y: 0 },
          data: {
            messages: [message],
            messageCount: MAX_CANVAS_ROOM_MESSAGES - 200,
            textBytes: 1000,
          },
        },
      ],
    });
    expect(canvas.restoreNode(archived, message.author).status).toBe('applied');
    canvas.applyMutation(
      { action: 'delete', nodeId: MESSAGE_NODE_ID },
      message.author,
    );
    expect(canvas.restoreNode(archived, message.author).status).toBe('applied');
    canvas.applyMutation(
      {
        ...createMessageNode,
        node: { ...createMessageNode.node, id: 'extra' },
      },
      message.author,
    );
    expect(canvas.appendMessage('extra', message)).toMatchObject({
      reason: 'room-limit',
    });
    expect(
      canvas.snapshot().find((node) => node.id === MESSAGE_NODE_ID),
    ).toMatchObject({
      data: { messageCount: 200, messages: [{ id: 'restored-199' }] },
    });
  });

  it('deletes message history, frees capacity, and tolerates repeated deletion', () => {
    const canvas = new CanvasState({ maxNodes: 1 });
    canvas.applyMutation(createMessageNode, message.author);
    canvas.appendMessage(MESSAGE_NODE_ID, message);

    const deletion: CanvasNodeMutation = {
      action: 'delete',
      nodeId: MESSAGE_NODE_ID,
    };
    expect(canvas.applyMutation(deletion, message.author)).toEqual({
      nodeId: MESSAGE_NODE_ID,
      status: 'deleted',
    });
    expect(canvas.snapshot()).toEqual([]);
    expect(canvas.hasMessageNode(MESSAGE_NODE_ID)).toBe(false);
    expect(canvas.appendMessage(MESSAGE_NODE_ID, message)).toEqual({
      reason: 'message-node-missing',
      status: 'rejected',
    });
    expect(canvas.applyMutation(deletion, message.author).status).toBe(
      'deleted',
    );
    expect(canvas.applyMutation(createMessageNode, message.author).status).toBe(
      'applied',
    );
  });

  it('creates server-authored message nodes without client message data', () => {
    const canvas = new CanvasState();

    expect(canvas.applyMutation(createMessageNode, message.author)).toEqual({
      node: {
        ...createMessageNode.node,
        data: { messages: [] },
      },
      status: 'applied',
    });
  });

  it('moves a message node without changing its history', () => {
    const canvas = new CanvasState();
    canvas.applyMutation(createMessageNode, message.author);
    canvas.appendMessage(MESSAGE_NODE_ID, message);

    expect(
      canvas.applyMutation(
        {
          action: 'move',
          nodeId: MESSAGE_NODE_ID,
          position: { x: 300, y: 400 },
        },
        message.author,
      ),
    ).toEqual({
      node: {
        ...createMessageNode.node,
        data: {
          messages: [message],
          messageCount: 1,
          textBytes: Buffer.byteLength(message.text),
        },
        position: { x: 300, y: 400 },
      },
      status: 'applied',
    });
  });

  it('rejects duplicate node creation and movement of missing nodes', () => {
    const canvas = new CanvasState();
    canvas.applyMutation(createMessageNode, message.author);

    expect(canvas.applyMutation(createMessageNode, message.author)).toEqual({
      reason: 'node-already-exists',
      status: 'rejected',
    });
    expect(
      canvas.applyMutation(
        {
          action: 'move',
          nodeId: EMOJI_NODE_ID,
          position: { x: 300, y: 400 },
        },
        message.author,
      ),
    ).toEqual({ reason: 'node-missing', status: 'rejected' });
  });

  it('enforces node and message limits', () => {
    const canvas = new CanvasState({ maxMessagesPerNode: 1, maxNodes: 1 });
    canvas.applyMutation(createMessageNode, message.author);

    expect(
      canvas.applyMutation(
        {
          action: 'create',
          node: {
            data: { emoji: '☕', label: 'Coffee' },
            id: EMOJI_NODE_ID,
            position: { x: 300, y: 400 },
            type: 'emoji',
          },
        },
        message.author,
      ),
    ).toEqual({ reason: 'node-limit', status: 'rejected' });
    expect(canvas.appendMessage(MESSAGE_NODE_ID, message).status).toBe(
      'applied',
    );
    expect(
      canvas.appendMessage(MESSAGE_NODE_ID, {
        ...message,
        id: 'ca3a8d40-48d8-487c-b98b-7920fb809cb1',
      }),
    ).toEqual({ reason: 'message-limit', status: 'rejected' });
  });

  it('ignores duplicate messages', () => {
    const canvas = new CanvasState();
    canvas.applyMutation(createMessageNode, message.author);
    canvas.appendMessage(MESSAGE_NODE_ID, message);

    expect(canvas.appendMessage(MESSAGE_NODE_ID, message)).toEqual({
      status: 'ignored',
    });
    expect(canvas.snapshot()[0]).toMatchObject({
      data: {
        messages: [message],
        messageCount: 1,
        textBytes: Buffer.byteLength(message.text),
      },
    });
  });
});
