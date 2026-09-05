import type {
  CanvasMessage,
  CanvasNodeMutation,
  CursorUser,
} from '@app/shared';

import type { CanvasPersistence } from './canvas-persistence.js';
import { CanvasState } from './canvas-state.js';

export class PersistentCanvas {
  #state: CanvasState | undefined;
  #tail = Promise.resolve();

  constructor(
    private readonly roomId: string,
    private readonly persistence: CanvasPersistence,
  ) {}

  #enqueue<T>(operation: (state: CanvasState) => Promise<T> | T): Promise<T> {
    const result = this.#tail.then(async () => {
      this.#state ??= new CanvasState({
        nodes: await this.persistence.load(this.roomId),
      });
      return operation(this.#state);
    });
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  applyMutation(mutation: CanvasNodeMutation, user?: CursorUser) {
    return this.#enqueue(async (state) => {
      const candidate = state.fork();
      const result = candidate.applyMutation(mutation, user);
      if (result.status === 'rejected') return result;
      await this.persistence.mutate(this.roomId, mutation, user);
      this.#state = candidate;
      return result;
    });
  }

  appendMessage(nodeId: string, message: CanvasMessage) {
    return this.#enqueue(async (state) => {
      const candidate = state.fork();
      const result = candidate.appendMessage(nodeId, message);
      if (result.status !== 'applied') return result;
      await this.persistence.appendMessage(this.roomId, nodeId, message);
      this.#state = candidate;
      return result;
    });
  }

  hasMessageNode(nodeId: string) {
    return this.#enqueue((state) => state.hasMessageNode(nodeId));
  }

  snapshot() {
    return this.#enqueue((state) => state.snapshot());
  }

  drain() {
    return this.#tail;
  }
}
