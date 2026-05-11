---
schemaVersion: 1
id: tkt_01krb21fnwxxpc73gt972jpetz
title: Fix project-scoped ticket reads during agent runs
status: completed
position: 10000
priority: high
labels:
  - bug
  - tickets
  - ipc
  - project-state
createdAt: '2026-05-11T08:21:45.276Z'
updatedAt: '2026-05-11T08:30:05.425Z'
codexThreadId: 019e1620-fef8-7ad0-a39c-5a64313307d0
runStatus: completed
lastRunId: run_01krb21zmdjq80dv3g5pwpr0bz
---
# Fix project-scoped ticket reads during agent runs

## Context

Relay logged a run starting with projectPath `/Users/robertpitt/Projects/relay`, but the `ticket:read` handler tried to open the ticket from `/Users/robertpitt/Projects/foodhub/falcon/.relay/tickets/...`. This suggests ticket IDs, selected-ticket state, or IPC path resolution are leaking across projects, causing runs to fail with ENOENT and potentially operate on the wrong workspace.

## Requirements

- Ensure `ticket:read` resolves ticket files from the active/requested project path, not from stale global project state.
- Ensure `codex:run` passes and preserves the correct project context through all ticket-loading calls.
- Prevent stale selected ticket IDs or cached ticket paths from being reused after switching projects.
- Add a graceful missing-ticket error path that identifies the project and ticket ID without crashing the handler.
- Add regression coverage for reading/running a ticket after switching between two projects with different `.relay/tickets` directories.

## Acceptance Criteria

- Starting a run for `/Users/robertpitt/Projects/relay` reads `/Users/robertpitt/Projects/relay/.relay/tickets/<ticketId>.md`.
- No code path during that run attempts to read from `/Users/robertpitt/Projects/foodhub/falcon` unless that is the active project for the run.
- Switching projects clears or revalidates selected ticket state before ticket read/run actions are available.
- If a ticket file is missing, the UI shows a clear recoverable error and logs the project path plus ticket ID.
- Automated tests cover the cross-project stale-state scenario and pass locally.

## Clarification Questions

- Are ticket IDs intended to be globally unique, or only unique within each project’s `.relay/tickets` directory?

## Implementation Notes

- Inspect the source handler behind `ticket:read` and `readTicketFile`; avoid relying on generated `out/main/index.js` as the edit target unless this project intentionally edits built output.
- Look for project selection state, ticket cache state, and IPC payloads around `codex:run`, `ticket:read`, and ticket list/detail views.
- Prefer passing an explicit `projectPath` through ticket APIs and validating it against the current project model at the boundary.

## Codex Handoff

### 5/11/2026, 9:30:05 AM

Summary of changes made:
- Scoped ticket reads to normalized requested project paths and added `TicketNotFoundError` with project path, ticket ID, and ticket file path.
- Logged missing `ticket:read` and `codex:run` ticket failures with project/ticket context.
- Preserved normalized `projectPath`/`ticketId` throughout Codex run ticket-loading calls.
- Cleared/revalidated open ticket state when switching projects and ignored stale async board loads.
- Added a recoverable ticket-detail error state with Retry/Close actions.
- Added regression coverage for stale cross-project ticket reads and Codex runs.

Files changed:
- `src/main/services/storage.ts`
- `src/main/services/codex.ts`
- `src/main/index.ts`
- `src/renderer/src/App.tsx`
- `tests/backend.test.ts`

Commands run:
- `rg` inspection commands, failed because `rg` is not installed.
- `find`, `grep`, and `sed` source inspection commands.
- `git status --short`
- `npm run typecheck`
- `npm test`

Tests run and results:
- `npm run typecheck`: passed.
- `npm test`: passed, 20/20 tests.

Remaining risks or follow-up:
- I did not run the packaged Electron UI manually; coverage is via typecheck and automated tests.


No Codex run has been started.
