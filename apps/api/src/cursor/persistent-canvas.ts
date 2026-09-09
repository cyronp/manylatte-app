import type {
  CanvasCommand,
  CanvasCommandResult,
  CanvasHistoryInput,
  CanvasMessage,
  CanvasNodeMutation,
  CursorUser,
} from '@app/shared';
import { CANVAS_PREVIEW_MESSAGES } from '@app/shared';
import { createHash } from 'node:crypto';
import { prepareCommand } from './prepare-command.js';
import { WorkBudget } from './work-budget.js';

import type { CanvasPersistence } from './canvas-persistence.js';
import { CanvasState } from './canvas-state.js';

export class PersistentCanvas {
  #state: CanvasState | undefined;
  #tail = Promise.resolve();
  #budget = new WorkBudget(64);

  constructor(
    private readonly roomId: string,
    private readonly persistence: CanvasPersistence,
    private readonly globalBudget = new WorkBudget(),
  ) {}

  #enqueue<T>(operation: (state: CanvasState) => Promise<T> | T): Promise<T> {
    let releaseRoom: () => void;
    let releaseGlobal: () => void;
    try {
      releaseRoom = this.#budget.reserve();
      try {
        releaseGlobal = this.globalBudget.reserve();
      } catch (error) {
        releaseRoom();
        throw error;
      }
    } catch (error) {
      return Promise.reject(error);
    }
    const result = this.#tail
      .then(async () => {
        this.#state ??= new CanvasState({
          nodes: await this.persistence.load(this.roomId),
          retainedMessages: CANVAS_PREVIEW_MESSAGES,
        });
        return operation(this.#state);
      })
      .finally(() => {
        releaseRoom();
        releaseGlobal();
      });
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  applyMutation(mutation: CanvasNodeMutation, user: CursorUser) {
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
      if (await this.persistence.hasMessage(this.roomId, nodeId, message.id))
        return { status: 'ignored' as const };
      const candidate = state.fork();
      const result = candidate.appendMessage(nodeId, message);
      if (result.status !== 'applied') return result;
      await this.persistence.appendMessage(this.roomId, nodeId, message);
      this.#state = candidate;
      return result;
    });
  }

  execute(command: CanvasCommand, user: CursorUser) {
    return this.#enqueue(
      async (
        state,
      ): Promise<{ result: CanvasCommandResult; replayed: boolean }> => {
        const hash = createHash('sha256')
          .update(JSON.stringify(command.body))
          .digest('hex');
        const receipt = await this.persistence.receipt(this.roomId, command.id);
        if (receipt)
          return {
            replayed: true,
            result:
              receipt.hash === hash
                ? receipt.result
                : {
                    ok: false,
                    operationId: command.id,
                    code: 'conflict',
                    message:
                      'This operation ID was already used for another edit.',
                  },
          };
        const candidate = state.fork();
        const body = command.body;
        const alreadySent =
          body.type === 'message' &&
          (await this.persistence.hasMessage(
            this.roomId,
            body.input.nodeId,
            body.input.id,
          ));
        const result: CanvasCommandResult = alreadySent
          ? { ok: true, operationId: command.id }
          : prepareCommand(candidate, command, user);
        if (result.ok) {
          await this.persistence.commit(
            this.roomId,
            command,
            hash,
            user,
            result,
          );
          this.#state = candidate;
        }
        return { result, replayed: false };
      },
    );
  }

  history(input: CanvasHistoryInput) {
    return this.#enqueue(() => this.persistence.history(this.roomId, input));
  }

  get pending() {
    return this.#budget.pending;
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
