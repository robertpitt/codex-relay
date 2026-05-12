# Backend Effect v4 Upgrade Plan

This is an exploration and planning document only. It does not authorize a broad backend migration in this ticket, and `.effect/` remains third-party reference source that should not be vendored or patched as part of Relay backend work.

## Current State

The current working tree has moved beyond the older audit baseline in `docs/backend-effect-v4-audit.md`:

- `package.json` declares `effect@4.0.0-beta.65`, with matching lockfile changes already present in the worktree.
- Backend source imports Effect directly from `src/main/services/effectRuntime.ts`, `src/main/services/codex.ts`, `src/main/services/logger.ts`, and `src/main/services/storage.ts`.
- `tests/backend.test.ts` imports Effect to verify the backend runtime adapter.
- The renderer still contains React `useEffect` usage; those occurrences are unrelated to backend Effect v4 adoption.

The existing Effect usage is an adapter-style first pass, not a complete Effect architecture. Most public backend functions remain Promise-based, which is correct for Electron IPC and renderer compatibility.

## Current Backend Inventory

### Runtime and IPC Boundaries

- `src/main/index.ts`
  - Owns the Electron app lifecycle, window creation, global process error logging, and all `ipcMain.handle` registrations.
  - Main Promise-facing boundary for renderer calls. Important channels include project registry, board reads, manual ticket operations, ticket draft creation, ticket update runs, Codex execution runs, cancellation, approval, and run event reads.
  - Should remain the outer runtime adapter. Renderer-visible values must continue to match `src/shared/types.ts`.
- `src/preload/index.ts`
  - Exposes `RelayApi` via `contextBridge`.
  - All methods are Promise-returning IPC calls; Effect types must not leak here.
- `src/shared/types.ts`
  - Defines shared data contracts for project summaries, board snapshots, ticket front matter, draft research metadata, audit events, run JSONL lines, Codex events, IPC input types, and `RelayApi`.
  - Compatibility-sensitive contracts include `RunStatus`, `TicketDraftResult`, `TicketDraftErrorPayload`, `RelayCodexEvent`, `RendererRunEvent`, and `RunLogLine`.

### Backend Services

- `src/main/services/effectRuntime.ts`
  - Current Effect adapter: `BackendClock`, `BackendClockLive`, `BackendRuntimeLive`, `BackendEffect`, `runBackendEffect`, `fromPromise`, and `fromSync`.
  - Uses `Context.Service`, `Layer.succeed`, `Effect.provide`, `Effect.runPromise`, `Effect.tryPromise`, `Effect.suspend`, `Effect.succeed`, and `Effect.fail`.
  - This should become the single backend runtime composition point before more services are migrated.
- `src/main/services/logger.ts`
  - Console and file logging to Electron `app.getPath("userData")/relay.log`.
  - Already exposes `logEffect` and Promise wrappers. It uses `BackendClock` but still has direct Electron path access and local JSON serialization.
- `src/main/services/storage.ts`
  - File-backed Relay project store. Owns `.relay/project.json`, ticket markdown front matter, `.relay/runs`, `.relay/clarifications`, `.relay/audit.jsonl`, trash, attachments, and backups.
  - Uses `gray-matter`, Zod schemas from `schemas.ts`, atomic write helpers, path helpers, and `TicketNotFoundError`.
  - Current Effect use is limited to `appendAuditEventEffect`; most storage operations are still Promise-based functions.
- `src/main/services/registry.ts`
  - App-level registry under Electron userData (`registry.json`) for known projects and UI preference state.
  - Uses direct file IO and broad fallback to the default registry on read failures.
- `src/main/services/git.ts`
  - Git metadata service using `execFile("git")`, porcelain parsing, state normalization, and a TTL/pending Promise cache.
  - Good low-risk candidate for a first full Effect service because it is isolated and already has dependency-injected command runner tests.
