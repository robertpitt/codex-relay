---
schemaVersion: 1
id: tkt_01krcm5g06h6mh8wfv1h57pa9x
title: Add Ready Queue and Single-Thread Codex Run Scheduler
ticketType: task
status: completed
position: 42000
priority: high
labels:
  - codex
  - workflow
  - backend
  - effect
  - queue
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-11T22:57:45.478Z'
updatedAt: '2026-05-11T23:31:19.873Z'
codexThreadId: 019e194c-4788-7e71-af5d-cf6cfab21827
runStatus: completed
lastRunId: run_01krcmrhpbqz26z64qny9wz5bh
---
# Add Ready Queue and Single-Thread Codex Run Scheduler

## Context

Introduce a Ready swimlane and a durable main-thread execution queue so users can schedule multiple Codex implementation tasks while Relay runs only one code-editing agent at a time by default. Ready is the queue lane; In Progress should represent the ticket currently being executed. The default concurrency is 1 to prevent multiple agents editing the same branch/worktree at once, while leaving a project setting that can support future worktree-based parallelism.

## Codebase Findings

- src/shared/types.ts:1-16 defines workflow status constants and DEFAULT_COLUMNS. Current defaults include Todo, In Progress, Needs Clarification, Review, Not Doing, and Completed; there is no Ready status constant or column.
- src/shared/types.ts:20-29 defines RunStatus without a queued state, so queued work currently cannot be represented distinctly from idle/running/drafting.
- src/shared/types.ts:48-55 defines ProjectSettings with Codex execution toggles and defaults, but no concurrency setting.
- src/main/services/schemas.ts:135-145 mirrors RunStatus literals, and src/main/services/schemas.ts:165-172 validates ProjectSettings without defaults for a new concurrency field.
- src/main/services/storage/index.ts:90-110 normalizes legacy project columns by adding missing DEFAULT_COLUMNS; it currently special-cases Review placement between Needs Clarification and terminal lanes, so Ready needs similar placement between Todo and In Progress.
- src/main/services/storage/index.ts:147-170 initializes new projects with DEFAULT_COLUMNS, and src/main/services/storage/index.ts:173-181 normalizes project configs when read.
- src/main/services/storage/index.ts:691-720 creates new tickets in Todo by default, validates status against project columns, and initializes runStatus as idle.
- src/main/services/storage/index.ts:948-991 transitionTicketStatus validates target columns, recalculates position, writes ticket status, and appends ticket.status_changed audit events. This is the right primitive for queue lane transitions.
- src/main/services/codex/index.ts:70-87 tracks active implementation runs in an in-memory activeRuns map and only offers activeRunIdForTicket; there is no project-level/global concurrency guard.
- src/main/services/codex/index.ts:1476-1582 preflightCodexRun blocks invalid ticket states, active blockers, open clarifications, active runs on the same ticket, drafting, and stale running state, but does not consider a Ready/queued state or project concurrency.
- src/main/services/codex/index.ts:1584-1835 beginRunPromise currently starts the Codex SDK stream immediately, sets runStatus running, transitions the ticket to In Progress at lines 1618-1647, and only releases activeRuns in the background finally block at lines 1829-1831.
- src/main/services/codex/index.ts:1741-1815 handles run completion by moving clarification-blocked runs to Needs Clarification and successful runs to Review; this should be followed by starting the next Ready ticket.
- src/renderer/src/App.tsx:1786-1806 calls codex.preflightRun and then codex.startRun/resumeRun directly, expecting a runId immediately and showing a started toast. The UI needs to handle a queued result distinctly.
- src/renderer/src/App.tsx:2021-2035 renders Start Codex, Resume Codex, Start Fresh Thread, and Stop buttons; queued tickets need a Queued status pill and Stop must be available before the SDK stream starts.
- src/main/ipc/methods/tickets.ts:134-137 routes ticket:move directly to moveTicket. A manual move into Ready should wake the queue, and a manual move out of Ready should clear queued state if the run has not started.
- src/shared/ipc.ts:54-61 and src/preload/index.ts:55-65 expose Promise-based Codex IPC methods. The queue implementation must keep Effect types out of shared/preload contracts.
- src/main/services/run-events/index.ts:124-141 treats idle/running/drafting as active and derives terminal summaries from run.completed, clarification.requested, and run.failed. Queued status needs summary handling that does not mark a run terminal before run.started.
- docs/backend-effect-v4-audit.md:80-88 states backend Effect work should keep public APIs Promise-based, preserve AbortSignal behavior, preserve run logs/audit events/shared contracts, and run npm run typecheck plus npm test for Codex/storage changes.
- package.json:21-28 pins effect to 4.0.0-beta.65, so the implementation can use Effect v4 primitives already in the project.
- .effect/packages/effect/src/Queue.ts:336-383 documents Queue.make/bounded and backpressure; .effect/packages/effect/src/Queue.ts:483-513 exposes Queue.unbounded and Queue.offer; .effect/packages/effect/src/Queue.ts:1197-1200 exposes Queue.take for a wake/drain loop.
- .effect/packages/effect/src/Semaphore.ts:28-58 defines Semaphore.withPermits/withPermit for permit-based concurrency, and .effect/packages/effect/src/Semaphore.ts:76-80 documents FIFO handling for pending permit acquisition.
- .effect/packages/effect/src/Effect.ts:4007-4021 exposes Effect.retry, while .effect/packages/effect/src/Schedule.ts:1962-1970 exposes Schedule.exponential and .effect/packages/effect/src/Schedule.ts:2404-2405 exposes Schedule.recurs for bounded scheduler retry policies.
- Inspected src/renderer/src/lib/agentProgress.ts (Matched terms: agent, default; symbols: AgentProgressStatus, AgentProgressMetrics, AgentProgressInput, pad2).
- Inspected src/renderer/src/components/AgentActivity.tsx (Matched terms: agent, default; symbols: CopyHandlers, AgentProgressSummaryProps, useProgressNow, interval).
- Inspected src/main/services/schemas.ts (Matched terms: agent, default; symbols: RelaySchema, nonEmptyString, numberSchema, unknownRecordSchema).
- Inspected tests/agent-progress.test.tsx (Matched terms: agent; symbols: baseEvent, event, events, progress).
- Inspected src/renderer/src/App.tsx (Matched terms: controls, agent, default; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast).
- Inspected src/main/services/codex/index.ts (Matched terms: like, agent, default; symbols: CodexOptions, Thread, ThreadEvent, ThreadItem).
- Research limitation: Code search stopped after scanning 160 candidate files.

