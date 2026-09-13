# ManyLatte

ManyLatte is a shared canvas for conversations, reactions, and live presence.
Create a private lobby, send its code or invite link to friends, and arrange
message threads and emoji reactions together in real time.

Canvas content is stored in SQLite, so a lobby can be reopened after everyone
leaves or the API restarts. No account is required: participants choose a name
and can customize their cursor color.

## Features

- Private lobbies with short, shareable invite codes
- Live cursors, participant presence, and typing indicators
- Draggable message threads with paginated history
- Emoji reactions that can be moved, changed, or removed
- Persistent canvas content and lobby ownership
- Owner controls for removing participants and transferring ownership
- Light, dark, and system appearance settings
- Responsive UI with keyboard-accessible canvas editing

## Using the application

### Create or join a lobby

From the home page, select **Create lobby**, enter a name, and choose
**Create and join lobby**. ManyLatte opens a new canvas and assigns it an
eight-character code such as `AB12-CD34`.

To enter an existing lobby, type or paste its code on the home page. Codes are
case-insensitive, and pasted codes may include the dash. Opening an invite URL
such as `/?lobby=AB12-CD34` takes you directly to that lobby. The first time you
join, enter the username that other participants will see beside your cursor and
messages.

### Add content to the canvas

Right-click an empty area of the canvas and choose one of these actions:

- **Message** creates a conversation thread at that position. Write the first
  message to save it, then open the thread to read replies or add another one.
- **Reaction** opens the emoji picker and places the selected reaction on the
  canvas.

Drag a saved node to reposition it. Select one or more nodes and press
`Delete` or `Backspace` to remove them. You can also use a node's actions menu
to remove a thread, remove a reaction, or change a reaction's emoji. Changes
appear for everyone in the lobby after they have been saved.

Use the controls in the lower-right corner to zoom. You can pan around the
canvas with scroll gestures or by holding `Space` while dragging. Arrow keys
move focused nodes, and `Enter` selects a focused node.

If a message thread contains more than 50 messages, choose **Load older
messages** to retrieve the previous page. A typing indicator appears while
other participants compose a reply.

### Invite and manage participants

Open the user menu in the upper-right corner to:

- Copy the lobby code or full invite link
- See everyone currently connected
- Change your username and cursor color
- Switch between system, light, and dark appearance
- Create another lobby or leave the current one

Anyone with the invite can join, view, edit, move, and delete canvas content.
There is no separate viewer role.

The participant who creates a lobby becomes its owner. From **Lobby Users**, the
owner can remove a participant or transfer ownership to someone else. A removed
participant is disconnected and their browser identity is banned from that
lobby. Transferring ownership immediately gives the new owner all moderation
controls.

### Identity and saved data

ManyLatte does not use user accounts. Your browser stores a private identity for
each lobby. It also stores your preferred name, color, and appearance on that
device. Invite links never include the private lobby credential.

Clearing browser storage or using another browser creates a new identity. This
means a lobby ban can also be bypassed in the same way. Cursor sessions are
temporary, while lobbies, ownership, message threads, and reactions remain in
the database until an operator archives or deletes the lobby.

If the connection drops, ManyLatte reloads the server's saved state when it
reconnects. Edits made while offline are not queued. A message draft stays in
the composer if sending fails, and the **Reconnect** button can retry the
connection manually.

## Run locally

### Requirements

- Node.js 24
- npm 11.18 or later in the 11.x release line

SQLite runs inside the API through `@prisma/adapter-better-sqlite3`; you do not
need to install a database server or the SQLite CLI.

### Setup

```sh
npm ci
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
npm run db:deploy
npm run build
npm run dev
```

The web application is available at `http://localhost:5173` and the API listens
at `http://localhost:3000`. You can check the API with:

```sh
curl http://localhost:3000/healthz
curl http://localhost:3000/readyz
```

The default database is created at
`packages/db/prisma/manylatte.db`. Database files and SQLite journal files are
ignored by Git.