- `src/main/services/codex.ts`
  - Largest migration surface. Owns Codex CLI status checks, SDK client creation, ticket draft research, URL fetches, codebase file scanning, draft prompting, ticket update runs, full execution runs, run event normalization, JSONL persistence, active run maps, abort controllers, and cancellation.
  - Has initial Effect dependency services for `CodexRunDependencies`, `TicketUpdateDependencies`, and `TicketDraftDependencies`, but orchestration remains mostly Promise/async with `runBackendEffect` wrappers around entry points.
  - Compatibility-sensitive functions include `createTicketDraft`, `ticketDraftErrorToPayload`, `startTicketUpdateRun`, `cancelTicketUpdateRun`, `startCodexRun`, `resumeCodexRun`, `cancelCodexRun`, `approveCodexAction`, and `readCodexRunEvents`.
- `src/main/services/schemas.ts`
  - Zod validation for project config, ticket front matter, registry, ticket drafts, agent updates, and clarifications.
  - Likely remains Zod for shared contract validation unless a later decision replaces it with Effect Schema.
- `src/main/services/clarificationParser.ts`
  - Pure parser for `relay-clarification` fenced JSON blocks. No runtime migration needed beyond typed error cleanup if desired.

### External IO and Clients

- Electron APIs: `app`, `BrowserWindow`, `dialog`, `shell`, `ipcMain`, `contextBridge`, `ipcRenderer`.
- File system: `node:fs/promises` for project store, registry, logs, draft research, and run JSONL.
- Child processes: `execFile` for Git metadata and Codex CLI availability.
- Network: `globalThis.fetch` for bounded ticket-draft URL research.
- AI: `@openai/codex-sdk` for ticket draft generation, ticket update runs, and coding-agent execution.

### Current Error Handling

- IPC handlers mostly throw raw `Error` values except `ticket:createDraft`, which maps failures to `TicketDraftResult`.
- `TicketDraftServiceError` carries typed draft error payload fields but is a custom class rather than an Effect tagged error.
- `TicketNotFoundError` provides a storage-specific not-found signal.
- Zod parsing failures can propagate from config, ticket front matter, draft responses, and clarification stores.
- Logging is best-effort: log file write failures are caught and printed to console.

### Current Tests

- `tests/backend.test.ts` covers project initialization, ticket status transitions, epic/subticket behavior, clarifications, run lifecycle behavior, and the initial Effect runtime adapter.
- `tests/ticket-draft.test.ts` covers mocked Codex draft creation, URL/codebase research, timeout/cancellation, and draft error payloads.
- `tests/ticket-update.test.ts` covers agent ticket-update flows.
- `tests/git-metadata.test.tsx` covers Git metadata parsing and command failure behavior.
- `tests/run-tests.mjs` is the local test runner behind `npm test`.

## Local Effect v4 Reference Notes

Relevant local reference files under `.effect/`:

- `.effect/packages/effect/src/Config.ts`
  - `Config.all`, `Config.withDefault`, `Config.string`, `Config.nonEmptyString`, `Config.number`, `Config.int`, `Config.boolean`, `Config.duration`, `Config.literals`, and `Config.schema` are useful for app-level runtime settings.
- `.effect/packages/effect/src/ConfigProvider.ts`
  - `ConfigProvider.fromEnv` maps environment variables into config paths.
  - `ConfigProvider.fromUnknown` can back tests or JSON-derived app config without reading process state.
- `.effect/packages/effect/src/Context.ts`
  - `Context.Service` is the right service identifier pattern for backend dependencies.
- `.effect/packages/effect/src/Layer.ts`
  - `Layer.succeed`, `Layer.succeedContext`, `Layer.provide`, `Layer.provideMerge`, and layer error handling are relevant to composing backend services.
- `.effect/packages/effect/src/Effect.ts`
  - Current adapter usage aligns with `Effect.tryPromise`, `Effect.provide`, and `Effect.runPromise`.
  - Follow-up phases should use `Effect.scoped`, `Effect.acquireRelease`, `Effect.ensuring`, `Effect.timeout`, `Effect.race`, `Effect.all`, `Effect.forEach`, `Effect.forkScoped`, and `Effect.interrupt` where lifecycle and concurrency are explicit.
