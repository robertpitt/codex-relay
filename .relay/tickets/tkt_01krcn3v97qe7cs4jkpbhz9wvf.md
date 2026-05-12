---
schemaVersion: 1
id: tkt_01krcn3v97qe7cs4jkpbhz9wvf
title: Fix missing active agent runtime on In Progress ticket cards
ticketType: task
status: review
position: 2000
priority: high
labels:
  - frontend
  - agent-progress
  - board
  - bug
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-11T23:14:20.071Z'
updatedAt: '2026-05-12T00:14:05.930Z'
codexThreadId: 019e195e-f7f8-78c2-9e33-472afeb0f464
runStatus: completed
lastRunId: run_01krcrb7vkbvfjsm0f723kqkpj
lastRunStartedAt: '2026-05-12T00:10:48.273Z'
---
# Fix missing active agent runtime on In Progress ticket cards

## Context

The active agent runtime label was implemented for In Progress swim lane cards, but review feedback reports that the elapsed time still does not appear on the card in the swimlane. Treat this ticket as a follow-up bug fix on the completed implementation: preserve the existing persisted `lastRunStartedAt` approach, keep the existing run status pill visible, and make the elapsed runtime reliably visible on active In Progress cards.

## Review Feedback

- User report: "You implemented this but the time the agent has been working doesn't show in the card in the swimlane"
- The fix should focus on why the elapsed label is not rendered or not visible in the board card UI despite the prior implementation.
- Do not remove the existing implementation unless investigation proves a narrower correction is insufficient.

## Codebase Findings

- `src/renderer/src/App.tsx:439-559` renders the board columns and ticket cards. `DroppableColumn` maps tickets to `DraggableCard`; `DraggableCard` computes `showRunStatus` at line 513 and renders card metadata plus `TicketRunStatusPill` at lines 528-544.
- `src/renderer/src/App.tsx:202-208` exports `TicketRunStatusPill`, which originally rendered only the run-status text/spinner and had no elapsed-time input.
- `src/renderer/src/App.tsx:562-730` defines `BoardView`, which orders tickets by column/status and passes each ticket into `DroppableColumn`; this is where any board-level timer and `now` prop must remain wired through to visible cards.
- `src/renderer/src/App.tsx:2657-2667` listens for renderer run events and refreshes the board. `run.started` must trigger a board refresh so cards pick up the persisted `lastRunStartedAt` promptly.
- `src/shared/types.ts:112-140` defines `TicketFrontMatter` and `TicketSummary`. Tickets should expose `lastRunStartedAt` along with `runStatus` and `lastRunId`.
- `src/main/services/schemas.ts:195-212` defines `ticketFrontMatterSchema`; `lastRunStartedAt` should have a nullable default so older tickets parse cleanly.
- `src/main/services/storage/index.ts:715-731` initializes new ticket frontmatter; `lastRunStartedAt` should initialize as `null`.
- `src/main/services/codex/index.ts:1763-1777` starts implementation runs by selecting the `in_progress` status, setting `runStatus: "running"`, and setting `lastRunId`; this is where `lastRunStartedAt` should be persisted.
- `src/renderer/src/lib/agentProgress.ts:40-49` already defines active session status semantics and `formatElapsedDuration`, which formats `mm:ss` and `h:mm:ss`.
- `src/renderer/src/styles.css:868-902` defines the existing card metadata row and pill styles for `.priority`, `.run-pill`, `.ticket-type-pill`, `.ticket-blocker-pill`, and labels; the elapsed label should use these conventions and must not be hidden by layout/CSS.
- `tests/ticket-draft-ui.test.tsx:4-11` imports exported UI helpers from `App.tsx` and verifies `TicketRunStatusPill`, making it a suitable place or pattern for card elapsed-label rendering tests.
- `tests/backend.test.ts:689-725` and `tests/backend.test.ts:920-973` contain fake-Codex implementation run flows that can assert persisted run-start metadata during active runs.

## Requirements

