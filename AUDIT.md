**ManyLatte codebase audit — September 7, 2026**

Reviewed commit `bef8a23` across the API, web application, shared contracts, SQLite schema and migrations, dependency manifests, build configuration, tests, and deployment documentation. The working tree was clean at the start. Application code was not changed; temporary diagnostic tests were removed after execution.

The immediate priorities are restoring reproducible builds, preventing lost or unsynchronized edits, fixing reconnect behavior, and enforcing connection admission limits. The existing persistence-before-broadcast design is worth retaining.

Priority meanings: **P1** should be addressed before the next release; **P2** belongs in the next reliability/maintainability cycle; **P3** is cleanup or a product improvement. Evidence is marked **reproduced**, **source-confirmed**, or **improvement**. Source-confirmed browser findings were traced through application code and, where needed, installed dependency code; they were not exercised in an actual browser.

**Checks and limits of this audit**

| Check                                          | Result                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Runtime                                        | Node 24.12.0; npm 11.18.0                                                                             |
| `npm run build`                                | Failed at Prisma generation: P1012, missing datasource `url`; CLI 6.19.3                              |
| `npm test`                                     | Failed at the same prerequisite database build                                                        |
| Existing shared tests                          | 23 passed                                                                                             |
| Existing web tests                             | 21 passed; utility tests in a Node environment                                                        |
| Direct API tests                               | 48 passed using the already-present generated database client                                         |
| Focused temporary audit probes                 | 4 passed, confirming the current faulty behaviors described below                                     |
| Direct API TypeScript build and web type check | Passed using existing generated artifacts                                                             |
| `npm run lint`                                 | Passed                                                                                                |
| `npm run format:check`                         | Failed for 112 files in this Windows checkout; 19 still fail after in-memory CRLF-to-LF normalization |
| `npm run security:audit`                       | Reported zero known vulnerabilities                                                                   |
| Web bundling                                   | Completed before the overall build failed; largest JS chunk 751.67 kB, 222.25 kB gzip                 |

Windows sandbox subprocess restrictions initially prevented Vitest from starting. Rerunning with the required execution permissions exposed the actual Prisma failure. No production service, production database, browser session, penetration test, or sustained load test was used. Passing direct tests with existing generated files does not establish that a clean checkout builds.

**Prioritized findings and changes**

1. **F01 · P1 · Reproduced — Align the Prisma toolchain.**

   [Database package](packages/db/package.json), lines 26–31; [schema](packages/db/prisma/schema.prisma), line 6; [Prisma configuration](packages/db/prisma.config.ts).

   The CLI is `^6.19.3`, while the client and SQLite adapter are `^7.10.0`. The schema supplies its URL through `prisma.config.ts`, which the installed v6 generator rejects. Both root build and test commands fail with `Argument "url" is missing in data source block "db"`. Align the CLI, client, and adapter on compatible v7 versions and regenerate the lockfile/client. Group these packages for dependency updates. Prisma's [v7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7) explicitly requires updating both CLI and client.

   Acceptance: a fresh checkout can install, generate, migrate a temporary database, build, and run the entire test graph without pre-existing `dist` or generated files. Effort: small.

2. **F02 · P1 · Reproduced server rejection; source-confirmed UI loss — Preserve drafts until saving succeeds.**

   [Message submission](apps/web/src/features/canvas/components/message-canvas-node.tsx), lines 278–301; [new thread submission](apps/web/src/features/canvas/infinite-canvas.tsx), line 237; [server rejection paths](apps/api/src/cursor/cursor-server.ts), lines 562–598; [message validation](packages/shared/src/canvas/schemas.ts), line 13.

   The inputs allow more than the server's 1,000-character limit. Sending clears the existing-thread draft immediately; new-thread submission replaces the draft with an empty node and emits create/send as two independent commands. A probe sent 1,001 characters followed by a valid message: only the valid message persisted, and no `canvas:error` was emitted. Full threads, full boards, missing nodes, and rate-limit rejections similarly lack a structured result. A database failure emits a generic error after the UI has discarded the text.

   Add shared client validation, visible capacity errors, and command acknowledgements containing operation IDs and typed outcomes. Keep the draft until a successful acknowledgement. Create a thread and its first message atomically. Make retries idempotent; the current create command rejects duplicate IDs, so blindly adding retries is insufficient. Socket.IO's [delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/) explain why transport delivery alone does not confirm persistence.

   Acceptance: overlong input, the 201st message, a full board, a concurrent deletion, a failed write, and interrupted delivery all preserve text and give an actionable result. Effort: medium/large.