- `.effect/packages/effect/src/ManagedRuntime.ts`
  - `ManagedRuntime` is a candidate for a long-lived Electron main-process runtime once layers include scoped services.
- `.effect/packages/effect/src/Schedule.ts`
  - `Schedule.exponential`, `Schedule.fibonacci`, `Schedule.jittered`, `Schedule.recurs`, and `Schedule.spaced` fit bounded retry and periodic refresh policies.
- `.effect/packages/effect/src/Data.ts`
  - `Data.TaggedError` provides tagged, yieldable errors compatible with `Effect.catchTag`.
- `.effect/packages/effect/src/Logger.ts`, `.effect/packages/effect/src/Metric.ts`, and `.effect/packages/effect/src/Tracer.ts`
  - Provide the observability direction for structured logs, counters, timings, and spans.
- `.effect/packages/ai/openai/src/OpenAiTool.ts`
  - Defines provider tools including `ApplyPatch`, `CodeInterpreter`, `FileSearch`, `ImageGeneration`, and `LocalShell`.
  - Relevant only for a later AI/tooling evaluation; Relay currently uses `@openai/codex-sdk` event shapes and should not switch tool stacks in an early migration.
- `.effect/packages/ai/openai/src/Generated.ts` and `.effect/packages/ai/anthropic/src/Generated.ts`
  - Generated typed API surfaces exist locally and may inform future provider clients.
- `.effect/packages/ai/openai/src/OpenAiConfig.ts` and `.effect/packages/ai/anthropic/src/AnthropicConfig.ts`
  - Show provider config as Effect `Context.Service` values with optional client transforms.

## Target Architecture

### Runtime Boundary

Keep Electron IPC and preload Promise-based. Each IPC handler in `src/main/index.ts` should call a Promise-returning backend facade. Internally, those facades should run Effect programs through one backend runtime in `src/main/services/effectRuntime.ts`.

Target shape:

- `BackendRuntime` is built once for Electron main process startup.
- `runBackendEffect` remains the compatibility bridge for Promise entry points.
- Long-lived scoped services use `ManagedRuntime` or equivalent scoped runtime composition once service layers require finalization.
- No Effect types are exported through `src/shared/types.ts`, `src/preload/index.ts`, or renderer-facing APIs.

### Service and Layer Boundaries

Recommended service graph:

- `BackendClock`
  - Current service; keep as a shared dependency.
- `BackendLogger`
  - Wrap structured file/console logging, metadata redaction, and eventually Effect `Logger`.
- `BackendConfig`
  - App/process runtime settings from `Config` and `ConfigProvider`.
  - Project settings in `.relay/project.json` remain domain data loaded by `ProjectStore`.
- `FileSystemService`
  - File IO abstraction for atomic writes, JSONL append, directory creation, reads, and renames.
- `RegistryStore`
  - App registry read/write/upsert/remove.
- `ProjectStore`, `TicketStore`, `ClarificationStore`, `AuditLog`
  - Split `storage.ts` along persistence boundaries before changing behavior.
- `GitService`
  - Git command execution, metadata parsing, cache state, and timeout policy.
- `CodexEnvironment`
  - Codex CLI status, auth discovery, and environment construction.
- `CodexClientService`
  - Factory for `@openai/codex-sdk` clients and thread options.
- `TicketDraftService`
  - Draft status validation, research, prompt rendering, SDK call, timeout/cancellation, and error mapping.
- `AgentRunRegistry`
  - Active run map, active ticket-update map, abort/fiber handles, and run lookup/cancellation.
- `RunEventSink`
  - Run JSONL persistence plus renderer event emission.
- `AgentExecutionService` and `TicketUpdateService`
  - Orchestration for full Codex execution runs and ticket-only update runs.

### Config Handling

Use Effect `Config` for process/app-level runtime settings:

- Codex status command timeout.
- Git command timeout and metadata cache TTL.
- Ticket draft timeout and research limits.
- Log file path override if needed for tests.
- Any future provider API settings.

Keep project-level settings (`defaultModel`, approval policy, sandbox mode, non-Git runs, ticket drafting/execution toggles) in `ProjectConfig` and validate with existing schemas until a deliberate schema migration is planned.

