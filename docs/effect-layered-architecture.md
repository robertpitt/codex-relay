# Effect-Layered Architecture

Relay's Electron main process now boots a single Effect runtime from `AppLayerLive`.

## Boundaries

- `src/main/index.ts` is the bootstrap: install runtime, register IPC, create the window, wire lifecycle shutdown.
- `src/main/services/runtime/` owns the shared `ManagedRuntime`, `BackendConfig`, clock, logger service tag, and `AppLayerLive`.
- `src/main/services/io/` is the only backend location for direct Node filesystem, path, child process, fetch, and future socket adapters. Domain services consume Effect services or IO facades from here.
- `src/main/electron/` is the only backend location that imports Electron runtime APIs directly. It is split into primitive services for app lifecycle, windows, dialogs, shell, and raw IPC.
- `src/main/window/RelayWindow.ts` owns Relay-specific window orchestration: main-window creation, reveal/focus behavior, renderer load failure logging, and run-event dispatch.
- `src/main/ipc/` owns the internal IPC boundary. `RelayIpc` registers handlers through the Electron IPC adapter, schema-decodes renderer args, runs Effect handlers, schema-encodes results, and can remove handlers on scope close.
- `src/main/ipc/methods/` owns schema-backed method definitions by public API area: projects, board, tickets, and Codex.
- `src/shared/ipc.ts` owns channel names, argument tuples, and result types used by preload and main.
- `src/main/services/run-events/` owns run JSONL persistence plus renderer event emission.
- `src/main/services/git/` and `src/main/services/registry/` expose Effect services with Promise facades for compatibility.
- `src/main/services/storage/` owns `.relay` persistence helpers, paths, file operations, IDs, ticket errors, and ticket/project behavior.
- `src/main/services/codex/` owns Codex status, draft research, draft generation, ticket update, run execution, cancellation, and error payload mapping.
- `src/renderer/src/lib/relayApi.ts` is the renderer access point for the preload API.

## Compatibility Rules

- `window.relay` method names stay stable.
- No Effect types are exported through shared renderer contracts.
- `.relay` ticket, clarification, audit, and run log formats stay stable.
- Codex still uses `@openai/codex-sdk`; the run sink replaces direct `BrowserWindow` coupling without changing event payloads.
- Raw Node IO imports, raw fetch calls, raw socket usage, and direct Electron imports are guarded by `tests/import-boundaries.test.ts`. Electron imports are allowed only in `src/main/electron/` and preload.

## Transitional Facades

Some modules still expose Promise-returning functions because Electron IPC and existing tests use Promise boundaries. New backend internals should prefer `Context.Service` plus `Layer`, consume IO through `src/main/services/io/`, and keep Promise conversion at IPC or test adapter edges.
