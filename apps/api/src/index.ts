import 'dotenv/config';

import { createApp } from './app.js';
import { readApiEnvironment } from './environment.js';

let app: Awaited<ReturnType<typeof createApp>> | undefined;
try {
  const environment = readApiEnvironment();
  app = await createApp(environment);
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown || !app) return;
    shuttingDown = true;
    const deadline = setTimeout(() => process.exit(1), 10_000);
    deadline.unref();
    void app
      .close()
      .then(() => clearTimeout(deadline))
      .catch((error: unknown) => {
        app?.log.error(error);
        process.exitCode = 1;
      });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await app.listen({ host: '0.0.0.0', port: environment.port });
} catch (error) {
  if (app) {
    app.log.error(error);
    await app.close();
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