Tests should use `ConfigProvider.fromUnknown`. Production should use `ConfigProvider.fromEnv` plus explicit defaults.

### Typed Errors

Introduce module-specific tagged errors using `Data.TaggedError`:

- `ConfigLoadError`
- `RegistryReadError` / `RegistryWriteError`
- `ProjectConfigError`
- `TicketNotFound`
- `TicketValidationError`
- `GitUnavailable` / `GitCommandError` / `NotGitRepository`
- `CodexUnavailable` / `CodexUnauthenticated`
- `CodexTimeout` / `CodexCancelled` / `CodexInvalidResponse`
- `RunPersistenceError`

Public boundary adapters should map these errors back to existing shared contracts:

- `ticket:createDraft` still returns `TicketDraftResult`.
- Other IPC handlers can continue rejecting Promises with user-readable messages unless a shared error payload is introduced later.
- Run JSONL, audit JSONL, and renderer event payload shapes stay unchanged.

### Resource Lifecycles and Concurrency

Move lifecycle state out of module-level ad hoc maps in phases:

- Start with `AgentRunRegistry` as a service that wraps the current maps.
- Then store run resources as scoped values with `Effect.acquireRelease` or `Effect.scoped`.
- Map existing `AbortController` behavior into Effect interruption gradually. Preserve SDK `AbortSignal` until cancellation parity is tested.
- Use `Effect.ensuring` for cleanup currently handled in `finally` blocks.
- Use `Effect.forkScoped` or managed fibers only after the registry service is test-covered.
- Use `Semaphore`, `Queue`, or `Ref` only where there is a concrete concurrency need; avoid adding abstractions before the run lifecycle is isolated.

### Retries and Scheduling

Use `Schedule` only for idempotent or safely repeatable operations:

- Git metadata refreshes can use bounded command timeout but should not retry aggressively.
- Log/audit appends may retry once with a short delay if the failure is transient.
- URL research can use bounded retry for network failures only, never for unsupported content or invalid URLs.
- Codex generation and coding-agent execution should not be retried automatically without a product decision because duplicate runs can change project files or create duplicate ticket output.

### Observability

Short term:

- Preserve `relay.log`, run JSONL, and audit JSONL exactly.
- Add structured scope metadata consistently: `projectPath`, `ticketId`, `runId`, `threadId`, `requestId`, and duration fields.

Longer term:

- Back `BackendLogger` with Effect `Logger`.
- Add counters/timers for draft latency, run starts, cancellations, invalid responses, Git metadata failures, and persistence failures.
- Introduce tracing spans around draft research, SDK calls, run event processing, storage writes, and IPC entry points.

### Testability

Each migrated service should have a live layer and a test layer. Tests should not rely on process env, Electron userData, real Git, or real Codex unless explicitly integration-scoped.

Required test patterns:

- `ConfigProvider.fromUnknown` for config.
- Fake file system or temp directories for persistence.
- Fake Git command runner for metadata.
- Fake Codex client/thread streams for draft, ticket-update, and full execution runs.
- Fake renderer event sink instead of `BrowserWindow`.
- Deterministic clock service for audit/run timestamps where possible.

## Low-Risk Introduction Points

Introduce Effect first where Relay already has narrow, testable boundaries:

- `src/main/services/effectRuntime.ts`
  - Consolidate runtime/layer composition before touching behavior.
- `src/main/services/git.ts`
  - Isolated IO, command runner dependency already exists, renderer contract is small.
- `src/main/services/registry.ts`
  - App registry CRUD is isolated and easy to rollback.
- `src/main/services/logger.ts`
  - Already partially migrated; can become the canonical logging service.

Keep these unchanged until later phases:

- `src/shared/types.ts` and `src/preload/index.ts` public API contracts.
- `src/main/index.ts` IPC channel names and Promise result shapes.
- Codex execution streaming in `src/main/services/codex.ts`.
- Run JSONL and audit JSONL schemas.
- Ticket markdown/front matter file format.
- Renderer React code.
- AI provider/tool stack; do not replace `@openai/codex-sdk` before a separate product and technical evaluation.

