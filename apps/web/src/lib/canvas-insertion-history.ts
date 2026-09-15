import type {
  CanvasChange,
  CanvasCommand,
  CanvasCommandBody,
  CanvasCommandResult,
} from '@app/shared';

type Insertion =
  | Extract<CanvasCommandBody, { type: 'thread' }>
  | {
      type: 'mutation';
      mutation: Extract<
        Extract<CanvasCommandBody, { type: 'mutation' }>['mutation'],
        { action: 'create' }
      >;
    };

interface Entry {
  body: Insertion;
  // Reuse an operation ID after an uncertain acknowledgement.
  pending?: CanvasCommand;
}

const MAX_HISTORY = 100;
const nodeId = (body: Insertion) =>
  body.type === 'thread' ? body.nodeId : body.mutation.node.id;
const isInsertion = (body: CanvasCommandBody): body is Insertion =>
  body.type === 'thread' ||
  (body.type === 'mutation' && body.mutation.action === 'create');

export function createCanvasInsertionHistory(
  send: (command: CanvasCommand) => Promise<CanvasCommandResult>,
) {
  let undo: Entry[] = [];
  let redo: Entry[] = [];
  let tail = Promise.resolve();
  let generation = 0;
  // Includes snapshots and remote changes, so manually deleted nodes are skipped.
  let present = new Set<string>();

  const serialize = <T>(work: () => Promise<T>, cancelled: () => T) => {
    const current = generation;
    const result = tail.then(() =>
      current === generation ? work() : cancelled(),
    );
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    disconnect() {
      // Do not replay edits waiting in this queue after a reconnect.
      generation++;
    },
    snapshot(ids: string[]) {
      present = new Set(ids);
    },
    change(change: CanvasChange) {
      if (change.type === 'upsert') present.add(change.node.id);
      if (change.type === 'remove') present.delete(change.nodeId);
      // Keep the latest position/reaction for redo without recording extra actions.
      for (const entry of undo) {
        const id = nodeId(entry.body);
        if (change.type === 'move' && change.nodeId === id) {
          if (entry.body.type === 'thread')
            entry.body.position = change.position;
          else entry.body.mutation.node.position = change.position;
        }
        if (
          change.type === 'upsert' &&
          change.node.id === id &&
          change.node.type === 'emoji' &&
          entry.body.type === 'mutation'
        ) {
          const { id, position, data } = change.node;
          entry.body.mutation.node = {
            id,
            position,
            type: 'emoji',
            data: { emoji: data.emoji, label: data.label },
          };
        }
      }
    },
    execute(command: CanvasCommand) {
      return serialize(
        async () => {
          const result = await send(command);
          if (result.ok && isInsertion(command.body)) {
            const id = nodeId(command.body);
            if (!undo.some((entry) => nodeId(entry.body) === id)) {
              undo.push({ body: structuredClone(command.body) });
              undo = undo.slice(-MAX_HISTORY);
              redo = [];
            }
            present.add(id);
          }
          return result;
        },
        () => ({
          ok: false as const,
          operationId: command.id,
          code: 'offline' as const,
          message: 'Reconnect before editing.',
        }),
      );
    },
    undo() {
      return serialize(
        async () => {
          while (undo.length) {
            const entry = undo.at(-1)!;
            const id = nodeId(entry.body);
            if (!present.has(id) && !entry.pending) {
              undo.pop();
              continue;
            }
            entry.pending ??= {
              id: crypto.randomUUID(),
              body: {
                type: 'mutation',
                mutation: {
                  action: 'delete',
                  nodeId: id,
                  ...(entry.body.type === 'thread'
                    ? { expectedMessageId: entry.body.message.id }
                    : {}),
                },
              },
            };
            const result = await send(entry.pending);
            if (result.ok) {
              undo.pop();
              redo.push({ body: entry.body });
              present.delete(id);
            } else if (result.code === 'conflict') {
              // Replies permanently invalidate insertion undo; allow older entries next.
              undo.pop();
            }
            return result;
          }
        },
        () => undefined,
      );
    },
    redo() {
      return serialize(
        async () => {
          const entry = redo.at(-1);
          if (!entry) return;
          entry.pending ??= { id: crypto.randomUUID(), body: entry.body };
          const result = await send(entry.pending);
          if (result.ok) {
            redo.pop();
            undo.push({ body: entry.body });
            present.add(nodeId(entry.body));
          }
          return result;
        },
        () => undefined,
      );
    },
  };
}
