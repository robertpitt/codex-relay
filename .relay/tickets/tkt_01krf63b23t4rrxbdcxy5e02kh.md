---
schemaVersion: 1
id: tkt_01krf63b23t4rrxbdcxy5e02kh
title: Fix hanging repository chat send from project board
ticketType: task
status: completed
position: 64000
priority: high
effort: medium
labels:
  - bug
  - frontend
  - codex
  - ipc
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T22:49:38.115Z'
updatedAt: '2026-05-12T22:56:53.044Z'
codexThreadId: 019e1e63-4796-7691-9add-730549810977
runStatus: completed
lastRunId: run_01krf66hdnvzdzjpzv5dw9ff65
lastRunStartedAt: '2026-05-12T22:51:23.213Z'
---
# Fix hanging repository chat send from project board

## Context

The read-only repository chat pane opened from the project board chat icon accepts a user message but remains in a loading state indefinitely instead of rendering a Codex response or surfacing an error. This is a regression/follow-up to completed ticket `tkt_01krecndf61bkjwmycgwnd4e65`, which added the read-only repository chat pane. This workflow is the project-scoped code Q&A chat, not ticket creation or drafting.

## Goal

Sending a message in the project-board repository chat must always leave the pending/loading state by either rendering the assistant response or showing a clear failure state.

## Decisions / Assumptions

- The hanging state is caused by an unresolved or unhandled repository chat Codex IPC/service path rather than by a missing API key or network-only outage.
- It is acceptable to show a concise inline error in the repository chat pane when the backend fails, using the existing app error styling if available.
- Because this is a quick bug fix, the implementation should prefer targeted lifecycle/error handling over a broader repository chat redesign.

## Requirements

- Sending a message in the project-board repository chat must always leave the pending/loading state by either rendering the assistant response or showing a clear failure state.
- Failures from the Codex IPC/service path, including thrown errors, rejected promises, missing thread/run results, or stream termination errors, must propagate to the UI as a handled error instead of leaving the chat stuck.
- The fix must stay scoped to the read-only repository chat flow and must not change ticket drafting/chat creation behavior.

## Acceptance Criteria

- A repository chat message from the project board no longer hangs indefinitely in the loading state.
- Backend/IPC errors from the repository chat Codex path are surfaced to the UI as handled failures.
- A regression test covers the previously hanging failure path.

## Test Plan

- Run the backend test target that includes `tests/backend.test.ts` after adding the regression case.
- Run the existing frontend/unit test target for the project board or repository chat component if present.
- Manual validation: open a project board, click the repository chat icon, send a normal code question, and confirm the UI shows either a response or a visible error and never remains indefinitely loading.

## Implementation Notes

- Codebase finding: Bounded research located repository chat IPC/backend surfaces in `src/shared/ipc.ts`, `src/main/ipc/methods/codex.ts`, and Codex service code in `src/main/services/codex/index.ts`; search stopped after 60 candidate files, so frontend entry-point names were not fully resolved.
- Codebase finding: `src/main/ipc/methods/codex.ts` exports `codexIpcMethods` and includes Codex run lifecycle methods such as `approveCodexAction` and `cancelCodexRun`, making it the expected backend IPC registration surface for repository chat send/run behavior.
- Codebase finding: `src/main/services/codex/index.ts` imports `@openai/codex-sdk` types including `Codex`, `Thread`, `ThreadEvent`, `ThreadItem`, and `ThreadOptions`, and defines Codex run-related types such as `CodexRunStartResult`; this is the likely service layer that should resolve, stream, error, or cancel repository chat requests.
- Implementation: Update the repository chat send path so every Codex run lifecycle branch resolves or rejects deterministically: successful completion, backend error, SDK error event, cancellation, and unexpected empty result.
- Implementation: Add frontend state handling around the project-board repository chat send action so loading is cleared in a `finally`-equivalent path and an inline error state is shown when IPC returns or throws an error.
- Implementation: Add a focused regression test in `tests/backend.test.ts` or the nearest existing repository-chat test file that simulates the backend failure/hang condition and asserts the IPC method returns/rejects promptly instead of leaving an unresolved pending operation.
- Bounded research did not fully resolve the frontend component path for the repository chat pane; likely entry points should be connected from the project board chat icon added by `tkt_01krecndf61bkjwmycgwnd4e65`.
- Do not defer basic backend discovery to the implementer beyond the named IPC/service/test files; start with `src/shared/ipc.ts`, `src/main/ipc/methods/codex.ts`, `src/main/services/codex/index.ts`, and `tests/backend.test.ts`.
- If the root cause is an environment/configuration error such as missing Codex credentials, still update the UI so the user sees the actionable failure instead of a spinner.

## Codex Handoff

### 5/12/2026, 11:53:46 PM

Implemented the repository chat hang fix.

**Summary**
Added a repository-chat-only Codex turn timeout in [src/main/services/codex/index.ts](/Users/robertpitt/Projects/relay/src/main/services/codex/index.ts:603). If `thread.run(...)` never settles, the service now aborts the turn and rejects with a handled error, so the existing frontend `.catch(...).finally(...)` path can show the inline error and clear loading.

Added a regression test in [tests/backend.test.ts](/Users/robertpitt/Projects/relay/tests/backend.test.ts:449) that simulates a Codex repository chat run that never resolves and asserts it rejects promptly and aborts the signal.

**Files changed**
- [src/main/services/codex/index.ts](/Users/robertpitt/Projects/relay/src/main/services/codex/index.ts:603)
- [tests/backend.test.ts](/Users/robertpitt/Projects/relay/tests/backend.test.ts:449)

**Commands run**
- `git status --short`
- `grep` / `sed` / `nl` code inspection commands
- `npm test`
- `npm run typecheck`

**Tests run**
- `npm test`: passed, 149 tests.
- `npm run typecheck`: passed.
- Manual validation in the running Electron UI was not performed.

**Subagent usage**
none used

**Remaining risks / follow-up**
The repo had many pre-existing unrelated local changes before this work, including in `src/main/services/codex/index.ts` and `tests/backend.test.ts`; I left those intact. The timeout is currently 120 seconds for real repository chat turns, with a test-only override.


No Codex run has been started.
