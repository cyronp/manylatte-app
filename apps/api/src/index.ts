import 'dotenv/config';

import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const webUrl = process.env.WEB_URL ?? 'http://localhost:5173';
const redisUrl = process.env.REDIS_URL;
const app = await createApp({ redisUrl, webUrl });

try {
  await app.listen({ host: '0.0.0.0', port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
