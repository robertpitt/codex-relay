---
schemaVersion: 1
id: tkt_01krfc1avn3hhbrwczwwybg5b5
title: Delete unused legacy CreateTicketModal path
ticketType: task
status: completed
position: 69000
priority: medium
effort: medium
labels:
  - frontend
  - ticket-creation
  - cleanup
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-13T00:33:23.829Z'
updatedAt: '2026-05-13T00:42:46.366Z'
authoringState: ready
codexThreadId: 019e1ec3-7873-73c1-816e-3a8ab4256966
runStatus: completed
lastRunId: run_01krfc3nw9k9nnd3kp3dhx2x8x
lastRunStartedAt: '2026-05-13T00:36:27.234Z'
---
# Delete unused legacy CreateTicketModal path

## Context

Relay has already moved ticket creation away from the legacy modal flow: prior completed work simplified creation to agent-generated drafts only, then replaced the topbar Create Ticket modal with the floating ticket input bar. This cleanup should remove the now-unreachable `CreateTicketModal` component path and modal-only/manual-entry remnants without deleting shared ticket-drafting helpers that are still used by the current floating input flow or tests.

## Goal

Remove the unused legacy `CreateTicketModal` component/module and any imports, state, props, styles, or tests that only exist to support opening or rendering that modal.

## Decisions / Assumptions

- The legacy modal is no longer product-supported because ticket creation now happens through the floating input bar and agent-generated drafts only.
- Shared helpers should only be deleted when they are provably unused by current code and tests; otherwise they remain even if they originated in the modal era.
- Manual board/shared source types in `src/shared/types.ts` may still describe non-modal board behavior and are out of scope for deletion unless code references prove otherwise.

## Requirements

- Remove the unused legacy `CreateTicketModal` component/module and any imports, state, props, styles, or tests that only exist to support opening or rendering that modal.
- Remove obsolete manual modal-only UI/code paths such as modal-local title/label/markdown entry and Manual Draft handling when those paths are not used by the floating input bar.
- Preserve shared helpers, IPC contracts, shared types, Codex drafting services, and tests that still support the current agent-generated draft flow.
- Ensure the active floating ticket input bar remains the only ticket creation entry point and still creates agent-generated draft tickets from a rough idea.
- Keep the cleanup scoped to unreachable legacy modal/manual code; do not change product behavior for board ticket display, draft generation, or shared ticket helpers.

## Acceptance Criteria

- No production renderer code imports, renders, or exports `CreateTicketModal`.
- No obsolete modal-only manual title/label/markdown draft path remains reachable in the app.
- Floating ticket input creation still works and its existing tests pass or are updated to cover the current behavior.
- Shared tested helpers and shared IPC/type/service code used by the current agent-generated draft flow are preserved.
- Typecheck and relevant frontend tests pass with no unused import/export errors introduced by the cleanup.

## Test Plan

- Run the project’s standard typecheck command, for example `npm run typecheck` or the repo-equivalent script.
- Run focused frontend tests covering ticket creation/floating input behavior and any updated helper tests, for example the repo’s relevant `npm test -- ...` or `vitest` target.
- Run the full relevant test suite if focused test selection is unclear after checking package scripts.
- Search after cleanup with `rg "CreateTicketModal|Manual Draft|Create Ticket" src test` and confirm remaining hits are either current floating input copy or intentionally retained shared behavior.

## Implementation Notes

- Codebase finding: Bounded research was limited: search stopped after scanning 90 candidate files and only `src/shared/ipc.ts`, `src/main/services/codex/index.ts`, and `src/shared/types.ts` were read in detail; no URLs were involved.
- Codebase finding: `src/shared/types.ts` defines actor/event source types including `RelayActor` at line 38 and a `manual_board` source around line 40; these shared domain types are not modal-specific and should not be removed as part of this cleanup without separate evidence they are unused.
- Codebase finding: `src/shared/ipc.ts` defines the shared IPC contract symbols `RelayIpcContract`, `RelayIpcChannel`, `RelayIpcArgs`, `RelayIpcResult`, and `relayIpcChannels`; matched ticket/codex run result imports around lines 8-9 are shared infrastructure, not legacy modal UI.
- Codebase finding: `src/main/services/codex/index.ts` imports Codex SDK types at line 2 and shared Codex result types around line 8; this is part of the agent-generated draft path and should be preserved.
- Codebase finding: Related completed ticket `tkt_01krf8t7j1vg54c53wfhjsa30t` established the current product direction: the Create Ticket modal was replaced by a persistent bottom-center floating input bar for drafting tickets from rough ideas.
- Implementation: Delete the `CreateTicketModal` component file(s) and remove all direct imports/usages from the renderer entry points that previously opened the modal.
- Implementation: Remove renderer state, callbacks, props, CSS, and copy that were only needed for the legacy modal or manual draft fields, while leaving the floating input bar wiring intact.
- Implementation: Delete or update modal-specific tests/snapshots so they no longer reference `CreateTicketModal` or manual modal fields; retain or adjust tests for shared helpers that are still used by current ticket creation.
- Implementation: Run the existing typecheck/lint/test commands and fix any dangling imports, unused exports, or unreachable test references caused by the deletion.
- Implementation: Verify by repository search that `CreateTicketModal`, legacy Create Ticket modal open handlers, and modal-only Manual Draft UI strings no longer appear outside historical ticket text or intentional documentation.
- The bounded research did not surface exact `CreateTicketModal` file paths because scanning stopped early; the implementation agent should use repository search only to locate the already-named component/imports before making the concrete deletions above.
- Do not delete shared Codex drafting or IPC contract code merely because it contains generic terms like manual, path, code, or shared.

## Codex Handoff

### 5/13/2026, 1:42:35 AM

Summary of changes made:
- Removed the legacy `CreateTicketModal` implementation from [App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx).
- Pruned modal-only manual draft imports, helper types, title/label/manual draft handling, generated-draft editor remnants, and CSS selectors.
- Updated keyboard shortcut test wording to reflect focusing the floating composer instead of opening a modal.
- Preserved the floating ticket composer and shared draft/intake components.

Files changed by this work:
- [App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx)
- [styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css)
- [keyboard-shortcuts.test.ts](/Users/robertpitt/Projects/relay/tests/keyboard-shortcuts.test.ts)

Commands run:
- `grep -RIn "CreateTicketModal|Manual Draft|Create Ticket|manual draft|create ticket" src test tests`
- `find ...` fallback searches because `rg` is not installed
- `npm run typecheck`
- `node tests/run-tests.mjs tests/ticket-draft-ui.test.tsx tests/keyboard-shortcuts.test.ts tests/create-ticket-mention-layout.test.ts`
- Final search: `grep -RIn "CreateTicketModal|Manual Draft|Create Ticket" src tests`

Tests run and results:
- `npm run typecheck`: passed.
- `node tests/run-tests.mjs ...`: passed, 154 tests. The runner emitted an existing esbuild warning about `import.meta` with CJS output.
- Final legacy search found no `CreateTicketModal` or `Manual Draft`; the only `Create Ticket` hit is an assertion that the floating composer does not render old modal chrome.

Subagent usage: none used.

Remaining risks or follow-up:
- The working tree already contains unrelated `.relay` generated/state changes and pre-existing edits in `tests/ticket-draft-ui.test.tsx`; I left them untouched.


No Codex run has been started.
