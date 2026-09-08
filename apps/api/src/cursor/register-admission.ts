import { cursorSocketAuthSchema, type CursorRoomId } from '@app/shared';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CursorIo } from './cursor-server.js';
import { ConnectionAdmission } from './connection-admission.js';
import {
  createAddressResolver,
  type TrustedProxies,
} from '../client-address.js';
import { createCoffeeGuestUsername } from './guest-username.js';

export function registerAdmission(
  io: CursorIo,
  options: {
    authorizeRoom: (id: CursorRoomId) => boolean | Promise<boolean>;
    maxConnectionsPerIp: number;
    maxTotalConnections: number;
    maxParticipantsPerRoom: number;
    trustProxy: TrustedProxies;
    now: () => number;
    logger: { error: (context: object, message: string) => void };
  },
) {
  const admission = new ConnectionAdmission(options, options.now);
  const addressFor = createAddressResolver(options.trustProxy);
  const pending = new WeakMap<
    IncomingMessage,
    { release: () => void; timer: NodeJS.Timeout }
  >();
  io.engine.use(
    (
      request: IncomingMessage,
      response: ServerResponse,
      next: (error?: Error) => void,
    ) => {
      if (
        new URL(request.url ?? '/', 'http://localhost').searchParams.has('sid')
      )
        return next();
      const ip = addressFor(request);
      if (!admission.attempt(ip))
        return next(new Error('Connection rate limit exceeded'));
      const release = admission.reserveTransport(ip);
      if (!release) return next(new Error('Connection capacity reached'));
      const timer = setTimeout(() => {
        release();
        request.socket.destroy();
      }, 10_000);
      timer.unref();
      const reservation = { release, timer };
      pending.set(request, reservation);
      const lifecycle =
        typeof response.once === 'function' ? response : request.socket;
      lifecycle.once('close', () => {
        if (pending.get(request) === reservation) {
          clearTimeout(timer);
          release();
          pending.delete(request);
        }
      });
      next();
    },
  );
  io.engine.on('connection', (transport) => {
    const reservation = pending.get(transport.request);
    if (!reservation) {
      transport.close();
      return;
    }
    pending.delete(transport.request);
    clearTimeout(reservation.timer);
    transport.once('close', reservation.release);
  });
  io.use(async (socket, next) => {
    const deny = (message: string, retryable: boolean) => {
      const error = Object.assign(new Error(message), { data: { retryable } });
      next(error);
      // Rejected namespaces must not retain an unauthenticated transport.
      const timer = setTimeout(() => socket.conn.close(), 100);
      timer.unref();
    };
    try {
      const auth = cursorSocketAuthSchema.safeParse(socket.handshake.auth);
      if (!auth.success) return deny('Invalid cursor connection', false);
      if (!(await options.authorizeRoom(auth.data.roomId)))
        return deny('Cursor room access denied', false);
      if (socket.conn.readyState !== 'open') return;
      const release = admission.reserveRoom(auth.data.roomId);
      if (!release) return deny('Cursor room is full', true);
      socket.conn.once('close', release);
      socket.once('disconnect', release);
      socket.data.cursorIpAddress = addressFor(socket.request);
      socket.data.cursorRoomId = auth.data.roomId;
      socket.data.cursorUsername =
        auth.data.username ?? createCoffeeGuestUsername();
      next();
    } catch (error) {
      options.logger.error(
        { errorType: error instanceof Error ? error.name : 'unknown', socketId: socket.id },
        'Room authorization failed',
      );
      deny('Cursor connection unavailable', true);
    }
  });
  return admission;
}