## Requirements

- Add a non-terminal Ready swimlane with id ready, name Ready, and default position between Todo and In Progress. New projects and legacy project configs must both show Ready without requiring manual migration.
- Add a queued RunStatus and render it in the ticket run pill as Queued.
- Add a ProjectSettings field agentConcurrency with default 1, schema validation requiring an integer >= 1, and legacy config decoding that defaults missing values to 1. Do not add a settings UI in this ticket.
- Change Codex implementation run start/resume behavior from immediate SDK execution to enqueue-then-drain: a successful Start/Resume request moves the ticket to Ready, sets runStatus queued, records lastRunId, returns immediately, and wakes the scheduler.
- Keep In Progress reserved for the ticket currently being executed by the scheduler. Queued tickets remain in Ready until a concurrency permit is available.
- Use per-project scheduling with default concurrency 1. The scheduler must never run more than agentConcurrency implementation runs for the same project path at once.
- Select the next queued ticket from Ready by ascending ticket position so board ordering controls execution order.
- When a queued ticket begins execution, transition it to In Progress, set runStatus running, and use the queued runId for emitted run events and persisted run logs.
- When an implementation run completes, fails, blocks on clarification, or is cancelled, release the project permit and start the next Ready/queued ticket if one exists.
- Preflight must reject tickets that are already queued, running, drafting, terminal, epics, actively blocked, or have unanswered clarifications. Queue worker startup preflight may allow the same ticket's queued state for its own stored runId.
- Queued cancellation through codex.cancelRun(runId) must remove the ticket from the queue before SDK startup, set runStatus back to idle, clear lastRunId, and move it back to Todo when Todo exists.
- Running cancellation must keep existing AbortController behavior and, after cleanup, allow the scheduler to continue with the next Ready ticket.
- Manual drag/drop or status edits into Ready must enqueue/wake the scheduler. Manual moves out of Ready before a run starts must clear queued state for that ticket.
- Do not automatically retry full Codex execution after an agent failure. Retry only safe scheduler bookkeeping/drain operations, if needed, with a small bounded Effect.retry/Schedule policy.
- Keep renderer/shared IPC contracts Promise-based; Effect Queue/Semaphore/Schedule types must remain backend internals only.
- Ticket drafting and Agent Ticket Update runs are out of scope for this scheduler because they do not execute code edits in the workspace.

