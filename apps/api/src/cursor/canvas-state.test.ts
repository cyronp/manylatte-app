import {
  hexColorSchema,
  type CanvasMessage,
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
  it('deletes message history, frees capacity, and tolerates repeated deletion', () => {
    const canvas = new CanvasState({ maxNodes: 1 });
    canvas.applyMutation(createMessageNode);
    canvas.appendMessage(MESSAGE_NODE_ID, message);

    const deletion: CanvasNodeMutation = {
      action: 'delete',
      nodeId: MESSAGE_NODE_ID,
    };
    expect(canvas.applyMutation(deletion)).toEqual({
      nodeId: MESSAGE_NODE_ID,
      status: 'deleted',
    });
    expect(canvas.snapshot()).toEqual([]);
    expect(canvas.hasMessageNode(MESSAGE_NODE_ID)).toBe(false);
    expect(canvas.appendMessage(MESSAGE_NODE_ID, message)).toEqual({
      reason: 'message-node-missing',
      status: 'rejected',
    });
    expect(canvas.applyMutation(deletion).status).toBe('deleted');
    expect(canvas.applyMutation(createMessageNode).status).toBe('applied');
  });

  it('creates server-authored message nodes without client message data', () => {
    const canvas = new CanvasState();

    expect(canvas.applyMutation(createMessageNode)).toEqual({
      node: {
        ...createMessageNode.node,
        data: { messages: [] },
      },
      status: 'applied',
    });
  });

  it('moves a message node without changing its history', () => {
    const canvas = new CanvasState();
    canvas.applyMutation(createMessageNode);
    canvas.appendMessage(MESSAGE_NODE_ID, message);

    expect(
      canvas.applyMutation({
        action: 'move',
        nodeId: MESSAGE_NODE_ID,
        position: { x: 300, y: 400 },
      }),
    ).toEqual({
      node: {
        ...createMessageNode.node,
        data: { messages: [message] },
        position: { x: 300, y: 400 },
      },
      status: 'applied',
    });
  });

  it('rejects duplicate node creation and movement of missing nodes', () => {
    const canvas = new CanvasState();
    canvas.applyMutation(createMessageNode);

    expect(canvas.applyMutation(createMessageNode)).toEqual({
      reason: 'node-already-exists',
      status: 'rejected',
    });
    expect(
      canvas.applyMutation({
        action: 'move',
        nodeId: EMOJI_NODE_ID,
        position: { x: 300, y: 400 },
      }),
    ).toEqual({ reason: 'node-missing', status: 'rejected' });
  });

  it('enforces node and message limits', () => {
    const canvas = new CanvasState({ maxMessagesPerNode: 1, maxNodes: 1 });
    canvas.applyMutation(createMessageNode);

    expect(
      canvas.applyMutation({
        action: 'create',
        node: {
          data: { emoji: '☕', label: 'Coffee' },
          id: EMOJI_NODE_ID,
          position: { x: 300, y: 400 },
          type: 'emoji',
        },
      }),
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
    canvas.applyMutation(createMessageNode);
    canvas.appendMessage(MESSAGE_NODE_ID, message);

    expect(canvas.appendMessage(MESSAGE_NODE_ID, message)).toEqual({
      status: 'ignored',
    });
    expect(canvas.snapshot()[0]).toMatchObject({
      data: { messages: [message] },
    });
  });
});
