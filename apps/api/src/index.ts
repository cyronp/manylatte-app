import 'dotenv/config';

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import Fastify from 'fastify';
import { Server as SocketServer } from 'socket.io';
import { z } from 'zod';

const environmentSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_URL: z.url().default('http://localhost:5173'),
});

const environment = environmentSchema.parse(process.env);
const app = Fastify({ logger: true });

await app.register(cors, {
  origin: environment.WEB_URL,
  credentials: true,
});
await app.register(helmet);
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});
await app.register(cookie);
await app.register(sensible);

app.get('/health', async () => ({ status: 'ok' }));

const io = new SocketServer(app.server, {
  cors: {
    origin: environment.WEB_URL,
    credentials: true,
  },
});

io.on('connection', (socket) => {
  app.log.info({ socketId: socket.id }, 'Socket.IO client connected');

  socket.on('disconnect', (reason) => {
    app.log.info(
      { socketId: socket.id, reason },
      'Socket.IO client disconnected',
    );
  });
});

try {
  await app.listen({ host: '0.0.0.0', port: environment.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