## Implementation Plan

- Update shared workflow contracts in src/shared/types.ts: add RELAY_READY_STATUS, insert Ready into DEFAULT_COLUMNS between Todo and In Progress, add queued to RunStatus, add ProjectSettings.agentConcurrency, and extend CodexRunStartResult with state: "queued" | "started" plus nullable threadId for queued responses.
- Update schemas in src/main/services/schemas.ts: add queued to runStatusSchema, add an integer >= 1 agentConcurrency schema with a decoding default of 1 for legacy project configs, and keep startRunInputSchema passthrough-compatible.
- Update storage defaults and normalization in src/main/services/storage/index.ts: include agentConcurrency: 1 in defaultSettings, normalize missing Ready with position between Todo and In Progress, keep existing Review normalization behavior, include queued in isSidebarActiveRunStatus, and ensure readBoard returns Ready in sorted columns.
- Add queued-state helpers in storage or codex-owned helpers: setTicketQueued(projectPath, ticketId, runId), clearQueuedTicket(projectPath, ticketId, targetStatus), and listQueuedReadyTickets(projectPath) using readBoard/readTicket/writeTicket/transitionTicketStatus rather than duplicating status-position logic.
- Refactor src/main/services/codex/index.ts so the existing beginRunPromise becomes an internal startQueuedRunNow(input, resume, runId, dependencies) path that accepts a preallocated runId and can bypass the public queued-state rejection for that same run.
- Add a per-project Codex execution scheduler in src/main/services/codex/index.ts or a new src/main/services/codex/queue.ts module. Use Effect Queue as a wake signal, Semaphore or equivalent permit accounting for agentConcurrency, and a drain loop that reads Ready/queued tickets from storage before starting work.
- Change exported startCodexRun and resumeCodexRun to preflight, allocate runId, mark the ticket queued in Ready, store any in-memory resume/freshThread/dependency intent for that runId, wake the project scheduler, and return { state: "queued", runId, threadId: null }.
- In the scheduler drain, compute active implementation runs for the project from activeRuns, read config.settings.agentConcurrency, start up to the remaining permit count, and preserve FIFO-by-position Ready ordering.
- After every terminal path in startQueuedRunNow, including run.completed, clarification.requested, run.failed, startup failure, and abort handling, delete activeRuns as today and wake the project scheduler again for the same project path.
- Extend cancelCodexRun to handle queued runIds before active runIds. Queued cancellation should clear in-memory queue intent, update the ticket to idle, move it back to Todo when available, and emit no SDK run events because no SDK thread exists yet.
- Wire queue wake-up points through IPC: codex start/resume already wakes; ticket:move and ticket:save should wake when the final ticket status is Ready and should clear queued state when a queued ticket is moved away from Ready before running.
- Update renderer UI in src/renderer/src/App.tsx: add Queued label in runLabel/TicketRunStatusPill, show queued toast for queued start responses, keep setRunId(result.runId), show Stop when runStatus is queued or running, and disable Start/Resume while queued.
- Update src/renderer/src/lib/agentProgress.ts and run summary handling only as needed so queued tickets without run.started do not appear failed or terminal; once the scheduler starts the SDK run, existing run.started/run.completed behavior should drive logs.
- Update tests for changed contracts and workflow behavior in tests/schemas.test.ts, tests/backend.test.ts, tests/project-sidebar.test.tsx, and any renderer tests affected by the queued label/result shape.
- Run final verification with npm run typecheck and npm test.

## Test Plan

