# Effect v4 Migration Notes

Relay uses Effect v4 for backend services, workflow composition, logging, and durable kernel state. The renderer-facing boundary is the local REST API, so Effect types must not appear in browser contracts.

## Current Pattern

- Shared data schemas live in `src/shared/schemas`.
- Shared route contracts live in `src/shared/http`.
- Backend route handlers decode requests, run Effect workflows through the app runtime, and encode responses.
- Renderer code uses `fetch` and `EventSource` through the typed `relayApi` client.

## Migration Guidance

- Prefer `Context.Service` and `Layer` for backend dependencies.
- Keep Promise conversion at HTTP, SDK, CLI/test, and browser boundaries.
- Avoid moving platform APIs into workflows directly; add platform services when needed.
- Add route tests when changing renderer/main behavior.
