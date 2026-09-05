import {
  MAX_CANVAS_MESSAGES_PER_NODE,
  type CanvasMessage,
  type CanvasNode,
  type CanvasNodeCreate,
  type CanvasNodeMutation,
} from '@app/shared';

const DEFAULT_MAX_CANVAS_NODES = 500;

export type CanvasMutationResult =
  | { nodeId: string; status: 'deleted' }
  | { node: CanvasNode; status: 'applied' }
  | {
      reason: 'node-already-exists' | 'node-limit' | 'node-missing';
      status: 'rejected';
    };

export type CanvasMessageResult =
  | { node: CanvasNode; status: 'applied' }
  | { status: 'ignored' }
  | {
      reason: 'message-limit' | 'message-node-missing';
      status: 'rejected';
    };

interface CanvasStateOptions {
  nodes?: readonly CanvasNode[];
  maxMessagesPerNode?: number;
  maxNodes?: number;
}

const createCanvasNode = (node: CanvasNodeCreate): CanvasNode =>
  node.type === 'message' ? { ...node, data: { messages: [] } } : node;

export class CanvasState {
  readonly #maxMessagesPerNode: number;
  readonly #maxNodes: number;
  readonly #nodes = new Map<string, CanvasNode>();

  constructor({
    nodes = [],
    maxMessagesPerNode = MAX_CANVAS_MESSAGES_PER_NODE,
    maxNodes = DEFAULT_MAX_CANVAS_NODES,
  }: CanvasStateOptions = {}) {
    this.#maxMessagesPerNode = maxMessagesPerNode;
    this.#maxNodes = maxNodes;
    for (const node of nodes) this.#nodes.set(node.id, node);
  }

  fork() {
    return new CanvasState({
      nodes: this.snapshot(),
      maxMessagesPerNode: this.#maxMessagesPerNode,
      maxNodes: this.#maxNodes,
    });
  }

  applyMutation(mutation: CanvasNodeMutation): CanvasMutationResult {
    if (mutation.action === 'delete') {
      this.#nodes.delete(mutation.nodeId);
      return { nodeId: mutation.nodeId, status: 'deleted' };
    }

    if (mutation.action === 'move') {
      const node = this.#nodes.get(mutation.nodeId);

      if (!node) {
        return { reason: 'node-missing', status: 'rejected' };
      }

      const nextNode = { ...node, position: mutation.position };
      this.#nodes.set(nextNode.id, nextNode);
      return { node: nextNode, status: 'applied' };
    }

    if (this.#nodes.has(mutation.node.id)) {
      return { reason: 'node-already-exists', status: 'rejected' };
    }

    if (this.#nodes.size >= this.#maxNodes) {
      return { reason: 'node-limit', status: 'rejected' };
    }

    const nextNode = createCanvasNode(mutation.node);
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

    if (node.data.messages.length >= this.#maxMessagesPerNode) {
      return { reason: 'message-limit', status: 'rejected' };
    }

    const nextNode: CanvasNode = {
      ...node,
      data: { messages: [...node.data.messages, message] },
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
