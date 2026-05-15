# Effect Layered Architecture

Relay keeps Electron, filesystem, Codex, storage, and renderer communication behind explicit service layers.

## Current Runtime Shape

- `src/main.app.ts` runs the already-composed app runtime, starts `HttpRestApi`, creates the Electron window, recovers kernel jobs, and waits for app shutdown.
- `src/app/AppRuntime.ts` composes the live application layer from platform, config, runtime logging, storage, HTTP events, and backend services.
- `src/app/RelayWindow.ts` owns Relay-specific window behavior such as renderer error handling and API bootstrap data.
- `src/config/AppConfig.ts` owns typed app configuration and defaults.
- `src/runtime/Logging.ts` owns the Effect logger used by the managed runtime.
- `src/http/HttpRestApi.ts` owns the loopback REST server, request decoding, response encoding, and shutdown.
- `src/http/resources/` maps shared HTTP endpoint contracts to backend workflows and services.
- `src/http/middleware/` owns Effect middleware for request and response concerns such as auth, CORS, and JSON headers.
- `src/shared/http/` defines the renderer/main contract: method, path, request location, request schema, and response schema.
- `src/renderer/src/lib/relayApi.ts` is the browser-safe client used by the Electron frame and by Chrome/Vite.

## Layer Ownership

| Area | Modules | Role |
| --- | --- | --- |
| Bootstrap | `main.app.ts` | Start the already-composed runtime and run the app lifecycle. |
| App runtime | `src/app` | Compose Relay-specific live layers and app-shell behavior. |
| Config | `src/config` | Load typed app configuration from Effect config providers. |
| HTTP boundary | `src/http`, `src/shared/http` | Validate and route renderer requests over local REST. |
| Runtime infrastructure | `src/runtime` | Provide runtime helpers and logging without owning app capability services. |
| Platform | `src/platform` | Wrap Electron, filesystem/path, process lifecycle, shell, fetch, and clock concerns. |
| Workflows | `src/workflows` | Coordinate user-facing project, board, and ticket behavior. |
| Services | `src/services` | Own backend capabilities such as Codex, kernel, git, registry, and run-event behavior. |
| Storage | `src/storage` | Persist `.relay` files with atomic writes and typed stores. |

## Rules

- Renderer code talks to main through `relayApi` only.
- Shared contracts stay under `src/shared/http` and shared data schemas stay under `src/shared/schemas`.
- Backend services may use Effect layers and service tags internally, but renderer contracts must stay serializable and browser-safe.
- App-specific shell concerns should live under `src/app`, not beside generic capability services.
- Runtime-wide logger wiring belongs to `src/runtime/Logging.ts`; application code should depend on Effect logging or the small logging helpers, not a logger service tag.
- Run progress reaches the UI through `/api/events` server-sent events.
- Promise conversion should happen at HTTP, SDK, CLI/test, or browser client boundaries.