On a fresh machine, npm may ask for approval before running the native SQLite
driver's install script. Review pending scripts with `npm install-scripts ls`.

## Technical overview

ManyLatte is an npm workspace managed with Turborepo.

| Workspace         | Responsibility                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `apps/web`        | React 19 client built with Vite, TanStack Router, Tailwind CSS, React Flow, Radix UI, and Socket.IO Client |
| `apps/api`        | Fastify HTTP API and Socket.IO real-time server                                                            |
| `packages/shared` | Shared Zod schemas, event contracts, constants, and TypeScript types                                       |
| `packages/db`     | Prisma schema, SQLite client, migrations, and operator scripts                                             |

The browser uses HTTP to create and resolve lobby invitations. After a lobby is
loaded, Socket.IO handles admission, presence, cursor movement, typing state,
canvas commands, and message history.

Each lobby has an in-memory state managed by the API. Mutations are serialized
through a per-lobby queue, committed to SQLite, and only then broadcast to
connected clients. Failed database writes are rejected without applying the
candidate state. When an empty lobby is released from memory, the next visitor
reconstructs it from the database.

Prisma manages the `Lobby`, `LobbyBan`, `CanvasNode`, `CanvasMessage`, and
`CanvasOperation` records. Operation receipts make retried edits idempotent.
SQLite uses WAL journaling and a busy timeout so committed WAL data is included
in consistent backups.

### Environment variables

Frontend variables are read from `apps/web/.env` at build and development time.

| Variable                   | Default                 | Purpose                                                     |
| -------------------------- | ----------------------- | ----------------------------------------------------------- |
| `VITE_API_MODE`            | `local`                 | Selects `VITE_LOCAL_API_URL` or `VITE_FORWARDED_API_URL`    |
| `VITE_LOCAL_API_URL`       | `http://localhost:3000` | API origin for local development                            |
| `VITE_FORWARDED_API_URL`   | none                    | API origin used when `VITE_API_MODE=forwarded`              |
| `DEV_SERVER_HOST`          | `127.0.0.1`             | Address used by the Vite development server                 |
| `DEV_SERVER_ALLOWED_HOSTS` | none                    | Comma-separated hostnames allowed by the development server |

API variables are read from `apps/api/.env`. Prisma commands separately read
`packages/db/.env`, so both files should use the same `DATABASE_URL`.

| Variable                            | Default                           | Purpose                                                           |
| ----------------------------------- | --------------------------------- | ----------------------------------------------------------------- |
| `PORT`                              | `3000`                            | API port                                                          |
| `DATABASE_URL`                      | `file:./prisma/manylatte.db`      | SQLite file URL; relative paths resolve from `packages/db`        |
| `ALLOWED_ORIGINS`                   | local Vite origins in development | Exact, comma-separated web origins allowed by HTTP and Socket.IO  |
| `MAX_LOBBIES`                       | `10000`                           | Maximum number of active and archived lobbies                     |
| `CURSOR_CONNECTION_IDLE_TIMEOUT_MS` | `300000`                          | Idle connection lifetime                                          |
| `CURSOR_MAX_CONNECTIONS_PER_IP`     | `20`                              | Per-IP concurrent connection limit                                |
| `CURSOR_MAX_PARTICIPANTS_PER_ROOM`  | `100`                             | Per-lobby participant limit                                       |
| `CURSOR_MAX_TOTAL_CONNECTIONS`      | `1000`                            | Process-wide connection limit                                     |
| `SOCKET_MAX_HTTP_BUFFER_BYTES`      | `4096`                            | Maximum Socket.IO payload size                                    |
| `TRUST_PROXY`                       | `false`                           | Trusted proxy IPs or CIDR ranges used to resolve client addresses |

Frontend API URLs must be exact HTTP or HTTPS origins without credentials,
paths, queries, or fragments. Production URLs outside the local machine must
use HTTPS. In production, `ALLOWED_ORIGINS` is required and every origin must
also use HTTPS.

### Common commands