## Migration Phases

### Phase 0: Baseline and Decisions

Scope:

- Verify the dependency decision for `effect@4.0.0-beta.65` versus waiting for a different published Effect v4 version.
- Treat `.effect/` as source reference only.
- Record current IPC contracts and persisted formats before implementation changes.

Files to inspect/change:

- `package.json`
- `package-lock.json`
- `docs/backend-effect-v4-audit.md`
- `docs/backend-effect-v4-upgrade-plan.md`
- `src/shared/types.ts`
- `src/preload/index.ts`
- `src/main/index.ts`

Expected code patterns:

- No behavioral code changes beyond dependency/version decisions approved for the follow-up task.
- Add contract snapshots only if needed for tests.

Validation commands:

- `npm run typecheck`
- `npm test`

Acceptance checks:

- Effect package target is explicitly agreed.
- Shared contracts and persisted formats are listed as compatibility constraints.
- Follow-up tasks know whether existing Effect adapter work should be retained.

Rollback:

- Revert only dependency/version changes from this phase if the target package decision changes.
- Documentation can remain as historical planning context.

Risks:

- Effect v4 beta APIs may shift.
- Existing uncommitted Effect changes may be from another task; coordinate before editing those files.

### Phase 1: Runtime, Config, and Logger Foundation

Scope:

- Turn `effectRuntime.ts` into the canonical runtime/layer module.
- Add app-level config parsing with Effect `Config`.
- Move logging behind a `BackendLogger` service while preserving `logInfo`, `logWarn`, and `logError` Promise wrappers.

Files to inspect/change:

- `src/main/services/effectRuntime.ts`
- `src/main/services/logger.ts`
- `src/main/index.ts`
- `tests/backend.test.ts`
- New candidate: `src/main/services/config.ts`

Expected code patterns:

- `Context.Service` identifiers for `BackendConfig` and `BackendLogger`.
- `Layer.succeed` for simple test services.
- `Config.all`, `Config.withDefault`, and `ConfigProvider.fromEnv` for production defaults.
- `ConfigProvider.fromUnknown` in tests.
- Keep `runBackendEffect` as the only bridge from Effect to Promise.

Validation commands:

- `npm run typecheck`
- `npm test -- backend`
- If the runner does not support file filters, use `npm test`.

Acceptance checks:

- Existing log file behavior is unchanged.
- Tests can supply deterministic clock/config/logger services.
- No shared IPC types import Effect.

Rollback:

- Restore the previous `effectRuntime.ts` and `logger.ts` wrappers.
- Remove the new config layer if it changes startup behavior unexpectedly.

Risks:

- Electron `app.getPath("userData")` may not be available in non-Electron unit tests unless abstracted.
- Config naming must avoid conflicting with project-level `.relay/project.json` settings.

### Phase 2: Git and Registry Vertical Slice

Scope:

- Convert `git.ts` and `registry.ts` to full internal Effect services with Promise facades.
- This is the first low-risk vertical slice because it avoids Codex streaming and ticket persistence.

Files to inspect/change:

- `src/main/services/git.ts`
- `src/main/services/registry.ts`
- `src/main/index.ts`
- `tests/git-metadata.test.tsx`
- Relevant backend tests that call project list/add/remove flows.

Expected code patterns:

- `GitService` with `readMetadata`, `readCachedMetadata`, and `clearCache`.
- `RegistryStore` with `read`, `write`, `upsertProjectPath`, and `removeProjectPath`.
- Typed tagged errors internally, boundary mapping to existing `GitMetadata` states.
- `Ref` or service-local state for cache if it simplifies pending request handling.

Validation commands:

- `npm run typecheck`
- `npm test -- git`
- `npm test`

Acceptance checks:

- Git metadata states remain `loading`, `ready`, `not_git`, `unavailable`, `missing`, or `error` as currently defined.
- Cache TTL and pending Promise coalescing behavior remain equivalent.
- Registry read fallback behavior is documented and tested.

Rollback:

