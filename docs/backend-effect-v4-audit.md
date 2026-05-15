# Backend Effect Audit

The backend now exposes one renderer-facing boundary: the local REST API in `src/http`.

## Confirmed Boundaries

- `src/http/resources/` validates request payloads using shared schemas before calling workflows.
- `src/http/middleware/` runs Effect middleware around requests and responses for auth, CORS, JSON headers, and future boundary mutations.
- `src/shared/http/` is the single source of truth for route methods, paths, request locations, and response schemas.
- `src/renderer/src/lib/relayApi.ts` consumes the same contract from browser-safe code.
- `src/services/codex`, `src/workflows`, and `src/storage` remain backend-only and can use Effect internally.

## Invariants

- No backend runtime services, layers, or fibers are exported through shared renderer contracts.
- Renderer-facing payloads must be serializable JSON.
- Codex run events are persisted to JSONL and broadcast to the renderer with server-sent events.
- Input validation failures return typed HTTP error payloads instead of leaking backend exceptions.

## Follow-Up Checks

- Keep import-boundary tests aligned with the current `src/http` and `src/shared/http` structure.
- Keep route tests focused on auth, schema validation, successful responses, and error payload shape.