- Diagnose why the elapsed runtime label is not appearing on the board card after the prior implementation.
- Ensure a compact elapsed-time label is visible on ticket cards whose `status` is the In Progress lane id (`RELAY_IN_PROGRESS_STATUS` / `in_progress`) and whose `runStatus` is exactly `running`.
- Keep the existing `TicketRunStatusPill` visible; the elapsed label should appear alongside it in the card metadata row.
- Persist and read `lastRunStartedAt: string | null` so the board can show elapsed runtime after reloads or app restarts while a ticket remains marked running.
- Update the elapsed label once per second while at least one visible board ticket has an active elapsed label.
- Use `formatElapsedDuration` for display formatting, producing values such as `00:05`, `01:05`, and `1:01:01`.
- Hide the elapsed label when the start timestamp is missing or invalid rather than showing `Unavailable` on board cards.
- Do not show the elapsed label for queued, drafting, blocked, failed, completed, cancelled, idle, or non-In Progress tickets.
- Refresh the board when a `run.started` event is received so cards pick up the new persisted `lastRunStartedAt` promptly.
- Verify the CSS/layout path so `.run-elapsed-pill` is not rendered off-screen, clipped, transparent, hidden by selector specificity, or omitted from the metadata row.

## Investigation Checklist

- Confirm the active ticket frontmatter actually contains a parseable `lastRunStartedAt` while `runStatus` is `running`.
- Confirm `TicketSummary` data returned to the renderer includes `lastRunStartedAt` after schema parsing and board loading.
- Confirm `run.started` refreshes the board and that the visible card receives the refreshed ticket summary.
- Confirm the elapsed-label helper returns a non-null value for the reported ticket state.
- Confirm `BoardView` starts the one-second timer when the active ticket is visible.
- Confirm `DroppableColumn` passes the current `now` value through to `DraggableCard`.
- Confirm `DraggableCard` renders the elapsed pill in the same metadata row as the run status pill.
- Confirm styles make the elapsed pill visible in the actual swimlane card, not only in isolated tests.

## Implementation Plan

- Reproduce or reason through the board-card render path for an active In Progress running ticket with `lastRunStartedAt` set.
- Inspect the prior implementation for likely disconnects between backend persistence, board summary typing/schema, board refresh, timer state, prop plumbing, helper gating, and CSS visibility.
- Patch the smallest failing link so active In Progress cards render the elapsed label reliably.
- Keep `TicketRunStatusPill` behavior unchanged except for sharing space with the elapsed pill.
- Add or adjust focused UI tests so they render the actual card path, not only a helper, and fail if the elapsed pill is absent from an In Progress running card.
- Add or keep backend coverage asserting that starting an implementation run sets a parseable `frontMatter.lastRunStartedAt` while preserving existing run status behavior.
- If the issue is CSS-only, add a regression test or DOM assertion that still checks the elapsed pill exists and has the expected accessible label/text.

## Test Plan

- Run `npm run typecheck` to validate shared type, schema, renderer, and backend changes.
- Run `npm test` to execute the bundled Node/React/backend test suite.
- Add or update UI coverage asserting elapsed label visibility for `status: "in_progress"` + `runStatus: "running"` with a fixed `now`.
- Add or update absence coverage for running tickets outside In Progress and non-running In Progress tickets.
- Add or preserve backend coverage asserting `lastRunStartedAt` is set when a Codex implementation run starts and defaults to `null` for newly created or legacy-parsed tickets.
- Perform a manual UI check of the board swimlane if feasible, because the reported failure is visual/board-specific.

## Acceptance Criteria

- An In Progress ticket card with `runStatus: "running"` and `lastRunStartedAt` 65 seconds before the current board timer visibly shows a compact elapsed label of `01:05` alongside the existing Running pill.
- The elapsed label is visible in the actual board swimlane card UI, not only in helper output or tests.
- The elapsed label increments without a board reload while the ticket remains visible and active.
- Tickets in any lane other than In Progress do not show the elapsed label, even if `runStatus` is `running`.
- In Progress tickets with `runStatus` values other than `running` do not show the elapsed label.
- Missing or invalid `lastRunStartedAt` values do not render a broken or `Unavailable` label on the card.
- Starting a Codex implementation run persists `lastRunStartedAt` and triggers a board refresh on `run.started`.
- Existing run progress summary behavior in `AgentActivityPanel` remains unchanged.
- `npm run typecheck` and `npm test` pass.

