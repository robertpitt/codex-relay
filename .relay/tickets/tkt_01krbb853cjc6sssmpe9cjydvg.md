---
schemaVersion: 1
id: tkt_01krbb853cjc6sssmpe9cjydvg
title: Add Agent-Assisted Ticket Update Input
status: completed
position: 21000
priority: medium
labels:
  - feature
  - agent
  - tickets
  - renderer
createdAt: '2026-05-11T11:02:41.004Z'
updatedAt: '2026-05-11T12:24:10.964Z'
codexThreadId: 019e16f4-6e9e-7f83-b86e-88e675a53e92
runStatus: completed
lastRunId: run_01krbf8vgjbpt6qha1nb2feht5
---
# Add Agent-Assisted Ticket Update Input

## Context

When a user is viewing a Relay ticket, they should be able to enter a short change request or additional information and ask an agent to update the ticket. The feature should revise the ticket content in-place, using the existing ticket data plus the user's new request, without starting an implementation run against the workspace.

## Research Findings

- README.md describes Relay as a local-first Electron/React/TypeScript desktop app for managing software work as kanban cards and running Codex against those cards; board state is stored in each project's `.relay/` directory.
- SPEC.md frames Relay's primary surface as a project board rather than a chat list and defines Codex-facing concepts such as `RelayCodexInput`, `RelayCodexThreadOptions`, `RelayCodexRunOptions`, `RelayCodexEvent`, and `CodexClient`, which should guide any new agent workflow.
- src/shared/types.ts defines shared domain types including `TicketPriority`, `RunStatus`, `DEFAULT_COLUMNS`, and renderer/main shared event shapes; new ticket-update state should reuse these existing shared types where possible.
- src/renderer/src/lib/agentProgress.ts contains `deriveAgentProgress`, `AgentProgressStatus`, `AgentProgressMetrics`, and helpers for interpreting renderer run events; this can likely be reused to display ticket-update agent progress.
- src/renderer/src/components/AgentActivity.tsx provides existing UI components such as `AgentProgressSummary`, `AgentActivityPanel`, and `AgentLogViewer` for agent status/log display.
- tests/agent-progress.test.tsx already covers agent progress derivation and activity UI, providing a reference point for tests around any added ticket-update run state.

## Requirements

- Add a visible input area to the ticket detail/viewing experience where the user can type requested changes or additional information for the current ticket.
- Provide an explicit submit action that sends the current ticket content plus the user's change request to an agent workflow dedicated to updating the ticket text/fields.
- The agent must return a structured ticket update, not free-form UI text, and the app must validate the response before applying it.
- Only allowed ticket fields should be updated, such as title, context/body, requirements, implementation plan, acceptance criteria, labels, priority, or clarification questions, depending on the existing ticket schema.
- Persist the updated ticket through the existing local project `.relay/` storage path used by Relay, preserving unrelated ticket metadata such as id, column, timestamps, and run history unless intentionally changed.
- Show progress, completion, cancellation, and failure states using the existing agent activity/progress patterns where appropriate.
- Disable duplicate submissions while a ticket-update agent run is active for the same ticket.
- If the agent fails or returns invalid output, keep the original ticket unchanged and show a clear recoverable error.
- After a successful update, clear the input and refresh the ticket detail view with the new ticket content.

## Implementation Plan

- Locate the existing ticket detail/view component and the ticket persistence/update flow in the renderer and main/shared layers.
- Identify the canonical ticket schema in `src/shared/types.ts` and define a narrow structured response schema for agent-generated ticket updates.
- Add renderer state and UI for a ticket-update input in the ticket detail view, including submit, loading, disabled, success, and error states.
- Create or extend an IPC/main-process service that can run Codex for a ticket-editing task using the current ticket data and the user's requested change as input.
- Constrain the agent prompt so it updates the ticket only and returns validated structured data matching the ticket update schema.
- Apply the validated update through the existing ticket update/persistence mechanism, preserving fields outside the allowed update surface.
- Wire run events from the ticket-update agent workflow into existing progress/log UI utilities from `agentProgress.ts` and `AgentActivity.tsx` where they fit.
- Add focused tests for successful ticket update, invalid agent output/no mutation, failure handling, duplicate submit prevention, and persistence of unchanged metadata.
- Manually verify the flow in the Electron app by opening a ticket, submitting a change request, observing progress, and confirming the ticket content updates after completion.

## Acceptance Criteria

