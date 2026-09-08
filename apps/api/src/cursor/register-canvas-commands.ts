import { randomUUID } from 'node:crypto';
import {
  CANVAS_EVENTS,
  canvasCommandSchema,
  canvasHistoryInputSchema,
  type CanvasCommand,
  type CanvasCommandAck,
  type CanvasCommandResult,
} from '@app/shared';
import type {
  CursorIo,
  CursorSocket,
  CursorRoom,
  Participant,
  CursorLogger,
} from './cursor-types.js';
import type { OperationMetrics } from './operation-metrics.js';
import { CanvasBusyError } from './work-budget.js';

export function registerCanvasCommands(
  io: CursorIo,
  socket: CursorSocket,
  room: CursorRoom,
  participant: Participant,
  options: {
    acceptMessageBudget: (event: string) => number | undefined;
    recordViolation: (reason: string) => void;
    logger: CursorLogger;
    metrics: OperationMetrics;
  },
) {
  const roomId = socket.data.cursorRoomId;
  const run = async (
    input: unknown,
    ack?: CanvasCommandAck,
    legacy = false,
  ) => {
    const operationId =
      input &&
      typeof input === 'object' &&
      'id' in input &&
      typeof input.id === 'string'
        ? input.id.slice(0, 36)
        : '';
    const reply = (result: CanvasCommandResult) => {
      if (typeof ack === 'function') ack(result);
      else if (!result.ok)
        socket.emit(CANVAS_EVENTS.error, { message: result.message });
    };
    const at = options.acceptMessageBudget(CANVAS_EVENTS.command);
    if (at === undefined)
      return reply({
        ok: false,
        operationId,
        code: 'busy',
        message: 'Too many edits. Please try again shortly.',
      });
    const parsed = canvasCommandSchema.safeParse(input);
    if (!parsed.success) {
      options.recordViolation('invalid:canvas-command');
      return reply({
        ok: false,
        operationId,
        code: 'invalid',
        message:
          'Check the message length (1–1,000 characters) and board position.',
      });
    }
    const started = performance.now();
    try {
      const { result, replayed } = await room.canvas.execute(parsed.data, {
        color: participant.color,
        username: participant.username,
        userId: participant.userId,
      });
      if (result.ok && result.change && !replayed) {
        participant.lastActivityAt = at;
        const change = result.change;
        if (change.type === 'remove') {
          for (const person of room.participants.values())
            person.typingNodeIds.delete(change.nodeId);
        }
        io.to(roomId).emit(CANVAS_EVENTS.change, change);
        // Compatibility events remain bounded by the one-message node preview.
        if (legacy) {
          if (change.type === 'remove')
            io.to(roomId).emit(CANVAS_EVENTS.nodeRemove, {
              nodeId: change.nodeId,
            });
          else if (change.type === 'upsert')
            io.to(roomId).emit(CANVAS_EVENTS.nodeUpsert, change.node);
          else {
            const node = (await room.canvas.snapshot()).find(
              (node) => node.id === change.nodeId,
            );
            if (node) io.to(roomId).emit(CANVAS_EVENTS.nodeUpsert, node);
          }
        }
        const body = parsed.data.body;
        if (
          body.type === 'message' &&
          participant.typingNodeIds.delete(body.input.nodeId)
        )
          socket.to(roomId).emit(CANVAS_EVENTS.typing, {
            isTyping: false,
            nodeId: body.input.nodeId,
            user: {
              color: participant.color,
              username: participant.username,
              userId: participant.userId,
            },
          });
      }
      options.metrics.record(performance.now() - started);
      reply(result);
    } catch (error) {
      if (error instanceof CanvasBusyError) options.metrics.busy++;
      else options.metrics.writeFailures++;
      const busy = error instanceof CanvasBusyError;
      if (!busy)
        options.logger.error(
          {
            socketId: socket.id,
            operationId,
            errorType: error instanceof Error ? error.name : 'Unknown',
          },
          'Canvas command failed',
        );
      reply({
        ok: false,
        operationId,
        code: busy ? 'busy' : 'storage',
        message: busy
          ? error.message
          : 'The edit could not be saved. Your draft is still available; please try again.',
      });
    }
  };
  socket.on(CANVAS_EVENTS.command, (input, ack) => {
    void run(input, ack);
  });
  socket.on(CANVAS_EVENTS.mutation, (mutation) => {
    void run(
      {
        id: randomUUID(),
        body: { type: 'mutation', mutation },
      } satisfies CanvasCommand,
      undefined,
      true,
    );
  });
  socket.on(CANVAS_EVENTS.messageSend, (input) => {
    void run(
      {
        id: randomUUID(),
        body: { type: 'message', input },
      } satisfies CanvasCommand,
      undefined,
      true,
    );
  });
  socket.on(CANVAS_EVENTS.history, (input, ack) => {
    if (typeof ack !== 'function') return;
    const parsed = canvasHistoryInputSchema.safeParse(input);
    if (
      options.acceptMessageBudget(CANVAS_EVENTS.history) === undefined ||
      !parsed.success
    )
      return ack({
        ok: false,
        message: 'History is unavailable. Please try again shortly.',
      });
    void room.canvas.history(parsed.data).then(
      (page) => ack({ ok: true, page }),
      () =>
        ack({
          ok: false,
          message: 'History could not be loaded. Please try again.',
        }),
    );
  });
}