## Assumptions / Open Questions

- Agent active means an implementation Codex run with `runStatus === "running"`; queued runs, draft generation, blocked clarification states, and ticket-update agents are out of scope for this board-card label.
- The In Progress swim lane should be identified by the stable status id `in_progress` / `RELAY_IN_PROGRESS_STATUS`, not by the displayed column name.
- Persisting `lastRunStartedAt` in ticket frontmatter remains the intended approach and avoids relying on renderer-only live events that disappear after reload.
- No schema version bump is required because the ticket frontmatter schema can provide a nullable default for older tickets.
- When the timestamp is unavailable, the current Running pill is sufficient fallback.

## Implementation Notes

- No URLs were present in the idea; research was limited to the local Relay codebase.
- `rg` was unavailable in the shell during the original research, so source references were gathered with `grep` and line-numbered reads.
- The original bounded research stopped after scanning 160 candidate files, but the relevant board rendering, run state, schema, and test entry points were located.

## Research Metadata

- File inspected: src/renderer/src/lib/agentProgress.ts - Matched terms: time, agent, running, label, progress; characters read: 8306; symbols: AgentProgressStatus, AgentProgressMetrics, AgentProgressInput, pad2, timestampMs, parsed
  Matched lines:
  - 3: export type AgentProgressStatus = RunStatus;
  - 5: export type AgentProgressMetrics = {
  - 7: elapsedLabel: string;
- File inspected: src/renderer/src/components/AgentActivity.tsx - Matched terms: time, agent, been, running, label, progress; characters read: 11712; symbols: CopyHandlers, AgentProgressSummaryProps, useProgressNow, interval, formatTimestamp, metricValue
  Matched lines:
  - 9: agentEventLabel,
  - 10: agentEventText,
  - 11: agentEventTone,
- File inspected: tests/agent-progress.test.tsx - Matched terms: time, agent, running, label, progress; characters read: 7157; symbols: baseEvent, event, events, progress, markup, loadingMarkup
  Matched lines:
  - 4: import { AgentActivityPanel, AgentLogViewer, AgentProgressSummary } from "../src/renderer/src/components/AgentActivity";
  - 5: import { deriveAgentProgress, formatElapsedDuration } from "../src/renderer/src/lib/agentProgress";
  - 14: const event = (patch: Partial<RendererRunEvent> & { type: RendererRunEvent["type"]; timestamp: string }): RendererRunEvent =>
- File inspected: src/shared/types.ts - Matched terms: time, agent, running, label, progress, swim; characters read: 12000; symbols: RELAY_SCHEMA_VERSION, RELAY_TODO_STATUS, RELAY_READY_STATUS, RELAY_IN_PROGRESS_STATUS, RELAY_NEEDS_CLARIFICATION_STATUS, RELAY_REVIEW_STATUS
  Matched lines:
  - 4: export const RELAY_IN_PROGRESS_STATUS = "in_progress";
  - 13: { id: RELAY_IN_PROGRESS_STATUS, name: "In Progress", position: 3000, terminal: false },
  - 28: | "running"
- File inspected: src/renderer/src/App.tsx - Matched terms: agent, been, running, label, progress, swim; characters read: 12000; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast, LocalAgentProgress, ActiveTicketReferenceMention
  Matched lines:
  - 50: resolvedBlockerLabel,
  - 51: ticketBlockerOptionLabel,
  - 52: ticketContextLabel
- File inspected: tests/backend.test.ts - Matched terms: time, agent, label, progress; characters read: 12000; symbols: CodexRunDependencies, CreateCodexDependencies, CodexCliCandidate, createProject, projectPath, auditEvents
  Matched lines:
  - 19: import { BackendClock, runBackendEffect } from "../src/main/services/runtime";
  - 81: const waitFor = async (predicate: () => boolean, label: string): Promise<void> => {
  - 85: await new Promise((resolve) => setTimeout(resolve, 5));
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

### 5/12/2026, 1:14:05 AM

**Summary**
Diagnosed the board path: active ticket frontmatter and `TicketSummary` do include `lastRunStartedAt`, so the weak spot was the actual card UI path and visibility. I extracted the card body into `TicketCardContent`, used it from `DraggableCard`, and added regression coverage that renders that same metadata row with both `Running` and `01:05`.

I also made `.run-elapsed-pill` use the same active-run warning styling as the Running pill, with `nowrap` and fixed flex sizing so it remains visible in the swimlane card.

**Files Changed**
- [src/renderer/src/App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx)
- [src/renderer/src/styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css)
- [tests/ticket-draft-ui.test.tsx](/Users/robertpitt/Projects/relay/tests/ticket-draft-ui.test.tsx)

**Commands Run**
- `grep`, `sed`, `nl` inspections
- `git status --short`
- `npm run typecheck`
- `npm test`

**Tests Run**
- `npm run typecheck`: passed.
- `npm test`: passed, 109/109 tests. Existing esbuild `import.meta` CJS warning still appears.

**Remaining Risks / Follow-Up**
- I did not launch Electron for a manual visual check; the regression now renders the actual card content path used by the swimlane.
- The worktree contains unrelated local changes and Relay runtime artifacts; I left them intact.


### 5/12/2026, 12:35:10 AM

**Summary**
Implemented the active agent runtime label for In Progress cards. Tickets now persist `lastRunStartedAt`, implementation runs set it when they become active, `run.started` refreshes the board, and the card metadata row renders a compact clock elapsed pill using `formatElapsedDuration`.

**Files Changed**
- [src/shared/types.ts](/Users/robertpitt/Projects/relay/src/shared/types.ts)
- [src/main/services/schemas.ts](/Users/robertpitt/Projects/relay/src/main/services/schemas.ts)
- [src/main/services/storage/index.ts](/Users/robertpitt/Projects/relay/src/main/services/storage/index.ts)
- [src/main/services/codex/index.ts](/Users/robertpitt/Projects/relay/src/main/services/codex/index.ts)
- [src/renderer/src/App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx)
- [src/renderer/src/styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css)
- [tests/schemas.test.ts](/Users/robertpitt/Projects/relay/tests/schemas.test.ts)
- [tests/ticket-draft-ui.test.tsx](/Users/robertpitt/Projects/relay/tests/ticket-draft-ui.test.tsx)
- [tests/backend.test.ts](/Users/robertpitt/Projects/relay/tests/backend.test.ts)

**Commands Run**
- Source inspection with `sed`, `nl`, `grep`, and `git status --short`
- `npm run typecheck`
- `npm test`

**Tests Run**
- `npm run typecheck`: passed.
- `npm test`: passed, 97/97 tests. The suite still prints the existing esbuild `import.meta` CJS warning from `src/main/services/codex/cli.ts`.

**Remaining Risks / Follow-Up**
- I did not launch the Electron UI for a visual check; coverage is through typecheck and React/backend tests.
- The worktree already contains unrelated local changes and Relay runtime artifacts; I left them intact.

### 5/12/2026 Review Feedback

**User Report**
The implementation did not satisfy the visible board behavior: the time the agent has been working does not show in the card in the swimlane.

**Next Handoff Guidance**
Start by tracing the actual board card render path with a running In Progress ticket. Prioritize gaps between persisted `lastRunStartedAt`, board summary data, timer/prop wiring, `activeRunElapsedLabel` gating, and `.run-elapsed-pill` visibility in the real card layout. Add a regression test that exercises the card rendering path closely enough to fail when the elapsed pill is missing from an active In Progress swimlane card.
