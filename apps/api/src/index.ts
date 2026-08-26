import 'dotenv/config';

import { createApp } from './app.js';
import { readApiEnvironment } from './environment.js';

const environment = readApiEnvironment();
const app = await createApp(environment);

try {
  await app.listen({ host: '0.0.0.0', port: environment.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
