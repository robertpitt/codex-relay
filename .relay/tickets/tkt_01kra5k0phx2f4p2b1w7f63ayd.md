---
schemaVersion: 1
id: tkt_01kra5k0phx2f4p2b1w7f63ayd
title: Make Codex ticket drafting timeout recoverable
status: completed
position: 4000
priority: high
labels:
  - bug
  - tickets
  - codex
  - electron-ipc
  - reliability
createdAt: '2026-05-11T00:04:31.057Z'
updatedAt: '2026-05-11T00:15:25.600Z'
codexThreadId: 019e1459-9278-7c40-a0cb-797b7e49d509
runStatus: completed
lastRunId: run_01kra5wn3j4s91f2sk0ve90jzh
---
# Make Codex ticket drafting timeout recoverable

## Context

Creating a draft ticket via the remote method `ticket:createDraft` can fail with: `Error: Codex ticket drafting timed out after 90 seconds. You can save a manual ticket and try Codex again later.` This blocks or degrades the Codex-assisted ticket creation flow in Relay. The current behavior needs investigation and a more resilient user experience around long-running draft generation.

## Requirements

- Find the implementation path for `ticket:createDraft` and the source of the 90 second timeout.
- Determine whether the timeout is caused by slow Codex generation, IPC handling, cancellation behavior, queueing, or missing response handling.
- Ensure timeout failures are handled as a typed, recoverable error rather than an opaque generic exception.
- Preserve the user's original rough ticket idea and any entered form state when the timeout occurs.
- Allow the user to retry Codex drafting after a timeout without creating duplicate drafts or leaving stale in-flight state.
- Confirm manual ticket saving still works after a timeout.
- Add logging or diagnostics with request duration, timeout reason, and a correlation/request id where appropriate.
- Add focused tests for successful draft creation, timeout handling, retry behavior, and manual-save fallback.

## Acceptance Criteria

- A simulated `ticket:createDraft` timeout shows a clear recoverable UI state and does not crash or lock the ticket creation flow.
- After a timeout, the user can retry Codex drafting and the new request is independent of the timed-out attempt.
- After a timeout, the user can save a manual ticket using the same rough idea/form content.
- No duplicate draft tickets are created when a timed-out request later resolves or is retried.
- Timeout behavior is covered by automated tests using mocked delayed Codex responses or fake timers.
- Relevant logs include enough information to distinguish timeout, cancellation, backend failure, and successful completion paths.

## Clarification Questions

- Should Codex drafting continue in the background after 90 seconds, or should the request be cancelled when the timeout is reached?
- Is 90 seconds the desired product timeout, or should this be configurable or increased for longer ticket ideas?
- Should the UI offer an explicit retry action, automatically retry once, or only direct the user to save manually?

## Implementation Notes

- Start by searching the codebase for `ticket:createDraft` and `Codex ticket drafting timed out after 90 seconds`.
- Check both renderer-side IPC invocation and main-process handler behavior if Relay uses Electron IPC.
- Prefer a typed domain error such as `TicketDraftTimeoutError` or an error code field over matching error message strings in the UI.
- Use fake timers or mocked promise delays for deterministic timeout tests.
- Guard against late-arriving responses from timed-out requests mutating current UI state.

## Codex Handoff

### 5/11/2026, 1:15:25 AM

**Summary**
Implemented recoverable Codex ticket drafting timeouts. The `ticket:createDraft` path is renderer `App.tsx` -> preload IPC -> main `ticket:createDraft` handler -> `createTicketDraft` in `src/main/services/codex.ts`. The 90s timeout was in the main Codex draft service around `thread.run`; it was generation/abort-response handling, not renderer IPC queueing.

The draft IPC now returns a typed `TicketDraftResult`, with recoverable timeout payloads containing `code`, `requestId`, `durationMs`, `reason`, and `timeoutMs`. The service aborts on timeout, races the Codex run against a timeout promise, and logs late completions/failures as ignored. The create-ticket UI preserves the rough idea and existing manual fields, shows a retryable error state, and lets the user retry or save manually.

**Files Changed**
- `src/main/services/codex.ts`
- `src/main/services/logger.ts`
- `src/main/index.ts`
- `src/shared/types.ts`
- `src/renderer/src/App.tsx`
- `tests/ticket-draft.test.ts`
- `tests/run-tests.mjs`

**Commands Run**
- Used `grep`, `find`, `cat`, and `sed` to inspect the IPC path, timeout source, tests, types, and UI.
- `npm test`
- `npm run typecheck`
- `npm run build`

**Tests**
- `npm test`: passed, 8/8 tests.
- `npm run typecheck`: passed.
- `npm run build`: passed.

**Remaining Risks**
- Relay now requests cancellation at timeout and ignores late results, but if the Codex SDK does not honor abort internally, that underlying work may continue briefly in the background. The UI and IPC state are protected from stale mutation.


No Codex run has been started.
