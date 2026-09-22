import type {
  CanvasCommand,
  CanvasCommandResult,
  CanvasNode,
  CursorUser,
} from '@app/shared';
import type {
  CanvasState,
  CanvasMutationResult,
  CanvasMessageResult,
} from './canvas-state.js';

const rejection = (
  operationId: string,
  reason: string,
): CanvasCommandResult => ({
  ok: false,
  operationId,
  code:
    reason === 'not-owner'
      ? 'invalid'
      : reason.includes('limit')
        ? 'limit'
        : reason.includes('exists') || reason === 'thread-changed'
          ? 'conflict'
          : 'missing',
  message:
    reason === 'not-owner'
      ? 'Only the owner can edit this Post-it.'
      : reason === 'thread-changed'
        ? 'Cannot undo this insertion because the conversation has received replies.'
        : reason === 'message-limit'
          ? 'This conversation is full (200 messages). Start another conversation.'
          : reason === 'node-limit'
            ? 'This board is full. Remove an item before adding another.'
            : reason === 'room-limit'
              ? 'This board has reached its message storage limit.'
              : reason.includes('exists')
                ? 'This item already exists. Refresh the board before trying again.'
                : 'This item no longer exists. Your message has not been sent.',
});

export function prepareCommand(
  state: CanvasState,
  command: CanvasCommand,
  user: CursorUser,
  deletedNode?: CanvasNode,
): CanvasCommandResult {
  const body = command.body;
  if (body.type === 'restore') {
    if (!deletedNode)
      return {
        ok: false,
        operationId: command.id,
        code: 'missing',
        message: 'This deletion can no longer be undone.',
      };
    const restored = state.restoreNode(deletedNode, user);
    if (restored.status === 'rejected')
      return rejection(command.id, restored.reason);
    if (restored.status !== 'applied')
      throw new Error('Unexpected restore result');
    return {
      ok: true,
      operationId: command.id,
      change: { type: 'upsert', node: restored.node },
    };
  }
  let change: CanvasMutationResult | CanvasMessageResult;
  if (body.type === 'mutation') {
    const existed =
      body.mutation.action === 'delete' &&
      state
        .snapshot()
        .some(
          (node) =>
            body.mutation.action === 'delete' &&
            node.id === body.mutation.nodeId,
        );
    change = state.applyMutation(body.mutation, user);
    if (change.status === 'rejected')
      return rejection(command.id, change.reason);
    if (change.status === 'deleted')
      return {
        ok: true,
        operationId: command.id,
        change: { type: 'remove', nodeId: change.nodeId },
        undoableDeletion: existed,
      };
    return {
      ok: true,
      operationId: command.id,
      change:
        body.mutation.action === 'move'
          ? {
              type: 'move',
              nodeId: body.mutation.nodeId,
              position: body.mutation.position,
            }
          : { type: 'upsert', node: change.node },
    };
  }
  if (body.type === 'thread') {
    const created = state.applyMutation(
      {
        action: 'create',
        node: { id: body.nodeId, position: body.position, type: 'message' },
      },
      user,
    );
    if (created.status === 'rejected')
      return rejection(command.id, created.reason);
  }
  const nodeId = body.type === 'thread' ? body.nodeId : body.input.nodeId;
  const input = body.type === 'thread' ? body.message : body.input;
  const message = { id: input.id, text: input.text, author: user };
  change = state.appendMessage(nodeId, message);
  if (change.status === 'rejected') return rejection(command.id, change.reason);
  if (change.status === 'ignored') return { ok: true, operationId: command.id };
  return {
    ok: true,
    operationId: command.id,
    change:
      body.type === 'thread'
        ? { type: 'upsert', node: change.node }
        : {
            type: 'message',
            nodeId,
            message,
            messageCount:
              change.node.type === 'message'
                ? (change.node.data.messageCount ??
                  change.node.data.messages.length)
                : 0,
          },
  };
}
