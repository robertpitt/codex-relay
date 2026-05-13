---
schemaVersion: 1
id: tkt_01krhm1a426k93cazwpmavthxs
title: Add local REST transport so renderer works outside Electron preload
ticketType: task
status: todo
position: 20000
priority: high
effort: medium
labels:
  - renderer
  - main-process
  - transport
  - local-dev
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-13T21:31:40.546Z'
updatedAt: '2026-05-13T21:35:55.909Z'
authoringState: reviewing
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krhm5h49jhq926ccj84twrat
lastRunStartedAt: null
---
# Add local REST transport so renderer works outside Electron preload

## Context

Relay’s renderer currently depends on `window.relay`, which is only provided by Electron preload. Add a localhost-only REST transport path so the same renderer can load in Electron and in a normal Chrome tab for local development. This task should deliver the agreed vertical slice for core project, board, ticket detail/create/update, and run status/event workflows, while leaving full IPC removal for follow-up work.

## Goal

Start a main-process localhost HTTP server during app startup, bound to `127.0.0.1` only, with a generated per-session token required on every API/event request.

## Decisions / Assumptions

- Use REST JSON for commands and queries; use SSE for run/progress events unless WebSocket is already simpler with existing dependencies at implementation time.
- Keep `window.relay` and IPC support in place for Electron during this task; this is a compatibility transport refactor, not a full IPC deletion.
- The first-pass local web mode is trusted developer-only: localhost bind, generated session token, and existing project/path guards are sufficient.
- Avoid adding a large web framework unless needed; Node’s built-in HTTP server is acceptable for the local server if it keeps the implementation small.

## Requirements

- Start a main-process localhost HTTP server during app startup, bound to `127.0.0.1` only, with a generated per-session token required on every API/event request.
- Expose REST JSON endpoints for the vertical slice: project list/read/git metadata, board read, ticket references/read/create manual/create draft/redraft/save/move/clarifications/answer/delete/duplicate, codex status/start/resume/cancel/read run events/read latest run summary.
- Add a renderer transport adapter that returns a `RelayApi`: prefer `window.relay` when available, otherwise use the REST client configured from `VITE_RELAY_API_BASE_URL` plus token from URL query or session storage.
- Replace the top-level preload error gate with normal app boot when either Electron preload or REST transport is available; show an actionable transport error only when neither transport can be configured.
- Add a browser-compatible live run event path using SSE or WebSocket for `codex.onRunEvent`, while preserving the existing Electron IPC event path.

## Acceptance Criteria

- The Electron app still works through the existing preload bridge, with no regression to project, board, ticket, or run workflows in desktop mode.
- A Chrome tab pointed at the local renderer URL can load the normal Relay UI without `window.relay` and complete the vertical-slice workflows listed in requirements.
- HTTP API/event requests are rejected without the generated session token and the server binds only to localhost for this first pass.
- The REST/SSE or REST/WebSocket transport reuses existing shared types and method schemas; project/ticket domain behavior is not reimplemented separately for HTTP.
- Focused tests and typecheck pass, and any remaining IPC-only RelayApi methods are documented as follow-up scope rather than silently broken.

## Test Plan

- Add tests near `tests/ipc-contract.test.ts` for the shared method runner: valid payloads reach handlers, invalid payloads reject before handlers, and encoded results match the schema path used by IPC.
- Add `tests/http-transport.test.ts` covering localhost token enforcement, one query endpoint such as board read, and one mutation endpoint such as ticket save or move using stubbed method handlers.
- Update `tests/renderer-query-hooks.test.tsx:43-63` or add a focused renderer transport test proving `relayOpenProjectInEditor`/query helpers can use the REST adapter when `window.relay` is absent.
- Run `npm test` and `npm run typecheck`.
- Manually validate `npm run dev`, open the logged localhost renderer URL in Chrome with the session token, and confirm projects, board, ticket detail, create/update, run status, and run event updates work without `window.relay`.

## Implementation Notes

- Codebase finding: `src/renderer/src/lib/relayApi.ts:3-10` hard-requires `window.relay`; `getRelayApi()` throws `Relay API is unavailable.` when the preload bridge is absent.
- Codebase finding: `src/renderer/src/App.tsx:3433-3441` blocks the entire app with the preload error UI when `hasRelayApi()` is false, so Chrome URL loading cannot reach normal app UI today.
- Codebase finding: `src/preload/index.ts:26-86` builds the `RelayApi` object by mapping every method to `ipcRenderer.invoke(...)`; `codex.onRunEvent` uses the Electron event channel `codex:runEvent` at lines 78-81.
- Codebase finding: `src/shared/ipc.ts:41-123` already defines a typed channel contract and channel constants for projects, board, ticket, and codex methods; `src/shared/types.ts:633-680` defines the renderer-facing `RelayApi` shape.
- Codebase finding: `src/main/ipc/RelayIpc.ts:34-59` already centralizes payload decode, handler execution, and result encode for schema-backed methods; `src/main/ipc/methods/projects.ts:131-180` and `src/main/ipc/methods/board.ts:6-12` show handlers are registered as method objects, and `src/main/index.ts:30-31` installs IPC before creating the window.
- Implementation: Create a reusable method runner from the existing `RelayIpc` decode/handler/encode logic so both IPC and HTTP can execute the same `relayIpcMethods` without duplicating domain handlers.
- Implementation: Add a new main transport module, for example `src/main/http/RelayHttpServer.ts`, that registers localhost routes, validates the session token, decodes request bodies through each method’s existing `payload` schema, runs handlers through `runBackendEffect`, encodes with `result`, and returns structured JSON errors.
- Implementation: Wire the HTTP server into `src/main/index.ts` after `installAppRuntime()`/before window creation, log the selected local URL and token, and include it in Electron renderer configuration so the desktop app can use the same REST fallback when needed.
- Implementation: Refactor `src/renderer/src/lib/relayApi.ts` into a transport factory with Electron and REST implementations of `RelayApi`; update `src/renderer/src/lib/relayQueries.ts` call sites only as needed to keep using `getRelayApi()`/a shared resolved API.
- Implementation: Implement `codex.onRunEvent` over SSE or WebSocket in the REST client and make `RunEventSinkLive` also publish events to connected browser clients, reusing `rendererRunEventFromRelayEvent` from `src/main/services/run-events/index.ts:33-43`.
- Research used `grep`/`find` because `rg` is unavailable in this environment.
- Existing tests use Node’s built-in `node:test` and are bundled by `tests/run-tests.mjs`; add new tests to that entry point if creating new files.
- `package.json` currently has no Express/Fastify/WebSocket dependency; choosing SSE avoids a new runtime dependency for browser run events.
- The current `addFolder` flow uses Electron dialogs in `src/main/ipc/methods/projects.ts:95-129`; browser local mode should not depend on that flow for acceptance unless a separate path-picker design is added later.

## Codex Handoff

No Codex run has been started.
