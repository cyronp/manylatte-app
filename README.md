# ManyLatte

A shared canvas built with React, Fastify, Socket.IO, and SQLite. Prisma manages
the database schema and migrations. Cursor presence is temporary; canvas nodes
and messages are saved to SQLite before updates are broadcast.

## Local setup

Use Node.js 24 and the npm version pinned in `package.json`.

```sh
npm install
npm run db:deploy
npm run build
npm run dev
```

SQLite is embedded in the API through `@prisma/adapter-better-sqlite3`; no database
server or separate SQLite installation is required. npm may require approval for
the native driver's install script on a fresh machine. Use `npm install-scripts ls`
to review the scripts requested by your installed packages.

The default database is `packages/db/prisma/manylatte.db`. It and SQLite journal
files are ignored by Git. `DATABASE_URL=file:./prisma/manylatte.db` uses a path
relative to `packages/db`, consistently in Prisma CLI, development, and compiled
API code. Absolute file paths are also accepted. Use the same `DATABASE_URL` for
migration commands and the API. API environment files live in `apps/api/.env`;
Prisma CLI environment files live in `packages/db/.env`. Examples are provided
in those directories.

No PostgreSQL data is automatically imported. The previous application did not
persist canvas content. If an older development `.env` still contains a
PostgreSQL URL, replace its `DATABASE_URL` with the SQLite value above.

## Database commands

```sh
npm run db:deploy
npm run db:studio
npm run prisma:migrate --workspace=@app/db -- --name describe_your_change
```

Commit new Prisma migrations alongside schema changes. `db:deploy` applies
pending migrations without resetting the database. The API checks that tables
exist at startup and reports a setup error if migrations have not been applied.
Schema/client generation does not apply migrations.

## Deployment and recovery

Run **one API instance**, with its SQLite database on a persistent local volume.
Set `NODE_ENV=production`, explicit HTTPS `ALLOWED_ORIGINS`, and `DATABASE_URL`
to that volume's absolute file path. Create the parent directory before startup.
Configure the frontend's API URL using the variables in `apps/web/.env.example`.
Deploy migrations before starting `npm start --workspace=@app/api`.

`REDIS_URL` is rejected: broadcasting events between processes does not synchronize
their authoritative room state. This version does not support multiple API
instances sharing a database or separate database files.

The API exposes `/healthz` and `/readyz`, uses SQLite WAL journaling with a busy
timeout, and drains pending room writes on SIGINT/SIGTERM before closing the
database. Empty rooms release their in-memory state after pending writes finish;
reconnecting clients reload saved content. Database write failures are logged and
reported to clients without committing the candidate in-memory state.

For a simple consistent backup, stop the API gracefully and copy the database
and any remaining `-wal`/`-shm` companion files together. For live backups, use a
SQLite-aware backup tool; copying only the live `.db` file can omit committed WAL
data. Restore into an empty destination while the API is stopped, then run
`db:deploy` before restarting. Test restoration periodically.

The lobby is still public and collaboratively editable, including deletion.
Persistence does not introduce authentication, ownership permissions, undo, or
delivery acknowledgements. Those audit findings remain separate work.

## Checks

```sh
npm test
npm run build
npm run lint
npm run format:check
npm run security:audit
```

Tests include real SQLite persistence, write-failure rollback, ordered messages,
deletion cascades, polling clients, and API restart recovery. Test task hashes
include dependency builds so shared-contract changes invalidate consumer tests.