- Keep the public Promise functions unchanged so rollback is a single-module revert.
- If cache behavior regresses, restore the current Map implementation and keep only typed parsing helpers.

Risks:

- Over-modeling Git errors can accidentally change renderer messages.
- Registry broad catch currently hides invalid JSON; tightening it may be a product-visible change and should be separate.

### Phase 3: Storage Service Extraction

Scope:

- Split `storage.ts` into explicit persistence services without changing persisted formats.
- Increase typed errors around project config, ticket reads/writes, clarification records, and audit events.

Files to inspect/change:

- `src/main/services/storage.ts`
- `src/main/services/schemas.ts`
- `src/shared/types.ts`
- `tests/backend.test.ts`
- New candidates:
  - `src/main/services/projectStore.ts`
  - `src/main/services/ticketStore.ts`
  - `src/main/services/clarificationStore.ts`
  - `src/main/services/auditLog.ts`
  - `src/main/services/fileSystem.ts`

Expected code patterns:

- Keep exported Promise functions as facades during extraction.
- Move path and atomic write helpers into a file-system/storage utility service.
- Use `BackendClock` for all persisted timestamps currently created with `new Date()`.
- Use `Data.TaggedError` for not-found, invalid config, invalid ticket, and write failures.
- Keep Zod schemas in place unless a dedicated schema migration is approved.

Validation commands:

- `npm run typecheck`
- `npm test -- backend`
- `npm test`

Acceptance checks:

- `.relay/project.json`, ticket markdown, clarification JSON, audit JSONL, and trash behavior remain byte-compatible except for timestamps.
- Epic/subticket relationship tests continue passing.
- Audit events preserve schema version, actor, source, event type, ticketId, runId, timestamp, and payload.

Rollback:

- Because this phase touches high-value persistence, keep commits small by service.
- If any persisted format changes unintentionally, revert the affected service extraction before continuing.

Risks:

- `storage.ts` has many relationship invariants; splitting too early can obscure transaction-like updates across ticket and epic files.
- There is no database transaction boundary. Failed multi-file updates can still leave partial state; document and test the most important recovery paths.

### Phase 4: Codex Status, Drafting, and Research

Scope:

- Convert Codex status checks, draft preflight, bounded URL/codebase research, timeout handling, and draft error mapping into Effect services.
- Do not migrate long-running coding-agent execution yet.

Files to inspect/change:

- `src/main/services/codex.ts`
- `src/main/services/schemas.ts`
- `src/shared/types.ts`
- `tests/ticket-draft.test.ts`
- Possible new candidates:
  - `src/main/services/codexEnvironment.ts`
  - `src/main/services/ticketDraftService.ts`
  - `src/main/services/draftResearch.ts`

Expected code patterns:

- `CodexEnvironment` wraps CLI availability, auth file/API key checks, and SDK env creation.
- `TicketDraftService` returns `Effect<TicketDraft, TicketDraftError, Services>`.
- Boundary adapter maps tagged draft errors to `TicketDraftErrorPayload`.
- Use `Effect.timeout` or `Effect.race` for draft timeout once behavior matches current `AbortController` semantics.
- Use `Schedule` only for safe URL research retry, not for Codex generation.

Validation commands:

- `npm run typecheck`
- `npm test -- ticket-draft`
- `npm test`

Acceptance checks:

- `ticket:createDraft` still returns `{ ok: true, draft }` or `{ ok: false, error }`.
- Timeout, cancellation, invalid response, unavailable CLI, unauthenticated CLI, and backend failure payloads are unchanged.
- Research limits and limitations remain visible in draft metadata.
- URL fetches remain bounded and untrusted.

Rollback:

- Keep `createTicketDraft` signature and dependency injection type-compatible during the phase.
- If timeout/cancellation parity is uncertain, retain current Promise race and wrap only preflight/research with Effect.

Risks:

- Current timeout behavior intentionally logs late Codex completions/failures; replacing it with interruption must preserve that observability or intentionally update tests.
- Research scans can be slow in large repos; keep limits config-driven and default-compatible.

### Phase 5: Ticket Update and Full Agent Execution

Scope:

- Migrate the long-running Codex run lifecycle after runtime, storage, and draft services are stable.
- Make cancellation, cleanup, event emission, and active run tracking explicit.
- Follow the decision in `docs/effect-workflow-lifecycle-evaluation.md`: production Workflow usage must stay behind `src/main/services/kernel/` and use Relay's durable `JobLedger`.
- Keep board columns plus ticket `runStatus` as user-visible product lifecycle while moving backend execution state into the kernel ledger.

Files to inspect/change:

- `src/main/services/codex/index.ts`
- `src/main/services/storage/index.ts` or extracted store services
- `src/main/services/run-events/`
- `src/main/index.ts`
- `src/shared/types.ts`
- `tests/backend.test.ts`
- `tests/ticket-update.test.ts`
- New candidates:
  - `src/main/services/kernel/`
  - `src/main/services/agentExecutionService.ts`
  - `src/main/services/ticketUpdateService.ts`

Expected code patterns:

- `JobSupervisor` and future kernel registries wrap current `activeImplementationRuns`, `activeDraftRuns`, `queuedRunIntents`, `startingRuns`, `projectSchedulers`, `activeTicketUpdateRuns`, and `activeTicketUpdateRunsByTicket`.
- A small lifecycle policy service owns pure decisions for preflight eligibility, queue reconciliation, target status selection, cancellation destination, clarification blocking, and completion transitions.
- `RunEventSink` owns JSONL append and renderer emission.
- Use `Effect.acquireRelease` or `Effect.ensuring` to guarantee map cleanup and status finalization.
- Keep `AbortController` until SDK cancellation is verified against Effect interruption.
- Convert stream event processing after a fake async event-stream test harness exists.
- Do not use `WorkflowEngine.layerMemory` in production. Activities, durable deferreds, and durable clocks remain out of scope until Relay defines durable stores for each.

Validation commands:

- `npm run typecheck`
- `npm test -- backend`
- `npm test -- ticket-update`
- `npm test`

Acceptance checks:

- Starting, resuming, cancelling, failing-before-stream, failing-during-stream, clarification-blocked, and completed runs preserve current ticket state transitions.
- Run JSONL lines match `RunLogLine`.
- Renderer event shapes match `RendererRunEvent`.
- Active run maps are always cleaned up.
- Cancelling a run still marks `runStatus` as `cancelled`.
- Production `effect/unstable/workflow` imports stay restricted to `src/main/services/kernel/`.
- Manual board moves, manual ticket edits, Ready queueing, queued cancellation, active cancellation, run start, clarification blocking, completion to Review, human acceptance, and reopen follow the lifecycle map in `docs/effect-workflow-lifecycle-evaluation.md`.

Rollback:

- Keep old Promise orchestrators until the new services pass parity tests.
- Migrate ticket update runs before full execution runs because they do not modify project files outside ticket content.

Risks:

- This is the highest-risk phase. Event ordering, cancellation, and persisted run state are user-visible.
- The Codex SDK may require AbortSignal behavior that is not naturally identical to Effect interruption.
- Workflow APIs are intentionally wrapped by the kernel. The remaining risk is divergence between kernel execution status and visible ticket `runStatus` while the old Codex maps are being retired.

### Phase 6: AI Provider and Tooling Evaluation

Scope:

- Evaluate whether local Effect AI packages can replace or supplement bespoke Codex SDK structures.
- This phase should be a design spike before implementation.

Files to inspect/change:

- `src/main/services/codex.ts`
- Future AI service modules from Phase 4/5
- `.effect/packages/ai/openai/src/OpenAiTool.ts`
- `.effect/packages/ai/openai/src/Generated.ts`
- `.effect/packages/ai/openai/src/OpenAiClient.ts`
- `.effect/packages/ai/openai/src/OpenAiConfig.ts`
- `.effect/packages/ai/anthropic/src/Generated.ts`
- `.effect/packages/ai/anthropic/src/AnthropicConfig.ts`

Expected code patterns:

- No production switch until API compatibility and package publishing strategy are agreed.
- Map Relay's `RelayCodexEvent` to provider events in a test-only adapter first.
- Evaluate `OpenAiTool.ApplyPatch` and `OpenAiTool.LocalShell` only if Relay chooses to own tool execution beyond the Codex SDK.

Validation commands:

- `npm run typecheck`
- Targeted adapter tests added in this phase
- `npm test`

Acceptance checks:

- A provider decision is recorded before replacing `@openai/codex-sdk`.
- Existing approval/cancellation/run-event contracts have a migration path.
- No `.effect/` source is vendored or patched.

Rollback:

- Keep provider evaluation behind adapter interfaces.
- If generated package APIs are unstable, keep Codex SDK as the live provider and retain notes only.

Risks:

- Generated API surfaces may not match the Codex SDK workflow.
- Provider-defined local tools could change Relay's security model and need separate review.

### Phase 7: Hardening and Cleanup

Scope:

- Remove transitional helpers once service layers own IO and orchestration.
- Improve observability, docs, and CI checks.

Files to inspect/change:

- `src/main/services/effectRuntime.ts`
- All extracted service modules
- `docs/backend-effect-v4-audit.md`
- `docs/effect-v4-migration.md`
- `docs/backend-effect-v4-upgrade-plan.md`
- `tests/run-tests.mjs`

Expected code patterns:

- Replace `fromPromise`/`fromSync` call sites with domain-specific services where practical.
- Add Effect logging/metrics/tracing in one place.
- Keep compatibility facades only where IPC or tests need them.

Validation commands:

- `npm run typecheck`
- `npm test`
- `npm run build`

Acceptance checks:

- Backend Effect services are consistently layered.
- Public Promise APIs remain stable.
- Tests cover config, storage, Git, draft, update, execution, cancellation, logging, and error mapping.
- Documentation names the remaining non-Effect backend surfaces intentionally.

Rollback:

- Revert cleanup commits independently from behavior-changing migration commits.
- Keep compatibility wrappers until at least one release cycle after the migration is stable.

Risks:

- Cleanup can accidentally become a broad refactor. Keep it after behavioral parity is proven.

## Decision Log

- Use local `.effect/` as reference only. Do not vendor or patch it in Relay.
- Keep Electron IPC and preload APIs Promise-based. Effect is an internal backend implementation detail.
- Assume the current direct `effect@4.0.0-beta.65` dependency remains unless the product owner decides to wait for another published version.
- Use `Context.Service` and `Layer` for backend dependency injection.
- Use Effect `Config` for process/app-level settings, not as an immediate replacement for project `.relay/project.json`.
- Preserve Zod schemas for shared contract validation until a separate schema migration is approved.
- Do not confuse React `useEffect` with Effect v4 adoption; renderer React hooks are out of scope.
- Do not replace `@openai/codex-sdk` or Relay's current Codex event model until a dedicated AI/provider phase.

## Open Questions

- Should the implementation target the current `effect@4.0.0-beta.65` package exactly, or wait for a later published Effect v4 version?
- Which area should be prioritized for the first production migration after the low-risk foundation: Git/registry, config, persistence, ticket drafting, or run execution?
- Must all existing Electron renderer behavior and IPC channel names remain stable across the whole migration?
- Should registry read failures continue falling back silently to defaults, or should invalid registry JSON become visible health/error state?
- Should project settings eventually be migrated from Zod-only validation to Effect Schema, or should Effect Schema be limited to provider/config integration?
- What level of retry is acceptable for network URL research, if any?
- Should future AI/provider work support Anthropic/OpenAI directly, or is Codex SDK the only supported agent backend for now?

## Research Limitations

- This plan was based on local repository inspection and local `.effect/` source only.
- No external documentation or URLs were used.
- `rg` was not available in this environment, so repository search used `find`, `grep`, and targeted file reads.
- The worktree already contained uncommitted Effect-related implementation files and docs; this plan records the current tree rather than assuming base `HEAD`.
- The local Effect v4 source appears beta-era; API names and package structure may change before Relay completes the migration.
- The existing test suite was inspected by file name and targeted reads, but not every test assertion was manually reviewed.