3. **F03 · P1 · Reproduced — Recover clients after graceful shutdown and temporary admission rejection.**

   [API shutdown hook](apps/api/src/app.ts), line 107; [socket lifecycle](apps/web/src/components/socket-provider/socket-provider.tsx), lines 97–133; [connection settings](apps/web/src/lib/socket.ts), line 74.

   Shutdown calls `disconnectSockets(true)`. A real reconnect-enabled client received `io server disconnect` and had `socket.active === false`. The web provider only enables activity-triggered reconnection for an explicit idle notice, which shutdown never sends. The UI can therefore keep showing “Reconnecting…” after a deployment without making another attempt. A temporary middleware rejection, such as a full room, also has no retry action. This matches the documented [Socket.IO reconnect behavior](https://socket.io/docs/v4/client-socket-instance/).

   Distinguish restarting, idle, retryable admission failure, and abuse. Reconnect after server restart with backoff and expose a manual retry for inactive sockets. Add an explicit initializing state until the canvas snapshot arrives; transport connection currently marks the UI connected before initialization completes.

   Acceptance: keep the same browser/client mounted through graceful restart and verify recovery; also verify recovery after room capacity becomes available. Existing restart tests create fresh clients and do not cover this. Effort: medium.

4. **F04 · P1 · Source-confirmed — Synchronize all React Flow edit paths.**

   [React Flow handlers](apps/web/src/features/canvas/infinite-canvas.tsx), lines 320–329.

   `onNodesChange` updates local state, but persistence is attached only to the single `node` passed to `onNodeDragStop`. The installed React Flow enables Backspace deletion and keyboard arrow movement by default. There is no `onNodesDelete` persistence handler, and keyboard moves do not flow through the drag-stop callback. Group dragging can change several nodes while this handler emits only one. Other clients and SQLite retain different state, and refresh restores supposedly deleted or moved nodes. See the [React Flow API](https://reactflow.dev/api-reference/react-flow) and [deletion callback](https://reactflow.dev/api-reference/types/on-nodes-delete).

   Route pointer, keyboard, group-drag, and deletion actions through the same command layer, keeping selection and measurement changes local. Preserve accessibility instead of disabling keyboard support as the permanent solution.

   Acceptance: two browsers agree after Backspace, arrow movement, and multi-selection drag; reloading preserves every result. Effort: medium.

5. **F05 · P1 · Reproduced — Make connection admission atomic.**

   [Admission checks](apps/api/src/cursor/cursor-server.ts), lines 194–207; participant registration follows later in the connection handler.

   Capacity is checked before an awaited `allSockets()` call and before the connection is registered. A controlled probe released five simultaneous authorization requests with both `maxParticipantsPerRoom` and `maxTotalConnections` set to one. All five connected. The single-process deployment does not prevent asynchronous admission races.

   Reserve room, IP, and global capacity in one synchronous operation after asynchronous authorization, and release reservations on rejection, canceled handshake, and disconnect. Count pending admissions where appropriate.

   Acceptance: concurrent bursts never exceed each configured cap, and failed handshakes do not leak reservations. Effort: medium.

6. **F06 · P2 · Reproduced — Apply connection-attempt limits before database authorization.**

   [Authorization and attempt-budget order](apps/api/src/cursor/cursor-server.ts), lines 164–190; [authorization query](apps/api/src/app.ts), line 93.

   Unknown-room attempts query SQLite and return before reaching the attempt limiter. A probe with a one-connection IP budget made five immediate invalid-room attempts: all five queried the database and received access denial, never a rate-limit response. Even known-room attempts perform the lookup before the budget check. This exposes the shared database to avoidable handshake work.

   Resolve the client address and enforce cheap attempt limits before authorization. Add a bound for pending/unauthenticated transports as well as admitted participants; middleware-level participant caps do not cover every transport consuming resources.

   Acceptance: repeated invalid-room attempts stop reaching SQLite after the budget is exhausted. Effort: small/medium.

7. **F07 · P1 · Source-confirmed, deployment-dependent — Make the CSP compatible with picker styles.**

   [Frontend headers](apps/web/public/_headers), line 2; [emoji picker](apps/web/src/features/canvas/components/emoji-picker-portal.tsx); [color picker](apps/web/src/components/ui/hex-color-picker.tsx).

   The supplied policy sets `style-src-elem 'self'`. The installed emoji picker inserts an inline `<style>` element without a nonce, and react-colorful also injects styles without configured nonce support at the call site. When the host applies this header, those styles are blocked. Allowing inline style attributes through `style-src-attr` does not authorize style elements; these are separate [CSP directives](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src-elem).

   Choose a deployment-compatible solution: extracted external CSS, supported hashes, or securely generated response nonces passed to the libraries. Verify other dynamically styled primitives under the actual policy. Also ensure the deployment platform applies `_headers`; Vite development behavior is insufficient evidence.

   Acceptance: open both pickers in a browser serving production headers and verify their layout and CSP console output. Effort: medium.

8. **F08 · P2 · Source-confirmed — Define one offline-edit policy.**

   [Emoji creation and dragging](apps/web/src/features/canvas/infinite-canvas.tsx), lines 191–214 and 320–327; [reaction commands](apps/web/src/features/canvas/components/emoji-canvas-node.tsx), lines 106 and 123.

   Messages generally check connection status, but emoji creation, reaction edits/deletion, and dragging emit while disconnected. Ordinary Socket.IO emissions are [buffered until reconnection](https://socket.io/docs/v4/client-offline-behavior/). This can replay stale moves/deletions after other participants have edited the board, or burst past the server's rate budget. Optimistically created nodes have no per-command rollback.

   Gate edits until the session snapshot is ready, or deliberately build a bounded offline queue with pending indicators, operation IDs, reconciliation, and conflict behavior. Apply the same policy to every command.

   Acceptance: network loss and recovery produce no silent ghost nodes, unexpected delayed deletions, or lost drafts. Effort: medium; overlaps F02/F03.

9. **F09 · P2 · Source-confirmed — Constrain creation coordinates.**

   [Context-menu creation](apps/web/src/features/canvas/infinite-canvas.tsx), lines 197 and 290; [position validation](packages/shared/src/canvas/schemas.ts), lines 44–47.

   Creation sends `screenToFlowPosition(...)` directly. At zoom levels showing the area outside the finite canvas, that position can be negative or outside the accepted extent. `nodeExtent` constrains React Flow interactions; it does not validate the separately constructed socket payload. The server rejects the command while the local optimistic node/draft can remain.

   Clamp or reject creation positions using a shared coordinate policy and make noneditable surrounding space clear. Acceptance: create near every edge at minimum zoom and with several viewport aspect ratios. Effort: small.

10. **F10 · P2 · Source-confirmed design risk — Bound queued persistent work.**

    [Persistent command queue](apps/api/src/cursor/persistent-canvas.ts), lines 12–29; [server command dispatch](apps/api/src/cursor/cursor-server.ts), line 535.

    Each room has an unbounded promise chain. Per-socket event limits regulate arrivals, but do not bound outstanding work when storage is slow or many participants write to one room. Snapshots and typing lookups share the queue. Database stalls can accumulate retained closures, delay initialization, and exceed the ten-second shutdown deadline. This is a structural risk, not a measured load-test result.

    Add room/global queue limits, queue-depth metrics, structured busy responses, and coalescing for superseded moves. Maintain durable ordering and rollback behavior. Acceptance: injected slow writes keep memory and queue depth bounded, and shutdown behavior is explicit. Effort: medium.

11. **F11 · P2 · Source-confirmed design risk — Reduce snapshot and update payloads.**

    [Full history loading](apps/api/src/cursor/canvas-persistence.ts), lines 28–31; [broadcasts](apps/api/src/cursor/cursor-server.ts), lines 613 and 736; [capacity](apps/api/src/cursor/canvas-state.ts), line 10; [message limit](packages/shared/src/canvas/constants.ts), line 8.

    All history is loaded into the room and sent on join. Every message-node move and new message broadcasts the entire node, including its history. The permitted maximum is 500 nodes × 200 messages × 1,000 text characters: 100 million text characters per room before author/JSON overhead. The inbound 4 KB socket limit does not cap these outbound snapshots.

    Add an aggregate room-byte/message budget, paginated history, and compact position/message events. Keep snapshots as bounded recovery checkpoints. Profile rendering and consider rendering only visible nodes after checking popover behavior. Acceptance: measure join size, latency, memory, and broadcast bytes with representative dense boards. Effort: large.

12. **F12 · P2 · Source-confirmed, configuration-dependent — Trust explicit proxy hops.**

    [Forwarded-IP extraction](apps/api/src/cursor/cursor-server.ts), lines 170–177; [environment option](apps/api/src/environment.ts), line 62.

    `TRUST_PROXY=true` trusts the leftmost `X-Forwarded-For` value directly for socket limits. If the API is directly reachable, or the proxy appends to an incoming client-controlled header, an attacker can vary that value to evade IP budgets. The default `false` avoids this issue; exploitation depends on deployment topology.

    Support explicit trusted proxy addresses/hops and use one address-resolution policy for HTTP and sockets. Document header sanitization and restrict backend ingress to the proxy. Acceptance: untrusted forwarded headers cannot change the effective client IP. Effort: medium.

13. **F13 · P1 · Improvement — Add CI that starts from a clean checkout and exercises real UI behavior.**

    [GitHub configuration](.github/dependabot.yml); [task graph](turbo.json); [web test configuration](apps/web/vitest.config.ts).

    There is Dependabot configuration but no checked-in GitHub Actions workflow. The web suite contains six utility test files, uses the Node environment, and does not render the socket provider or canvas. That leaves F02–F04, F07, and F08–F09 uncovered despite green unit tests.

    Add install, generation, migration, build, lint, format, and test gates on the supported runtime. Add focused component tests for session/draft state, plus a small two-browser end-to-end suite covering keyboard edits, restart, rejection, and production CSP. Run migration checks against a temporary file database. Avoid relying on warm Turbo/generated outputs for the clean-build check.

    Acceptance: the current Prisma mismatch would fail a pull request check, and the behavioral regressions above each have an appropriate regression test. Effort: medium/large.

14. **F14 · P2 · Improvement — Give persisted lobbies an operational lifecycle.**

    [Lobby creation](apps/api/src/lobbies.ts), line 20; [schema](packages/db/prisma/schema.prisma), lines 18–39; [deployment guidance](README.md).

    Lobby creation is rate-limited per minute, but persisted lobby count and lifetime have no bound. Empty-room eviction only releases memory. There is no expiry/archive/deletion workflow for lobbies and no foreign-key relation from canvas nodes to lobbies. Over time, abandoned content can fill the persistent volume, and future lobby deletion would need explicit cascade handling.

    Define retention and deletion semantics, add storage monitoring and aggregate quotas, and introduce a lobby relation after deliberately handling legacy/orphaned data. Turn the documented backup/restore procedure into a repeatable, tested maintenance task. Do not silently delete existing data as part of this work.

    Acceptance: retention is documented, removal handles all dependent records correctly, and a backup can be restored into a fresh instance. Effort: medium/large.

15. **F15 · P2 · Source-confirmed — Validate API endpoint semantics, not just URL syntax.**

    [URL normalization](apps/web/src/lib/socket.ts), lines 17–66; [HTTP URL construction](apps/web/src/lib/lobby.ts), line 27.

    The normalizer accepts paths, queries, and fragments. HTTP lobby requests append `/lobbies` to that string, while Socket.IO interprets a URL pathname as a namespace; this server only registers the default namespace. A plausible setting such as `https://host/api` therefore does not consistently configure the two transports. Invalid configuration also throws during module evaluation, before a useful application error can render.

    Require an exact origin if that is the supported deployment model, or model HTTP base path and Socket.IO transport path explicitly. Validate production configuration during the build. Acceptance: test all supported deployment URL shapes and reject unsupported ones with a clear configuration error. Effort: small/medium.

16. **F16 · P2 · Improvement — Expire typing presence on the server.**

    [Typing state](apps/api/src/cursor/cursor-server.ts), lines 640–677; [client timeout](apps/web/src/features/canvas/components/message-canvas-node.tsx), line 47.

    Typing is cleared by a later client message, node change/deletion, send, or disconnect. The server does not timestamp and expire typing state. A suspended client or a client that never sends `isTyping:false` can leave a stale indicator while its connection remains alive. The client-side 1.5-second timer is not an authoritative expiry.

    Track typing expiry per participant/node and renew it while typing. Acceptance: a lost stop-typing update clears within the documented interval without disconnecting the participant. Effort: small.

17. **F17 · P2 · Improvement — Make initialization failures and operational pressure observable.**

    [Initialization catch](apps/api/src/cursor/cursor-server.ts), line 404; [middleware catch](apps/api/src/cursor/cursor-server.ts), line 217; [health/readiness](apps/api/src/app.ts), line 117.

    Snapshot/load failures are swallowed into a forced disconnect, while middleware errors become a generic connection error. `/readyz` checks `SELECT 1`, which confirms query access but not writable capacity or room initialization health. Operators lack visibility into queue depth, initialization failures, snapshot size, and write latency. Default request logging also records lobby lookup URLs containing invite codes.

    Log failures with safe correlation/context; redact invite codes and content. Add storage/queue/connection metrics and actionable client retry states. Monitor disk capacity and write failures without turning every readiness poll into an expensive write. Acceptance: an injected load/write failure can be diagnosed from logs and metrics without exposing invitation secrets. Effort: medium.

18. **F18 · P2 · Improvement — Exercise the real migration path and align database indexes with queries.**

    [Test database setup](apps/api/test/database.ts), lines 6–29; [migration test](apps/api/src/lobby-migration.test.ts); [message index](packages/db/prisma/schema.prisma), line 53; [history ordering](apps/api/src/cursor/canvas-persistence.ts), line 31.

    Tests manually enumerate migrations and split SQL on semicolons. They validate current statements, but do not exercise the Prisma deployment command or migration bookkeeping, and the parser is unsuitable for arbitrary future SQL bodies. The message index uses `(nodeId, createdAt, id)` while loading orders by `sequence`; inspect the actual query plan and prefer an index matching the access path where beneficial.

    Keep fast fixtures, add a real CLI migration smoke test, and centralize migration discovery instead of maintaining duplicate lists. Validate upgrades with existing content as well as empty databases. Acceptance: the migration deployment path runs in CI, newly added migrations are included automatically, and query-plan evidence supports any index change. Effort: medium.

19. **F19 · P2 · Improvement — Split modules along state ownership and behavior.**

    [Socket server](apps/api/src/cursor/cursor-server.ts): 864 lines; [canvas](apps/web/src/features/canvas/infinite-canvas.tsx): 369 lines; [message node](apps/web/src/features/canvas/components/message-canvas-node.tsx): 341 lines.

    The server owns admission, rooms, participants, abuse budgets, typing, persistence dispatch, event fanout, timers, and shutdown in one closure. The canvas mixes transport subscription, optimistic state, draft callbacks, coordinate conversion, and React Flow input handling. These boundaries make the preceding lifecycle bugs difficult to isolate.

    Extract connection admission/reservations, room lifecycle, presence handling, and canvas command handling with explicit ownership and cleanup. On the web side, introduce a canvas synchronization hook/reducer and a current-session command dispatcher, leaving rendering and input presentation in components. Keep `CanvasState` and `PersistentCanvas` as the pure-state and durable-ordering boundaries. Avoid a generic event framework or splitting files solely to meet a line count.

    Acceptance: admission and reconnect/draft behavior can be tested independently, with no duplicate state owners. Effort: medium/large; follow correctness fixes rather than mixing them into one rewrite.

20. **F20 · P2 · Improvement — Reduce initial frontend work using measured bundle boundaries.**

    [Root layout](apps/web/src/routes/__root.tsx); [application providers](apps/web/src/main.tsx); [user menu](apps/web/src/components/user-menu/user-menu.tsx).

    The build emitted a 751.67 kB main JS chunk (222.25 kB gzip), a 259.47 kB route chunk, and a separately lazy-loaded 364.26 kB emoji picker. The join/root tree eagerly imports the user menu and its dialogs. React Query has a provider but no query consumers in the application.

    Analyze module composition before changing chunk settings. Lazy-load canvas-only menus/dialogs and remove the unused query provider if no near-term query use justifies it. The emoji picker is already lazy-loaded; preserve that. Measure initial join-page transfer, parse time, and interaction readiness before and after.

    Acceptance: measured initial-page work decreases without merely moving bytes among equally eager chunks. Effort: medium.

21. **F21 · P3 · Improvement — Remove unsupported and unused scaffolding.**

    [Redis adapter](apps/api/src/redis-adapter.ts); [API dependencies](apps/api/package.json); [web dependencies](apps/web/package.json); [unused account model](packages/db/prisma/schema.prisma), line 10.

    `attachRedisAdapter` has no callers, and the application explicitly rejects Redis scaling. `better-auth`, `@fastify/cookie`, and `@fastify/sensible` have no application imports. `react-hook-form` and its resolver package are also unused. This adds installation/update surface and suggests capabilities the product does not expose.

    Remove unused code and direct dependencies after checking lockfile effects. Decide separately whether the unused `User` table should remain reserved for planned work; removing persisted schema needs a deliberate migration. `shadcn` and `cn` are actually referenced and should not be treated as unused based on their names.

    Acceptance: install, build, and tests pass with fewer unnecessary dependencies and no unsupported Redis path. Effort: small.

22. **F22 · P3 · Reproduced — Make formatting deterministic across platforms.**

    [Prettier configuration](.prettierrc.json); the repository has no `.gitattributes` file.

    Prettier reported 112 files, but Git showed LF in the index and CRLF in the Windows working tree. Checking the same tracked contents with line endings normalized in memory reduced the count to 19, largely UI primitives using a different quote/semicolon style. The raw count therefore exaggerates substantive style drift.

    Add an explicit repository line-ending policy, normalize once in a dedicated change, and enforce the existing formatter in CI. Add targeted React Hooks linting and type-aware promise rules where they catch lifecycle mistakes; do not expand lint rules indiscriminately.

    Acceptance: format checks pass on both Windows and Linux without recurring whole-repository churn. Effort: small.

23. **F23 · P2/P3 · Source-confirmed UI gaps and product decisions — Finish exposed interactions and clarify session identity.**

    [Canvas menu](apps/web/src/features/canvas/components/canvas-context-menu.tsx), line 34; [canvas input](apps/web/src/features/canvas/infinite-canvas.tsx), line 305; [user identity](apps/api/src/cursor/cursor-server.ts), line 341; [message author comparison](apps/web/src/features/canvas/components/message-canvas-node.tsx).

    The menu exposes an enabled `ScreenShare` item with no action. Creation relies on a context-menu coordinate, with no visible add control suitable for keyboard-first use. The eight OTP slots plus card padding also deserve a narrow-screen layout check. Remove/disable the unfinished item and provide discoverable keyboard/touch creation controls, then test at 320 px and with keyboard navigation. Respect reduced-motion preference in live cursor interpolation as the decorative home cursors already do.

    Each reconnect generates a new user ID and selected colors are not persisted. Consequently, old messages stop being recognized as the current user's messages after reconnect. Decide whether this is intentionally session-only or whether a server-issued resumable guest identity is needed. This is a product behavior decision; usernames alone must not become trusted identity.

    Acceptance: all enabled controls work, creation is accessible without a mouse context menu, narrow layouts remain usable, and reconnect identity behavior is explicit. Effort: small/medium, or larger if resumable identity is selected.

**Implementation order**

| Batch | Scope                                              | Reason                                                           |
| ----- | -------------------------------------------------- | ---------------------------------------------------------------- |
| 1     | F01, clean-build portion of F13, F22               | Restore a reproducible baseline and enforce it                   |
| 2     | F02, F03, F04, F08, F09                            | Stop message loss and canvas divergence; add regression coverage |
| 3     | F05, F06, F07, F12                                 | Correct admission limits and production integration              |
| 4     | F10, F11, F14, F16, F17, F18                       | Bound resource use and improve recovery/operations               |
| 5     | F15, F19, F20, F21, F23 and remaining F13 coverage | Simplify ongoing development and finish usability work           |

Keep fixes reviewable: do not combine a transport redesign, dependency cleanup, formatting normalization, and UI refactor into one change. F02/F08 share a command-dispatch boundary and should be designed together even if delivered incrementally.

The README explicitly defines invitation-based collaborative editing, no accounts/owner permissions, and a single SQLite-backed API instance. Those are current product constraints, not automatically vulnerabilities. This audit does not recommend adding accounts, Redis, microservices, or another database without a concrete product or measured capacity requirement. Preserve shared validation, server-authored message attribution, lobby isolation, persist-before-broadcast ordering, rollback on failed writes, and room eviction after pending writes finish.

**Implementation status — September 8, 2026**

The original findings above describe `bef8a23`. The `fix/codebase-audit` branch implements these remedies. The application retains its single SQLite API and invitation-based collaborative editing. CI automation from F13 is omitted at the user's request; the regression checks are runnable locally.

| Findings      | Implemented remedy                                                                                                                                                     | Verification                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| F01, F21      | Aligned Prisma 7 CLI/client/adapter, removed unused auth/Redis/form/query dependencies and addressed transitive advisories                                             | Package builds and dependency audit                                                                    |
| F02           | Acknowledged, idempotent commands; atomic thread/first-message transaction; drafts retained on failure                                                                 | SQLite trigger rollback and receipt replay tests; two-browser failed-write/retry test                  |
| F03           | Snapshot-gated readiness, retryable denial/restart handling, manual reconnect; corrected Fastify shutdown ordering                                                     | Lifecycle tests and browser restart with an unsent draft                                               |
| F04           | Controlled node synchronization for keyboard movement/deletion and all final group positions                                                                           | Two-client keyboard/deletion/reload test; group changes handled through the same final-position path   |
| F05, F06, F12 | Synchronous transport/room reservations, attempt accounting before authorization and trusted-hop address resolution                                                    | Concurrent admission and forwarded-address tests                                                       |
| F07           | Build-generated style hash allowlist and external font assets                                                                                                          | Production-header browser test opens emoji/color/settings interfaces without CSP violations            |
| F08, F09      | Online-only command queue, clear pending work on disconnect, disable writes until snapshot; constrain creation positions                                               | Offline dispatcher, reconnect and coordinate-validation tests                                          |
| F10, F11      | Bounded persistence work, coalesced/paced client movement, compact previews/deltas, 50-message history pages and room content quotas                                   | Stalled-storage queue test and ordered 76-message pagination/reload test                               |
| F13           | Local browser and migration regression commands                                                                                                                        | Unit/integration tests and Chromium; CI omitted at user request                                        |
| F14, F18      | Lobby quota/archive lifecycle, cascading foreign keys, legacy-room preservation, native SQL fixtures, backup/restore/receipt tools                                     | Actual Prisma clean/upgrade/repeat deployments, populated recovery and cascading deletion smoke checks |
| F15           | Exact-origin URL validation at build and runtime                                                                                                                       | Invalid path/query/fragment cases and production build                                                 |
| F16           | Expiring typing leases renewed by active input; clear on disconnect/removal/send                                                                                       | Existing typing integration tests and lifecycle review                                                 |
| F17           | Aggregate queue/latency/failure/storage diagnostics, cached real-write readiness probe, redacted invitation/error logging                                              | Readable-but-unwritable database readiness/recovery test                                               |
| F19           | Separate admission, guards, presence, typing, commands/persistence and client synchronization/history/submission                                                       | Type checking, targeted lint and behavioral regressions                                                |
| F20           | Lazy menu/dialog/color-picker boundaries                                                                                                                               | Largest JS chunk reduced from 751.67 kB to about 409 kB; production interface test                     |
| F22           | LF normalization, formatter checks, targeted hook and floating-promise rules                                                                                           | Formatting and lint checks                                                                             |
| F23           | Visible creation controls, responsive 320px code input, reduced motion, removal of inert ScreenShare; documented connection-scoped identity and saved color preference | Browser layout/control tests and documented identity contract                                          |

No production database was migrated and no deployment was performed. Operators must apply migrations and deploy the generated `dist/_headers` with a future release. Content retention is explicit operator maintenance; confirmations can be pruned after seven days. The historical User table is preserved. Browser coverage uses Chromium and does not constitute a sustained load test or cross-browser certification.
