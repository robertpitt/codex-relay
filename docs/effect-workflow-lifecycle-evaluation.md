# Workflow Lifecycle Evaluation

Relay uses a durable kernel to track long-running Codex-backed jobs and expose their state through the local REST API.

## Lifecycle

1. A renderer action calls `relayApi`.
2. `HttpRestApi` validates the request against the shared contract.
3. The matching resource handler calls a workflow or service through the app runtime.
4. Long-running work is registered with the kernel.
5. Run events are written to JSONL and broadcast through `/api/events`.
6. The renderer invalidates query data or merges live events into local UI state.

## Expectations

- Submitted work must have a durable run id.
- Terminal states must be persisted before the renderer is notified.
- Recovery should reconcile active registry entries with persisted ticket/run state.
- Browser-mode and Electron-frame mode must use the same HTTP path.
