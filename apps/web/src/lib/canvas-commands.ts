import {
  CANVAS_EVENTS,
  canvasCommandResultSchema,
  type CanvasCommand,
  type CanvasCommandResult,
} from '@app/shared';
import type { CursorSocket } from './socket';

// Never enqueue application writes in Socket.IO's disconnected send buffer.
export async function sendCanvasCommand(
  socket: CursorSocket,
  ready: boolean,
  command: CanvasCommand,
): Promise<CanvasCommandResult> {
  if (!ready || !socket.connected)
    return {
      ok: false,
      operationId: command.id,
      code: 'offline',
      message: 'Reconnect before editing. Your message is still here.',
    };
  try {
    const result: unknown = await socket
      .timeout(8_000)
      .emitWithAck(CANVAS_EVENTS.command, command);
    return canvasCommandResultSchema.parse(result);
  } catch {
    return {
      ok: false,
      operationId: command.id,
      code: 'storage',
      message: 'Could not confirm this edit. Retry to safely confirm it.',
    };
  }
}

export function createCommandQueue(socket: CursorSocket, ready: () => boolean) {
  const queue: {
    command: CanvasCommand;
    resolve: (result: CanvasCommandResult) => void;
  }[] = [];
  let running = false;
  const offline = (id: string): CanvasCommandResult => ({
    ok: false,
    operationId: id,
    code: 'offline',
    message: 'Reconnect before editing. Your message is still here.',
  });
  const clear = () => {
    for (const item of queue.splice(0)) item.resolve(offline(item.command.id));
  };
  const drain = async () => {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const item = queue.shift()!;
        item.resolve(await sendCanvasCommand(socket, ready(), item.command));
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    } finally {
      running = false;
    }
  };
  return {
    clear,
    send: (command: CanvasCommand): Promise<CanvasCommandResult> => {
      if (!ready() || !socket.connected)
        return Promise.resolve(offline(command.id));
      if (queue.length >= 500)
        return Promise.resolve({
          ok: false,
          operationId: command.id,
          code: 'busy',
          message: 'Wait for your pending edits to finish.',
        });
      return new Promise((resolve) => {
        queue.push({ command, resolve });
        void drain();
      });
    },
  };
}