| Command                   | Description                                     |
| ------------------------- | ----------------------------------------------- |
| `npm run dev`             | Start the web and API development servers       |
| `npm run build`           | Build every workspace                           |
| `npm test`                | Run unit and integration tests                  |
| `npm run lint`            | Lint every workspace                            |
| `npm run format`          | Format the repository with Prettier             |
| `npm run format:check`    | Check formatting without changing files         |
| `npm run security:audit`  | Report high-severity dependency vulnerabilities |
| `npm run db:deploy`       | Apply pending Prisma migrations                 |
| `npm run db:studio`       | Open Prisma Studio                              |
| `npm run test:migrations` | Test migration and database recovery paths      |

Create and commit a migration whenever the Prisma schema changes:

```sh
npm run prisma:migrate --workspace=@app/db -- --name describe_your_change
```

`db:deploy` applies existing migrations without resetting the database. Prisma
client generation does not apply migrations, and the API reports a setup error
at startup when the required tables are missing.

### Browser tests

```sh
npm run build
npx playwright install chromium
npm run test:e2e --workspace=@app/web
```

The browser suite uses temporary SQLite databases and the production Content
Security Policy. It covers collaborative editing between two clients, keyboard
movement, pickers, preserved drafts after failures, API restart recovery,
moderation, and the mobile join screen.

## Production deployment

Build the web client, deploy the database migrations, and run one API process:

```sh
npm run build
npm run db:deploy
npm start --workspace=@app/api
```

Serve `apps/web/dist` from a static host and place the SQLite database on a
persistent local volume. Set `NODE_ENV=production`, configure explicit HTTPS
origins in `ALLOWED_ORIGINS`, and use an absolute `DATABASE_URL` for the mounted
volume. Create the database's parent directory before starting the API.

This version supports exactly one API instance. `REDIS_URL` is rejected because
cross-process broadcasting would not synchronize the authoritative in-memory
lobby state. Do not place multiple API processes in front of the same database
or give separate processes different database files.

The web build generates `apps/web/dist/_headers` with the Content Security
Policy hashes required by installed UI styles. Deploy that generated file with
the site. If the static host ignores `_headers`, reproduce those policies in its
server configuration.

Use `/healthz` for process liveness and `/readyz` for database and storage
readiness. The API also logs aggregate operational metrics every minute,
including connections, rooms, queued work, command latency, database failures,
database size, free disk space, and heap use.

## Backups and lobby retention

Set `DATABASE_URL` in the shell or a repository-root `.env` before using the
operator script.

```sh
npm run db:ops -- stats
npm run db:ops -- backup /backups/manylatte-2026-09-13.db
npm run db:ops -- restore /backups/manylatte-2026-09-13.db /data/restored.db
```

Backup uses SQLite `VACUUM INTO` and verifies database integrity. Restore also
checks integrity and refuses to overwrite an existing file. For recovery, stop
the API, restore to a new path, point `DATABASE_URL` to it, apply migrations,
verify `/readyz`, and open an existing lobby before sending production traffic
to the restored database.

Canvas content is not deleted automatically. Review and manage old lobbies with:

```sh
npm run db:ops -- list
npm run db:ops -- archive LOBBY_ID --offline
npm run db:ops -- delete LOBBY_ID --offline
npm run db:ops -- prune-receipts --offline
```

Stop the API before running lifecycle commands. A lobby must be archived before
it can be permanently deleted. Deletion cascades to its nodes, messages, bans,
and operation receipts. Receipt pruning removes confirmations older than seven
days, so schedule it only with that retry guarantee in mind.

## Application limits

The API enforces the following defaults to keep a lobby's persisted and queued
work bounded:

- 500 canvas nodes per lobby
- 200 messages per thread
- 2,000 messages per lobby
- 2 MiB of message text per lobby
- 1,000 characters per message
- 64 queued persistent operations per lobby and 512 globally
- 10 lobby creation requests per IP per minute

Existing content is preserved if a migration introduces a lower limit. A lobby
already above a limit must remove content before adding more.
