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
        | 'thread-changed'
        | 'not-postit-node'
        | 'not-owner'
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
  if (node.type === 'postit') return { ...node, data: { ...node.data, user } };
  return { ...node, data: { ...node.data, user } };
};

const messageCount = (node: CanvasNode) =>
  node.type === 'message'
    ? (node.data.messageCount ?? node.data.messages.length)
    : 0;

const textBytes = (node: CanvasNode) =>
  node.type === 'message'
    ? (node.data.textBytes ??
      node.data.messages.reduce(
        (total, message) => total + Buffer.byteLength(message.text),
        0,
      ))
    : 0;

export class CanvasState {
  readonly #maxMessagesPerNode: number;
  readonly #maxNodes: number;
  readonly #retainedMessages: number;
  #nodes = new Map<string, CanvasNode>();
  #messageCount = 0;
  #textBytes = 0;

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
    for (const node of this.#nodes.values()) {
      this.#messageCount += messageCount(node);
      this.#textBytes += textBytes(node);
    }
  }

  fork() {
    const candidate = new CanvasState({
      maxMessagesPerNode: this.#maxMessagesPerNode,
      maxNodes: this.#maxNodes,
      retainedMessages: this.#retainedMessages,
    });
    // Mutations replace nodes, so a shallow map copy isolates pending writes.
    candidate.#nodes = new Map(this.#nodes);
    candidate.#messageCount = this.#messageCount;
    candidate.#textBytes = this.#textBytes;
    return candidate;
  }

  applyMutation(
    mutation: CanvasNodeMutation,
    user: CursorUser,
  ): CanvasMutationResult {
    if (mutation.action === 'update-postit') {
      const node = this.#nodes.get(mutation.nodeId);
      if (!node) return { reason: 'node-missing', status: 'rejected' };
      if (node.type !== 'postit')
        return { reason: 'not-postit-node', status: 'rejected' };
      if (node.data.user.userId !== user.userId)
        return { reason: 'not-owner', status: 'rejected' };
      const nextNode = {
        ...node,
        data: {
          ...node.data,
          ...(mutation.text !== undefined ? { text: mutation.text } : {}),
          ...(mutation.color !== undefined ? { color: mutation.color } : {}),
        },
      };
      this.#nodes.set(node.id, nextNode);
      return { node: nextNode, status: 'applied' };
    }
    if (mutation.action === 'delete') {
      const node = this.#nodes.get(mutation.nodeId);
      if (mutation.expectedMessageId) {
        if (
          node &&
          (node.type !== 'message' ||
            (node.data.messageCount ?? node.data.messages.length) !== 1 ||
            node.data.messages[0]?.id !== mutation.expectedMessageId)
        )
          return { reason: 'thread-changed', status: 'rejected' };
      }
      if (node) {
        this.#messageCount -= messageCount(node);
        this.#textBytes -= textBytes(node);
      }
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

    const count = messageCount(node);
    if (count >= this.#maxMessagesPerNode) {
      return { reason: 'message-limit', status: 'rejected' };
    }

    const bytes = Buffer.byteLength(message.text);
    if (
      this.#messageCount >= MAX_CANVAS_ROOM_MESSAGES ||
      this.#textBytes + bytes > MAX_CANVAS_ROOM_TEXT_BYTES
    )
      return { status: 'rejected', reason: 'room-limit' };
    const nextNode: CanvasNode = {
      ...node,
      data: {
        messages: [...node.data.messages, message].slice(
          -this.#retainedMessages,
        ),
        messageCount: count + 1,
        textBytes: textBytes(node) + bytes,
      },
    };
    this.#nodes.set(nextNode.id, nextNode);
    this.#messageCount++;
    this.#textBytes += bytes;
    return { node: nextNode, status: 'applied' };
  }

  hasNode(nodeId: string) {
    return this.#nodes.has(nodeId);
  }

  hasMessageNode(nodeId: string) {
    return this.#nodes.get(nodeId)?.type === 'message';
  }

  restoreNode(
    node: CanvasNode,
    user: CursorUser,
  ): CanvasMutationResult | CanvasMessageResult {
    const created = this.applyMutation({ action: 'create', node }, user);
    if (created.status !== 'applied') return created;
    if (node.type !== 'message') {
      // Preserve the original author, including legacy anonymous reactions.
      this.#nodes.set(node.id, node);
      return { status: 'applied', node };
    }
    for (const message of node.data.messages) {
      const result = this.appendMessage(node.id, message);
      if (result.status === 'rejected') return result;
    }
    return { status: 'applied', node: this.#nodes.get(node.id)! };
  }

  snapshot() {
    return Array.from(this.#nodes.values());
  }
}
