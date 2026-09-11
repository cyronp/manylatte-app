import type { Server } from 'node:http';
import type { Socket } from 'node:net';

// Browsers can preconnect without sending an HTTP request. Node's idle HTTP
// cleanup does not close those sockets, which can otherwise stall API shutdown.
export function trackIdleHttpConnections(server: Server) {
  const unused = new Set<Socket>();
  server.on('connection', (socket) => {
    unused.add(socket);
    const remove = () => unused.delete(socket);
    socket.once('data', remove);
    socket.once('close', () => {
      unused.delete(socket);
      socket.off('data', remove);
    });
  });
  return () => {
    server.closeIdleConnections();
    for (const socket of unused) socket.destroy();
    unused.clear();
  };
}