- A user viewing a ticket can enter a change request and submit it to an agent from the ticket detail view.
- The app sends the current ticket plus the user's request to an agent workflow and applies the returned structured update to the same ticket.
- The updated ticket is persisted locally and remains updated after reloading the project/app.
- The UI shows an in-progress state while the agent is running and prevents duplicate submissions for the same ticket during that run.
- If the agent fails, is cancelled, or returns invalid data, the ticket remains unchanged and the user sees an actionable error state.
- Existing implementation-run behavior for tickets continues to work unchanged.
- Automated tests cover the core update path and at least one failure/invalid-output path.

## Clarification Questions

- Should the agent be allowed to change structured fields like priority, labels, and acceptance criteria, or only append/rewrite the ticket description?
- Should each agent-assisted ticket edit be stored in ticket history/audit metadata, if Relay currently supports that pattern?
- Should the user be shown a preview/diff before applying the agent's update, or should successful agent output apply immediately?

## Implementation Notes

- The user idea contains typos, but the intended workflow is clear: add an input on the ticket view where a user can request changes and have an agent update the ticket.
- Research did not include the exact ticket detail component or storage implementation, so the first implementation step must identify the concrete files that own ticket viewing and persistence.
- Treat this as a ticket-editing agent workflow, distinct from the existing workflow that runs Codex to implement a ticket in the workspace.

## Research Metadata

- File inspected: src/renderer/src/lib/agentProgress.ts - Matched terms: able, type, input, tot, agent; characters read: 8005; symbols: AgentProgressStatus, AgentProgressMetrics, AgentProgressInput, pad2, timestampMs, parsed
- File inspected: src/shared/types.ts - Matched terms: implement, able, type, input, agent; characters read: 10330; symbols: RELAY_SCHEMA_VERSION, DEFAULT_COLUMNS, TicketPriority, RunStatus, ProjectHealth, ThemePreference
- File inspected: src/renderer/src/components/AgentActivity.tsx - Matched terms: able, type, tot, agent; characters read: 8279; symbols: CopyHandlers, AgentProgressSummaryProps, useProgressNow, interval, formatTimestamp, metricValue
- File inspected: SPEC.md - Matched terms: want, implement, able, type, input, changes, agent; characters read: 12000; symbols: RelayCodexInput, RelayCodexThreadOptions, RelayCodexRunOptions, RelayCodexEvent, CodexClient, and
- File inspected: tests/agent-progress.test.tsx - Matched terms: able, type, agent; characters read: 4861; symbols: baseEvent, event, events, progress, markup, loadingMarkup
- File inspected: README.md - Matched terms: want, implement, able, type, input, changes, agent; characters read: 8905

## Codex Handoff

### 5/11/2026, 1:24:10 PM

**Summary**
Implemented agent-assisted ticket updates from the ticket detail panel. The new workflow runs Codex in read-only mode, asks for a strict structured ticket update, validates it, applies only allowed fields, persists through existing `.relay` ticket storage, and leaves implementation-run metadata alone. The UI now shows update progress/logs, prevents duplicate active submissions, supports cancellation, clears the request on success, and shows recoverable errors on failure or invalid output.

**Files Changed**
- [src/shared/types.ts](/Users/robertpitt/Projects/relay/src/shared/types.ts)
- [src/main/services/schemas.ts](/Users/robertpitt/Projects/relay/src/main/services/schemas.ts)
- [src/main/services/codex.ts](/Users/robertpitt/Projects/relay/src/main/services/codex.ts)
- [src/main/index.ts](/Users/robertpitt/Projects/relay/src/main/index.ts)
- [src/preload/index.ts](/Users/robertpitt/Projects/relay/src/preload/index.ts)
- [src/renderer/src/App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx)
- [src/renderer/src/styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css)
- [tests/ticket-update.test.ts](/Users/robertpitt/Projects/relay/tests/ticket-update.test.ts)
- [tests/run-tests.mjs](/Users/robertpitt/Projects/relay/tests/run-tests.mjs)

Pre-existing `.relay/` worktree changes were present before I started and were left alone.

**Commands Run**
- Code inspection: `find`, `grep`, `sed`, `git status --short`, `git diff`
- Verification: `npm run typecheck`, `npm test`, `npm run build`
- Cleanup checks: `git diff --check`, `git status --short`

**Tests Run**
- `npm run typecheck`: passed
- `npm test`: passed, 45/45 tests
- `npm run build`: passed, Electron/Vite production bundles built

**Remaining Risks**
I did not run a live interactive Electron/Codex update against a real Codex session; the workflow is covered with mocked Codex stream tests plus typecheck and production build verification.


No Codex run has been started.
