# Effect-Layered Architecture

Relay's Electron main process now boots a single Effect runtime from `AppLayerLive`.

## Runtime Config

Backend process config is owned by `src/main/services/runtime/index.ts` and installed into the desktop app through `src/main/services/runtime/appLayer.ts`. The runtime reads these Effect `Config` keys from the default environment provider; missing values keep the listed defaults.

| Env key | BackendConfig field | Default |
| --- | --- | --- |
| `RELAY_GIT_METADATA_CACHE_TTL_MS` | `gitMetadataCacheTtlMs` | `3000` |
| `RELAY_GIT_COMMAND_TIMEOUT_MS` | `gitCommandTimeoutMs` | `5000` |
| `RELAY_CODEX_STATUS_TIMEOUT_MS` | `codexStatusTimeoutMs` | `5000` |
| `RELAY_STORAGE_ADAPTER` | `storageAdapter` | `filesystem` |

Tests can parse the same config spec with `ConfigProvider.fromUnknown` through `loadBackendConfig`.

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
- `src/main/services/kernel/` owns durable backend execution: `JobLedger`, `JobSupervisor`, `RelayWorkflowEngineLive`, idempotency, worker registry, and the only approved production import of `effect/unstable/workflow`.
- `src/main/services/codex/` owns Codex status, draft research, draft generation, ticket update, run execution, cancellation, and error payload mapping.
- `src/renderer/src/lib/relayApi.ts` is the renderer access point for the preload API.

## Backend Kernel Layers

```mermaid
flowchart TD
  subgraph L0["Layer 0: Root Host"]
    ElectronMain["Electron Main Process"]
    NodeRuntime["Node Runtime"]
  end

  subgraph L1["Layer 1: Bootloader"]
    MainEntry["src/main/index.ts"]
    InstallRuntime["installAppRuntime()"]
    Ready["ElectronApp.whenReady()"]
    RegisterIpc["installRelayIpcHandlers()"]
    CreateWindow["RelayWindow.createMain()"]
    Recovery["JobSupervisor.recoverFromRegistry()"]
  end

  subgraph L2["Layer 2: App Runtime / Bootstrap"]
    AppLayer["AppLayerLive"]
    Base["Clock + BackendConfig"]
    Logger["BackendLogger"]
    IO["IoLive"]
    ElectronAdapters["Electron adapters"]
  end

  subgraph L3["Layer 3: Backend Kernel"]
    WorkflowEngine["RelayWorkflowEngineLive"]
    JobLedger["JobLedger"]
    Supervisor["JobSupervisor"]
    Idempotency["IdempotencyService"]
    WorkerRegistry["WorkerRegistry"]
  end

  subgraph L4["Layer 4: Domain Services"]
    Storage["Storage Service"]
    Codex["Codex Service"]
    GitSync["Git Sync Service"]
    Workers["Local/Remote Workers"]
  end

  subgraph L5["Layer 5: Durable State"]
    Tickets[".relay/tickets/*.md"]
    Runs[".relay/runs/**/*.jsonl"]
    Kernel[".relay/kernel/jobs/{executionId}/"]
  end

  ElectronMain --> MainEntry
  NodeRuntime --> MainEntry
  MainEntry --> InstallRuntime
  MainEntry --> Ready
  Ready --> RegisterIpc
  Ready --> CreateWindow
  Ready --> Recovery

  InstallRuntime --> AppLayer
  AppLayer --> Base
  AppLayer --> Logger
  AppLayer --> IO
  AppLayer --> ElectronAdapters
  AppLayer --> WorkflowEngine
  AppLayer --> Supervisor
  AppLayer --> Storage
  AppLayer --> Codex

  Supervisor --> WorkflowEngine
  Supervisor --> JobLedger
  Supervisor --> Idempotency
  WorkflowEngine --> JobLedger
  WorkflowEngine --> WorkerRegistry

  Codex --> Supervisor
  Codex --> Storage
  Storage --> Tickets
  Codex --> Runs
  JobLedger --> Kernel
  GitSync --> Supervisor
  Workers --> Supervisor
```

## Runtime Flow

```mermaid
sequenceDiagram
  participant Root as Electron Main
  participant Boot as Bootloader
  participant Runtime as ManagedRuntime(AppLayerLive)
  participant IPC as Relay IPC
  participant Supervisor as JobSupervisor
  participant WF as RelayWorkflowEngine
  participant Ledger as JobLedger
  participant Domain as Domain Service
  participant Events as RunEventSink
  participant Disk as .relay

  Root->>Boot: load src/main/index.ts
  Boot->>Runtime: installAppRuntime()
  Boot->>IPC: installRelayIpcHandlers()
  Boot->>Runtime: RelayWindow.createMain()
  Boot->>Supervisor: recover incomplete executions

  IPC->>Supervisor: submit typed command
  Supervisor->>Ledger: append submitted event + snapshot
  Supervisor->>WF: Workflow.execute(payload, discard: true)
  WF-->>Supervisor: executionId
  Supervisor-->>IPC: execution handle

  Domain->>Supervisor: mark running/suspended/completed/failed
  Supervisor->>Ledger: append status event + snapshot
  Domain->>Events: emit renderer-facing event
  Events->>Disk: append run JSONL
  Ledger->>Disk: write kernel snapshot/event log
```

## Compatibility Rules

- `window.relay` method names stay stable.
- No Effect types are exported through shared renderer contracts.
- `.relay` ticket, clarification, audit, and run log formats stay stable.
- `.relay/kernel/jobs/{executionId}/snapshot.json` and `events.jsonl` are the durable backend execution store.
- Codex still uses `@openai/codex-sdk`; the run sink replaces direct `BrowserWindow` coupling without changing event payloads.
- Raw Node IO imports, raw fetch calls, raw socket usage, direct Electron imports, and unstable Workflow imports are guarded by `tests/import-boundaries.test.ts`. Electron imports are allowed only in `src/main/electron/` and preload. Unstable Workflow imports are allowed only in `src/main/services/kernel/`.

## Transitional Facades

Some modules still expose Promise-returning functions because Electron IPC and existing tests use Promise boundaries. New backend internals should prefer `Context.Service` plus `Layer`, consume IO through `src/main/services/io/`, and keep Promise conversion at IPC or test adapter edges.

For backend execution control, see `docs/effect-workflow-lifecycle-evaluation.md`; Relay keeps board columns plus ticket `runStatus` user-visible while the kernel ledger becomes authoritative for backend job execution state.
