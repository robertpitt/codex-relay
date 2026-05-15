# Backend Effect v4 Migration Surface Audit

Scope: backend and shared contract surfaces only. Renderer matches for `effect` are React `useEffect` calls in `src/renderer/src/App.tsx`, `src/renderer/src/components/AgentActivity.tsx`, and `src/renderer/src/lib/keyboardShortcuts.tsx`; they are not part of the backend Effect migration.

## Dependency State

- Package manager files requiring dependency updates: `package.json` and `package-lock.json`.
- Base `HEAD` did not declare a direct Effect package in `package.json` and had no `effect`, `effect-smol`, `@effect/io`, or `@effect/data` source imports.
- The current pinned target in this worktree is `effect@4.0.0-beta.65`, recorded in `package.json`, `package-lock.json`, and `docs/effect-v4-migration.md`.
- No separate `effect-smol` npm package is declared; the target is the `effect` package published from the effect-smol line.

## Direct Effect Touch Points

- `src/main/services/effectRuntime.ts`
  - Backend runtime adapter surface: `BackendClock`, `BackendRuntimeLive`, `BackendEffect`, `runBackendEffect`, and `fromPromise`.
  - Uses Effect v4 APIs: `Context.Service`, `Layer.succeed`, `Effect.Effect`, `Effect.provide`, `Effect.runPromise`, and `Effect.tryPromise`.
- `src/main/services/codex.ts`
  - Main migration surface for Codex status, ticket drafting, ticket update runs, execution runs, run event persistence, cancellation, and ticket run state.
  - Uses service layers for `CodexRunDependencies`, `TicketUpdateDependencies`, and `TicketDraftDependencies`.
  - Keeps public APIs Promise-based: `getCodexStatus`, `createTicketDraft`, `startTicketUpdateRun`, `startCodexRun`, `resumeCodexRun`, and run cancellation/read helpers.
- `src/main/services/logger.ts`
  - Uses Effect logging through `LoggerLive`, with Promise adapters kept at existing Promise boundaries.
- `src/main/services/storage.ts`
  - Uses Effect for `appendAuditEventEffect` and the backend clock dependency while preserving storage APIs as Promises.
- `tests/backend.test.ts`
  - Imports `Effect`, `BackendClock`, and `runBackendEffect` for backend runtime regression coverage.

## Async Runtime Surface Without Direct Effect Imports

- `src/main/index.ts`
  - Electron IPC runtime boundary. All `ipcMain.handle` callbacks remain Promise-facing and must continue returning shared contract payloads.
  - Important channels: `ticket:createDraft`, `ticket:startAgentUpdate`, `ticket:cancelAgentUpdate`, `codex:status`, `codex:startRun`, `codex:resumeRun`, `codex:cancelRun`, and `codex:readRunEvents`.
- `src/main/services/git.ts`
  - Async `execFile` command runner and cached pending Promise state. Not currently an Effect dependency, but it is a backend async service candidate if the migration expands beyond Codex/storage/logger.
- `src/main/services/registry.ts`
  - Async app registry file IO behind project IPC calls. No direct Effect usage.
- `src/main/services/clarificationParser.ts` and `src/main/services/schemas.ts`
  - Synchronous parsing/schema modules. No runtime migration needed unless error typing or validation adapters change.
- `src/preload/index.ts`
  - Renderer-facing IPC adapter. No Effect usage, but Promise signatures must remain compatible with `RelayApi`.

## Effect v4 Mapping

- Runtime creation/execution
  - Current Promise boundary/ad hoc async entry point -> `runBackendEffect(program)`.
  - Target Effect v4 API -> `Effect.provide(program, BackendRuntimeLive)` and `Effect.runPromise(...)`.
- Layers and services
  - Current test dependency objects (`CodexRunDependencies`, `TicketUpdateDependencies`, `TicketDraftDependencies`) -> `Context.Service<T>(...)` plus `Layer.succeed(service)(dependencies)`.
  - Shared backend services -> `BackendClock` and `BackendRuntimeLive`; future services should be added behind the adapter instead of imported ad hoc across modules.
