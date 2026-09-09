import { createServer } from 'node:http';
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { createDatabase } from '@app/db';
import { createApp } from '../../api/dist/app.js';

const directory = await mkdtemp(join(tmpdir(), 'manylatte-browser-'));
const databaseUrl = `file:${join(directory, 'browser.db')}`;
const migrations = new URL(
  '../../../packages/db/prisma/migrations/',
  import.meta.url,
);
const names = (await readdir(migrations, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map(({ name }) => name)
  .sort();
const sql = (
  await Promise.all(
    names.map((name) =>
      readFile(new URL(`${name}/migration.sql`, migrations), 'utf8'),
    ),
  )
).join('\n');
let database = createDatabase(databaseUrl, sql);
const options = () => ({
  database,
  logger: false,
  allowedOrigins: ['http://127.0.0.1:4173'],
  maxConnectionsPerIp: 20,
});
let api = await createApp(options());
await api.listen({ host: '127.0.0.1', port: 3000 });
const dist = resolve('dist');
const headers = Object.fromEntries(
  (await readFile(join(dist, '_headers'), 'utf8'))
    .split('\n')
    .filter((line) => line.startsWith('  '))
    .map((line) => {
      const separator = line.indexOf(':');
      return [
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim(),
      ];
    }),
);
const server = createServer(async (request, response) => {
  try {
    if (request.method === 'POST') {
      if (request.url === '/test/restart') {
        await api.close();
        database = createDatabase(databaseUrl);
        api = await createApp(options());
        await api.listen({ host: '127.0.0.1', port: 3000 });
      } else if (request.url === '/test/fail')
        await database.$executeRawUnsafe(
          "CREATE TRIGGER fail_browser_message BEFORE INSERT ON CanvasMessage BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END",
        );
      else if (request.url === '/test/recover')
        await database.$executeRawUnsafe('DROP TRIGGER fail_browser_message');
      else {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200).end('ok');
      return;
    }
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = pathname.startsWith('/assets/')
      ? resolve(dist, '.' + pathname)
      : join(dist, 'index.html');
    if (
      !file.startsWith(
        dist + '/'.replace('/', process.platform === 'win32' ? '\\' : '/'),
      )
    ) {
      response.writeHead(404).end();
      return;
    }
    const content = await readFile(file);
    response.writeHead(200, {
      ...headers,
      'Content-Type':
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.woff2': 'font/woff2',
        }[extname(file)] ?? 'application/octet-stream',
    });
    response.end(content);
  } catch (error) {
    console.error(error);
    response.writeHead(500).end('Test server failed');
  }
});
server.listen(4173, '127.0.0.1');
async function close() {
  await api.close();
  server.close();
  await rm(directory, { recursive: true, force: true });
  process.exit();
}
process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