- Add schema tests proving legacy project settings without agentConcurrency decode to 1, agentConcurrency 0/non-integer values are rejected, and queued is accepted as a RunStatus.
- Add backend storage tests proving new projects and legacy configs include columns in order: todo, ready, in_progress, needs_clarification, review, not_doing, completed.
- Update the existing project summary test in tests/backend.test.ts:482-524 so Ready appears with counts and queued tickets contribute to activeRunCount if the implementation chooses to display queued work there.
- Add a scheduler test with two fake Codex runs: start both tickets, assert both return state queued, assert both move to Ready/queued initially, assert only the first SDK stream starts while concurrency is 1, resolve the first, then assert the second transitions to In Progress/running and starts afterward.
- Add a cancellation test where a second queued run is cancelled while the first is running; assert the second returns to Todo/idle with lastRunId cleared and its fake SDK client is never invoked.
- Add a completion-chain test asserting completed first run moves to Review, releases the permit, and starts the next Ready ticket without another user action.
- Add preflight tests asserting queued tickets cannot be enqueued a second time and stale running behavior remains blocked as currently covered around tests/backend.test.ts:814-829.
- Add a manual Ready lane test through ticket.move or ticket.save proving moving an idle ticket into Ready sets queued state and wakes the scheduler, and moving it out before start clears queued state.
- Run npm run typecheck.
- Run npm test.

## Acceptance Criteria

- A fresh Relay project shows a Ready column between Todo and In Progress; legacy project configs also show Ready after normalization.
- Starting or resuming Codex on an eligible task returns immediately, places the ticket in Ready with runStatus queued, and does not start more than one implementation run at a time by default.
- With two queued tasks and default settings, only one ticket is In Progress/running at any point; the next Ready ticket starts automatically after the prior run reaches completed, failed, blocked, or cancelled.
- Queued tickets are processed in Ready column order by ticket position.
- Cancelling a queued run prevents SDK startup for that ticket and returns it to an idle non-queued state.
- Existing run logging, renderer run events, clarification blocking, Review transition on success, and AbortController cancellation for active runs continue to work.
- Project settings persist agentConcurrency: 1 by default and legacy config files without the field still load.
- No Effect types leak into src/shared/types.ts RelayApi method signatures beyond plain TypeScript data contracts.
- npm run typecheck and npm test pass.

## Assumptions / Open Questions

- Ready is the user-visible queue lane. In Progress means actively executing, not merely scheduled.
- The default concurrency is 1 and no UI for changing concurrency is included in this ticket; the project setting is added for future worktree support and developer/config-level override only.
- The scheduler controls Codex implementation runs started from Start Codex/Resume Codex. Ticket drafting and Agent Ticket Update remain unchanged.
- Ready ticket order is controlled by existing ticket position values and drag/drop ordering.
- Full Codex execution is not automatically retried after agent failure to avoid repeated edits on the same workspace. Failed tickets remain failed for user action, and the scheduler continues to the next Ready ticket.
- If a queued ticket is cancelled and Todo exists, it returns to Todo. If Todo is unavailable in a custom workflow, it remains Ready with runStatus idle and will not restart until explicitly queued again.
- Queued resume/fresh-thread intent can be held in memory for this ticket. If the app restarts with Ready/queued tickets, the scheduler may default to resuming an existing codexThreadId unless a future persistent queue-intent store is added.

## Implementation Notes

- No external URLs were part of the idea; Effect v4 research was performed against the local .effect source tree.
- The local shell did not have rg available, so codebase research used git ls-files, grep, sed, and nl.
- Worktree creation and safe concurrency greater than 1 are explicitly out of scope; this ticket only prepares the setting and scheduler shape.
- Be careful with circular imports: ticket IPC already imports both codex and storage, so queue wake-up should live in codex exports or a small codex queue module rather than making storage import codex.
- Existing tests assume successful runs move to Review and invalid states are blocked; preserve those behaviors while adding Ready/queued expectations.

## Research Metadata