- Async IO
  - `Promise`/`async` file, SDK, fetch, and child-process operations -> `Effect.tryPromise` through `fromPromise`.
  - Synchronous side effects should use focused services directly instead of a generic runtime helper.
- Errors
  - Existing thrown/rejected error values are intentionally preserved at Promise boundaries.
  - `TicketDraftServiceError` and `TicketDraftErrorPayload` should remain compatibility adapters for `TicketDraftResult`.
  - Effect-side recovery/logging should use `Effect.catch`/`Effect.catchCause` without changing renderer-visible error codes or messages.
- Interruption and cancellation
  - Existing cancellation is `AbortController`/`AbortSignal` backed for Codex SDK calls and URL fetches.
  - Later Effect-native cancellation should map abort lifetimes to `Effect.interrupt`, `Fiber.interrupt`, or scoped resources without changing the `cancelCodexRun(runId)` and `cancelTicketUpdateRun(runId)` APIs.
- Resource finalization
  - Current finalizers are `finally` blocks, `clearTimeout`, active run map deletion, and startup-failure cleanup.
  - Target Effect v4 equivalents are `Effect.ensuring`, `Effect.acquireRelease`, `Effect.onExitPrimitive`, or scoped fibers/resources where appropriate.

## Shared Contract Risks

- `src/shared/types.ts`
  - `RunStatus` drives ticket front matter, board display, cancellation, and completion semantics. Preserve `"idle" | "drafting" | "running" | "blocked" | "failed" | "completed" | "cancelled"`.
  - `ProjectHealth`, `ProjectSummary`, `BoardSnapshot`, and `TicketSummary` must stay stable for board/project IPC.
  - `TicketDraftErrorCode` includes `backend_failure`; `ticketDraftErrorToPayload` must continue returning `TicketDraftResult` instead of throwing through IPC for draft creation.
  - `RelayAuditEvent`, `RelayCodexEvent`, `RendererRunEvent`, and `RunLogLine` define audit JSONL, run JSONL, IPC event payloads, and renderer progress state.
  - `RelayApi` keeps all renderer-facing methods Promise-based; no `Effect` type should leak through preload/shared contracts.
- `src/main/services/codex.ts`
  - `updateTicketRunState`, `emitRunEvent`, and `writeRunLog` are compatibility-sensitive because they bridge backend runtime effects to persisted files and renderer events.
  - `activeRuns`, `activeTicketUpdateRuns`, and `activeTicketUpdateRunsByTicket` must be finalized on success, failure, startup failure, and cancellation.
- `src/main/services/storage.ts`
  - `transitionTicketStatus`, `saveTicket`, `createClarificationQuestions`, and `answerClarificationQuestion` append audit events whose schema and timestamp semantics must remain stable.
- `tests/backend.test.ts`, `tests/ticket-draft.test.ts`, and `tests/ticket-update.test.ts`
  - These are the backend migration regression paths for runtime provisioning, dependency injection, run status, audit events, cancellation, timeouts, and stream cleanup.

## Migration Checklist For Remaining Subtickets

- Keep `package.json` and `package-lock.json` pinned to the approved target, currently `effect@4.0.0-beta.65`, unless a product decision changes it.
- Keep `src/main/services/effectRuntime.ts` as the only backend runtime adapter and add new Effect services there or next to the owning module with explicit layers.
- Do not expose Effect types through `src/shared/types.ts`, `src/preload/index.ts`, or Electron IPC handlers.
- Convert backend internals incrementally while preserving existing Promise-returning public APIs.
- Preserve `AbortSignal` behavior until cancellation is fully represented by Effect fibers/scopes and covered by tests.
- Preserve run log JSONL, audit JSONL, renderer event shapes, `RunStatus`, and `backend_failure` draft semantics.
- Run `npm run typecheck` and `npm test` after any implementation subticket that touches `src/main/services/codex.ts`, `src/main/services/storage.ts`, `src/main/services/logger.ts`, or shared contracts.
