# Backend Effect v4 Migration Notes

Relay now targets `effect@4.0.0-beta.65`, the Effect v4 package published from the effect-smol repository.

The first migration pass keeps existing IPC-facing Promise APIs intact and moves backend internals onto a small Effect runtime adapter in `src/main/services/effectRuntime.ts`. The adapter provides:

- `runBackendEffect` for running backend Effect programs at existing Promise boundaries.
- `BackendClock` and `BackendRuntimeLive` as the initial dependency-injection layer.
- `fromPromise` for preserving existing rejected error values while routing async work through Effect v4.

Codex backend entry points keep their public Promise signatures, but test and production dependencies are adapted into Effect layers at the boundary:

- `CodexRunDependencies` is provided through `relay/CodexRunDependencies` before run orchestration starts.
- `TicketUpdateDependencies` is provided through `relay/TicketUpdateDependencies`.
- `TicketDraftDependencies` is provided through `relay/TicketDraftDependencies`.

This keeps existing test doubles source-compatible while making the backend dependency boundary explicit.

Compatibility notes:

- Shared renderer contracts, run statuses, audit event shapes, run log JSONL shape, and `backend_failure` draft error semantics are unchanged.
- Renderer React `useEffect` code is intentionally untouched.
- Public backend function signatures remain source-compatible while their implementation uses Effect at the runtime boundary.
- Codex run cancellation still uses the SDK `AbortSignal`; active run cleanup is verified after abort and stream-start failure paths.
