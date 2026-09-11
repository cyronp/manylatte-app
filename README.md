# ManyLatte

A shared canvas built with React, Fastify, Socket.IO, and SQLite. Prisma manages
the database schema and migrations. Cursor presence is temporary; canvas nodes
and messages are saved to SQLite before updates are broadcast.

## Local setup

Use Node.js 24 and the npm version pinned in `package.json`.

```sh
npm ci
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

Use the included SQLite backup command with an explicit destination:

```sh
npm run db:ops -- stats
npm run db:ops -- backup /backups/manylatte-2026-09-08.db
npm run db:ops -- restore /backups/manylatte-2026-09-08.db /data/restored.db
```

Set `DATABASE_URL` in the shell or repository-root `.env` when running `db:ops`.
Backup uses SQLite `VACUUM INTO`, includes committed WAL data, and checks integrity.
Restore checks integrity and refuses to overwrite an existing file. Stop the API,
restore to a new path, point `DATABASE_URL` there, run `db:deploy`, verify `/readyz`,
and reopen an existing lobby before directing traffic to the restored database.
Keep the original volume until recovery is verified. Schedule backups outside this
application and regularly run `npm run test:migrations` to exercise recovery.

The generated **`apps/web/dist/_headers`** is the deployment header file. The build
adds hashes for installed emoji, color, scroll-area and modal styles; deploying the
unprocessed `public/_headers` blocks those styles. Hosts that ignore `_headers`
must copy its policies into their server configuration. Script policy remains
`'self'`. Small font assets stay external to comply with `font-src 'self'`.
Frontend API URLs must be exact HTTP(S) origins with no credentials, path, query,
or fragment; builds reject invalid configuration. Production non-loopback APIs
require HTTPS. `TRUST_PROXY` defaults to `false`; configure only actual proxy
IP/CIDR ranges, consistently for HTTP and Socket.IO admission.

The API writes aggregate operational logs every minute: room/connection counts,
pending and peak queue work, command latency, load/write failures, database size,
free disk space, and heap usage. Lobby invitations and query strings are redacted
from request logs. `/readyz` combines a database read with a cached write probe
refreshed every 30 seconds; `/healthz` remains process liveness. Alert on write
failures, unavailable storage, sustained queue growth and low disk space.

## Lobbies and invites

The home page lets you join a lobby using the shadcn Input OTP field or choose
**Create lobby** to start one. Codes contain eight random letters and numbers,
formatted as `AB12-CD34`. Code entry accepts lowercase and pasting with the dash.
Use **Invite friends** to copy the code or invite link. Friends enter the code
or open the link, then choose a username to join the same canvas.
**Leave lobby** returns to the code entry page and disconnects from the canvas.
There is no public lobby. Refreshing or reopening an invite restores that lobby; names and
canvas content survive API restarts, including lobbies with no content yet.

Invites use `/?lobby=AB12-CD34`. Lobbies are accessible to anyone with their
link and collaboratively editable, including deletion. The creator is the lobby's
single owner and can use **Lobby Users** to kick someone or delegate ownership.
Delegating immediately removes the previous owner's moderation permissions.
Ownership survives disconnects and API restarts; leaving does not elect a new owner.
The browser keeps a private credential for each lobby in local storage. Clearing
that storage or switching browsers loses that identity; when storage is disabled,
identity lasts only for the current page. Credentials are never part of invite links.
Kicking disconnects all of that user's tabs without automatic reconnection; it is
not a ban, and the user can explicitly rejoin with the invite. There are no accounts
or per-user invite revocation. Operators can archive a lobby to disable its invitations. Canvas content and presence are scoped
to each lobby. Invalid or unknown invites show an error. Creation is limited to
10 requests per IP per minute.

Run `npm run db:deploy` before starting the updated API to add lobby ownership.
Lobbies created before ownership was introduced have no verifiable creator and
remain without moderation permissions; visitors cannot claim them.
Existing lobbies receive a code and retain their content and original invite
links. Old public canvas data is preserved in archived legacy lobbies.

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

## Editing, identity and retention

Open the canvas context menu to add a message or reaction.
Arrow keys move focused nodes; Enter selects them; Delete/Backspace deletes selected
nodes. Group moves and deletion synchronize with other participants. Creation
positions are constrained to the board. Editing waits for the initial snapshot;
offline writes are rejected instead of buffered. Text remains in the composer on
failure. The first message and its thread save atomically, and retries reuse the
same operation ID. Reconnects reload authoritative state after API restarts or
temporary admission failures; **Reconnect** is also available manually.

User identity is intentionally **connection-scoped**. There are no verified
accounts: names and colors are display preferences, stored on this device. A new
connection receives a new user ID; saved messages retain the author recorded when
sent and may appear as another participant's messages after reconnecting. This
is not an ownership or authentication mechanism.

Snapshots contain one message preview per thread; opening a thread loads 50
messages, and **Load older messages** retrieves earlier pages. New content is
limited to 500 nodes per lobby, 200 messages per thread, 2,000 messages and 2 MiB
of UTF-8 message text per lobby. Existing content is preserved by migrations;
a lobby already above a limit must remove content before adding more. Persistent
work is bounded to 64 queued operations per room and 512 globally. Browser edits
are paced and movement updates are coalesced.

`MAX_LOBBIES` defaults to 10,000, including archived lobbies. No canvas content is
automatically erased. Operators review unused lobbies and apply their retention
policy explicitly:

```sh
npm run db:ops -- list
# Stop the API before changing stored lifecycle state.
npm run db:ops -- archive LOBBY_ID --offline
# Permanent removal requires the lobby to have been archived first.
npm run db:ops -- delete LOBBY_ID --offline
npm run db:ops -- prune-receipts --offline
```

Deletion cascades to nodes, messages, and operation receipts. Receipt pruning
removes only confirmations older than seven days, bounding the guaranteed retry
window to at least seven days when pruning is scheduled. Back up first and keep
backups according to the same retention policy. `list` returns the oldest 1,000
lobbies for review. The unused historical `User` table is deliberately preserved
so this audit does not erase pre-existing data.

## Browser and migration regression checks

```sh
npm run build
npm run test:migrations
npx playwright install chromium
npm run test:e2e --workspace=@app/web
```

Browser tests use temporary SQLite data and the production CSP, covering two-client
editing, failure-preserved drafts, restart recovery, keyboard synchronization,
pickers and a 320px join screen. The test server binds only to loopback; never
serve `apps/web/e2e/server.mjs` in production. Run the checks locally before merging.
No CI workflow or deployment is included in this change. See [AUDIT.md](AUDIT.md)
for the original findings and their implementation status.