- File inspected: src/renderer/src/lib/agentProgress.ts - Matched terms: agent, default; characters read: 8306; symbols: AgentProgressStatus, AgentProgressMetrics, AgentProgressInput, pad2, timestampMs, parsed
  Matched lines:
  - 3: export type AgentProgressStatus = RunStatus;
  - 5: export type AgentProgressMetrics = {
  - 21: export type AgentProgressInput = {
- File inspected: src/renderer/src/components/AgentActivity.tsx - Matched terms: agent, default; characters read: 11712; symbols: CopyHandlers, AgentProgressSummaryProps, useProgressNow, interval, formatTimestamp, metricValue
  Matched lines:
  - 9: agentEventLabel,
  - 10: agentEventText,
  - 11: agentEventTone,
- File inspected: src/main/services/schemas.ts - Matched terms: agent, default; characters read: 12000; symbols: RelaySchema, nonEmptyString, numberSchema, unknownRecordSchema, mutableArray, withDefault
  Matched lines:
  - 5: AgentTicketUpdate,
  - 6: AgentTicketUpdateInput,
  - 50: const withDefault = <S extends Schema.Top>(schema: S, getDefault: () => S["Encoded"]) =>
- File inspected: tests/agent-progress.test.tsx - Matched terms: agent; characters read: 7157; symbols: baseEvent, event, events, progress, markup, loadingMarkup
  Matched lines:
  - 4: import { AgentActivityPanel, AgentLogViewer, AgentProgressSummary } from "../src/renderer/src/components/AgentActivity";
  - 5: import { deriveAgentProgress, formatElapsedDuration } from "../src/renderer/src/lib/agentProgress";
  - 20: test("agent progress derives elapsed time and count metrics from run events", () => {
- File inspected: src/renderer/src/App.tsx - Matched terms: controls, agent, default; characters read: 12000; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast, LocalAgentProgress, ActiveTicketReferenceMention
  Matched lines:
  - 54: import { AgentActivityPanel, AgentLogViewer, AgentProgressSummary } from "./components/AgentActivity";
  - 58: import { isAgentSessionActive, mergeRunEvents } from "./lib/agentProgress";
  - 79: type LocalAgentProgress = { status: RunStatus; startedAt: string; endedAt?: string | null };
- File inspected: src/main/services/codex/index.ts - Matched terms: like, agent, default; characters read: 12000; symbols: CodexOptions, Thread, ThreadEvent, ThreadItem, ThreadOptions, AgentTicketUpdate
  Matched lines:
  - 4: type AgentTicketUpdate,
  - 5: type AgentTicketUpdateInput,
  - 6: type AgentTicketUpdateStartResult,
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

### 5/12/2026, 12:25:20 AM

Summary of changes made:
- Added the Ready swimlane and `queued` run status across shared types, schemas, storage defaults, and legacy normalization.
- Added `ProjectSettings.agentConcurrency` with default `1` and schema validation.
- Refactored Codex Start/Resume to enqueue first, then drain through a per-project scheduler using an Effect queue and bounded scheduler retry.
- Added queued cancellation, Ready-lane manual move reconciliation, and single-run-per-project default behavior.
- Updated renderer run pills, controls, progress summaries, and stop handling for queued runs.
- Added backend/schema tests for Ready normalization, queue ordering, cancellation, preflight blocking, and concurrency.

Files changed:
- `src/shared/types.ts`
- `src/main/services/schemas.ts`
- `src/main/services/storage/index.ts`
- `src/main/services/codex/index.ts`
- `src/main/services/run-events/index.ts`
- `src/main/ipc/methods/tickets.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/AgentActivity.tsx`
- `src/renderer/src/lib/agentProgress.ts`
- `src/renderer/src/styles.css`
- `tests/backend.test.ts`
- `tests/schemas.test.ts`

Commands run:
- `npm run typecheck`
- `npm test`
- plus targeted `git status`, `git diff`, `grep`, and `sed` inspections.

Tests run and results:
- `npm run typecheck`: passed.
- `npm test`: passed, 95 tests. Existing esbuild warning about `import.meta` with CJS output still appears.

Remaining risks or follow-up:
- No settings UI was added for `agentConcurrency`, per ticket scope.
- Git status also shows `.relay` ticket/run metadata changes generated around this Relay run; I did not use those as implementation files.


No Codex run has been started.
