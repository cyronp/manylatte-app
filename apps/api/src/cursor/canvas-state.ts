import {
  MAX_CANVAS_MESSAGES_PER_NODE,
  MAX_CANVAS_ROOM_MESSAGES,
  MAX_CANVAS_ROOM_TEXT_BYTES,
  type CanvasMessage,
  type CanvasNode,
  type CanvasNodeCreate,
  type CanvasNodeMutation,
  type CursorUser,
} from '@app/shared';

const DEFAULT_MAX_CANVAS_NODES = 500;

export type CanvasMutationResult =
  | { nodeId: string; status: 'deleted' }
  | { node: CanvasNode; status: 'applied' }
  | {
      reason:
        | 'node-already-exists'
        | 'node-limit'
        | 'node-missing'
        | 'not-emoji-node';
      status: 'rejected';
    };

export type CanvasMessageResult =
  | { node: CanvasNode; status: 'applied' }
  | { status: 'ignored' }
  | {
      reason: 'message-limit' | 'room-limit' | 'message-node-missing';
      status: 'rejected';
    };

interface CanvasStateOptions {
  nodes?: readonly CanvasNode[];
  maxMessagesPerNode?: number;
  maxNodes?: number;
  retainedMessages?: number;
}

const createCanvasNode = (
  node: CanvasNodeCreate,
  user: CursorUser,
): CanvasNode => {
  if (node.type === 'message') return { ...node, data: { messages: [] } };
  return { ...node, data: { ...node.data, user } };
};

export class CanvasState {
  readonly #maxMessagesPerNode: number;
  readonly #maxNodes: number;
  readonly #retainedMessages: number;
  readonly #nodes = new Map<string, CanvasNode>();

  constructor({
    nodes = [],
    maxMessagesPerNode = MAX_CANVAS_MESSAGES_PER_NODE,
    maxNodes = DEFAULT_MAX_CANVAS_NODES,
    retainedMessages = MAX_CANVAS_MESSAGES_PER_NODE,
  }: CanvasStateOptions = {}) {
    this.#maxMessagesPerNode = maxMessagesPerNode;
    this.#maxNodes = maxNodes;
    this.#retainedMessages = retainedMessages;
    for (const node of nodes) this.#nodes.set(node.id, node);
  }

  fork() {
    return new CanvasState({
      nodes: this.snapshot(),
      maxMessagesPerNode: this.#maxMessagesPerNode,
      maxNodes: this.#maxNodes,
      retainedMessages: this.#retainedMessages,
    });
  }

  applyMutation(
    mutation: CanvasNodeMutation,
    user: CursorUser,
  ): CanvasMutationResult {
    if (mutation.action === 'delete') {
      this.#nodes.delete(mutation.nodeId);
      return { nodeId: mutation.nodeId, status: 'deleted' };
    }

    if (mutation.action === 'move' || mutation.action === 'update-reaction') {
      const node = this.#nodes.get(mutation.nodeId);

      if (!node) {
        return { reason: 'node-missing', status: 'rejected' };
      }

      if (mutation.action === 'move') {
        const nextNode = { ...node, position: mutation.position };
        this.#nodes.set(nextNode.id, nextNode);
        return { node: nextNode, status: 'applied' };
      }

      if (node.type !== 'emoji') {
        return { reason: 'not-emoji-node', status: 'rejected' };
      }
      const nextNode = { ...node, data: { ...node.data, ...mutation.data } };
      this.#nodes.set(nextNode.id, nextNode);
      return { node: nextNode, status: 'applied' };
    }

    if (this.#nodes.has(mutation.node.id)) {
      return { reason: 'node-already-exists', status: 'rejected' };
    }

    if (this.#nodes.size >= this.#maxNodes) {
      return { reason: 'node-limit', status: 'rejected' };
    }

    const nextNode = createCanvasNode(mutation.node, user);
    this.#nodes.set(nextNode.id, nextNode);
    return { node: nextNode, status: 'applied' };
  }

  appendMessage(nodeId: string, message: CanvasMessage): CanvasMessageResult {
    const node = this.#nodes.get(nodeId);

    if (!node || node.type !== 'message') {
      return { reason: 'message-node-missing', status: 'rejected' };
    }

    if (node.data.messages.some(({ id }) => id === message.id)) {
      return { status: 'ignored' };
    }

    const messageCount = node.data.messageCount ?? node.data.messages.length;
    if (messageCount >= this.#maxMessagesPerNode) {
      return { reason: 'message-limit', status: 'rejected' };
    }

    const totals = this.snapshot().reduce(
      (total, item) =>
        item.type === 'message'
          ? {
              count:
                total.count +
                (item.data.messageCount ?? item.data.messages.length),
              bytes:
                total.bytes +
                (item.data.textBytes ??
                  item.data.messages.reduce(
                    (bytes, entry) => bytes + Buffer.byteLength(entry.text),
                    0,
                  )),
            }
          : total,
      { count: 0, bytes: 0 },
    );
    const bytes = Buffer.byteLength(message.text);
    if (
      totals.count >= MAX_CANVAS_ROOM_MESSAGES ||
      totals.bytes + bytes > MAX_CANVAS_ROOM_TEXT_BYTES
    )
      return { status: 'rejected', reason: 'room-limit' };
    const nextNode: CanvasNode = {
      ...node,
      data: {
        messages: [...node.data.messages, message].slice(
          -this.#retainedMessages,
        ),
        messageCount: messageCount + 1,
        textBytes:
          (node.data.textBytes ??
            node.data.messages.reduce(
              (total, item) => total + Buffer.byteLength(item.text),
              0,
            )) + bytes,
      },
    };
    this.#nodes.set(nextNode.id, nextNode);
    return { node: nextNode, status: 'applied' };
  }

  hasMessageNode(nodeId: string) {
    return this.#nodes.get(nodeId)?.type === 'message';
  }

  snapshot() {
    return Array.from(this.#nodes.values());
  }
}
