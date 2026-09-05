import type { CanvasMessage, CanvasNodeMutation } from '@app/shared';

import type { CanvasPersistence } from './canvas-persistence.js';
import { CanvasState } from './canvas-state.js';

// One queue per room preserves command order while SQLite writes are in flight.
// A candidate state only becomes visible after its write has committed.
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
    // A failed command must not poison subsequent commands or prevent shutdown.
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  applyMutation(mutation: CanvasNodeMutation) {
    return this.#enqueue(async (state) => {
      const candidate = state.fork();
      const result = candidate.applyMutation(mutation);
      if (result.status === 'rejected') return result;
      await this.persistence.mutate(this.roomId, mutation);
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
