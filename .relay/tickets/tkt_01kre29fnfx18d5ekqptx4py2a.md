---
schemaVersion: 1
id: tkt_01kre29fnfx18d5ekqptx4py2a
title: Separate ticket drafting from the implementation worker queue
ticketType: task
status: completed
position: 55000
priority: high
labels:
  - backend
  - codex
  - scheduler
  - concurrency
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T12:23:50.703Z'
updatedAt: '2026-05-12T13:43:00.850Z'
codexThreadId: 019e1c37-1a59-7cc1-af68-ec2e6ea6be6d
runStatus: completed
lastRunId: run_01kre2tksw6cvm7t3jkmqm8rnr
lastRunStartedAt: '2026-05-12T12:43:53.687Z'
---
# Separate ticket drafting from the implementation worker queue

## Context

Ticket drafting currently registers itself in the same active-run map used by the Ready queue scheduler. Because the scheduler counts that map as implementation capacity, a long-running draft can prevent Ready tickets from starting. Split Relay into logical run lanes: a draft lane that can run multiple draft jobs, and a single-worker implementation lane that drains Ready tickets in order.

## Codebase Findings

- src/main/services/codex/index.ts:98-103 defines shared `activeRuns`, `queuedRunIntents`, and `startingRuns`; there is no separate active draft registry.
- src/main/services/codex/index.ts:114-123 `activeImplementationRunCountForProject` counts every entry in `activeRuns` plus `startingRuns`, so any run stored in `activeRuns` consumes implementation scheduler capacity.
- src/main/services/codex/index.ts:176-200 `drainProjectScheduler` starts queued Ready tickets only while `activeImplementationRunCountForProject(projectPath) < concurrency`; this is the bottleneck affected by draft runs.
- src/main/services/codex/index.ts:1086-1122 `startTicketDraftRun` creates a pending draft ticket and then stores the draft run in `activeRuns`, causing drafting to be counted as implementation work.
- src/main/services/codex/index.ts:1265-1314 `maybeResumeTicketDraftAfterClarification` also stores resumed draft runs in `activeRuns`, so clarified draft resumes have the same blocking behavior.
- src/main/services/codex/index.ts:2353-2380 `enqueueCodexRunPromise` queues implementation work by setting `queuedRunIntents`, calling `setTicketQueued`, and waking the scheduler.
- src/main/services/storage/index.ts:1114-1118 `listQueuedReadyTickets` returns only tickets in `ready` with `runStatus === "queued"`, sorted by board position; queued Ready tickets depend on the scheduler loop to start.
- src/main/services/storage/index.ts:83-95 defaults `agentConcurrency` to 1, and src/main/services/schemas.ts:170-194 validates/defaults the same setting; current worker-lane default is already one implementation run.
- tests/ticket-draft.test.ts:454-502 already verifies async ticket drafts can run concurrently and update only their own placeholder tickets.
- tests/backend.test.ts:1146-1229 verifies the Ready queue runs one implementation at a time in board order with default settings, but it does not cover active drafts occupying scheduler capacity.
- src/renderer/src/App.tsx:1417-1444 starts draft creation through `ticket.createDraft` and closes after the placeholder ticket/run is accepted; no UI lane change is required for the bug fix.
- src/renderer/src/App.tsx:2285-2308 starts/resumes implementation runs through `codex.startRun`/`codex.resumeRun` and displays queued vs started state based on the backend response.
- Inspected tests/ticket-draft-ui.test.tsx (Matched terms: drafting, tickets, ready, column, agent, draft, createticketdraft, ticketdraft; symbols: TicketSuggestion, TicketSummary, ticketSummary, standardTitles).
- Inspected tests/ticket-draft.test.ts (Matched terms: drafting, tickets, ready, agent, draft, createdraft, createticketdraft, ticketdraft; symbols: TicketDraftCodexClient, TicketDraftDependencies, TicketDraftStartDependencies, TicketDraftThread).
- Inspected tests/schemas.test.ts (Matched terms: concurrency, drafting, tickets, column, agent, draft, ticketdraft, ticketdraftschema; symbols: expectSchemaError, rendered, validDraftBase, validProjectConfigInput).
- Inspected src/main/services/schemas.ts (Matched terms: concurrency, issue, drafting, tickets, ready, column, agent, draft; symbols: RelaySchema, nonEmptyString, numberSchema, unknownRecordSchema).
- Inspected src/renderer/src/App.tsx (Matched terms: drafting, tickets, ready, column, agent, draft, createticketdraft, ticketdraft; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast).
- Inspected src/shared/types.ts (Matched terms: concurrency, drafting, tickets, ready, column, agent, draft, ticketdraft; symbols: RELAY_SCHEMA_VERSION, RELAY_TODO_STATUS, RELAY_READY_STATUS, RELAY_IN_PROGRESS_STATUS).
- Research limitation: Code search stopped after scanning 160 candidate files.

## Requirements

- Draft runs must not count against implementation worker capacity for the same project.
- The implementation lane must run at most one active implementation run per project, regardless of simultaneous draft activity.
- Multiple draft runs may continue to run concurrently using the existing async draft flow.
- Queued Ready tickets must continue to start in board order and transition to In Progress when the implementation worker is free.
- The existing cancellation API, `cancelCodexRun`, must still cancel queued implementation runs, active implementation runs, and active draft runs correctly.
- Do not add new visible board columns or UI swimlanes; this ticket is an internal scheduler/lane split.

## Implementation Plan

- In `src/main/services/codex/index.ts`, split run tracking into separate maps for active implementation runs and active draft runs. Keep `queuedRunIntents` and `startingRuns` scoped to implementation queue startup.
- Change `activeImplementationRunCountForProject` so it counts only active implementation runs plus `startingRuns`; draft runs must be excluded.
- Change `startTicketDraftRun` and `maybeResumeTicketDraftAfterClarification` to register their abort controllers in the draft-run map and delete from that map in their finalizers.
- Change `startQueuedRunNow`, `activeRunIdForTicket`, and related implementation-run cleanup to use the implementation-run map. If duplicate-run checks need to catch an active draft on the same ticket, check both maps without counting drafts as scheduler capacity.
- Set the Ready queue scheduler's implementation capacity to one active implementation run per project. Leave the existing `agentConcurrency` config/schema field intact for backward compatibility, but do not let values greater than 1 start multiple worker agents in this change.
- Update `cancelCodexRun` so it handles queued implementation runs first, then active implementation runs, then active draft runs. Preserve the current queued cancellation behavior that clears queued state and returns the ticket to Todo when available.
- Add focused regression coverage around an unresolved draft plus queued Ready tickets so the first implementation starts while the draft is still active, the second implementation remains queued, and the second starts only after the first implementation completes.
- Keep existing draft placeholder, draft completion, draft clarification, implementation completion, and run event semantics unchanged except for the scheduler capacity accounting.

## Test Plan

- Add a backend regression test near `tests/backend.test.ts:1146` that starts a long-running `startTicketDraftRun`, configures `agentConcurrency: 2`, queues two implementation tickets, and asserts only one implementation starts while the draft is still running.
- Extend or add cancellation coverage to confirm `cancelCodexRun` still cancels an active draft after the run maps split.
- Run `npm test`.
- Run `npm run typecheck`.

## Acceptance Criteria

- An active ticket draft no longer prevents a Ready queued implementation ticket from starting.
- With two Ready queued implementation tickets and one active draft, exactly one implementation run is active at a time; the second implementation remains queued until the first finishes.
- Two or more drafts can still be active concurrently and complete onto their own placeholder tickets.
- Cancelling a queued implementation run, active implementation run, or active draft run still updates ticket run state consistently with existing behavior.
- Existing scheduler, ticket draft, and schema tests pass.

## Assumptions / Open Questions

- The requested "two work lanes" are logical backend lanes, not new visible board columns or UI swimlanes.
- The worker lane should be single-worker per project for now; the existing `agentConcurrency` field can remain in persisted settings for compatibility but should not increase implementation parallelism in this ticket.
- No product setting for draft concurrency is needed; the existing async draft flow already permits higher draft concurrency.

## Implementation Notes

- Supplemental local search used `grep`/`nl` because `rg` was not installed in this shell.
- Bounded draft research reported that code search stopped after scanning 160 candidate files; the relevant scheduler, storage, UI, and tests were subsequently checked directly.
- Local `git status` showed unrelated dirty `.relay/*` ticket/run files. The implementation should not modify or revert generated Relay ticket/run artifacts unless explicitly needed for a test fixture.

## Research Metadata

- File inspected: tests/ticket-draft-ui.test.tsx - Matched terms: drafting, tickets, ready, column, agent, draft, createticketdraft, ticketdraft; characters read: 9798; symbols: TicketSuggestion, TicketSummary, ticketSummary, standardTitles, markup, ticket
  Matched lines:
  - 6: CreateTicketDraftMessage,
  - 7: DraftingTicketDetailLoading,
  - 8: emptyColumnMessage,
- File inspected: tests/ticket-draft.test.ts - Matched terms: drafting, tickets, ready, agent, draft, createdraft, createticketdraft, ticketdraft; characters read: 12000; symbols: TicketDraftCodexClient, TicketDraftDependencies, TicketDraftStartDependencies, TicketDraftThread, readyStatus, createProject
  Matched lines:
  - 8: createTicketDraft,
  - 9: draftToCreateInput,
  - 10: extractTicketDraftUrls,
- File inspected: tests/schemas.test.ts - Matched terms: concurrency, drafting, tickets, column, agent, draft, ticketdraft, ticketdraftschema; characters read: 12000; symbols: expectSchemaError, rendered, validDraftBase, validProjectConfigInput, createdAt, parsed
  Matched lines:
  - 4: agentTicketUpdateSchema,
  - 10: ticketDraftSchema,
  - 12: ticketSuggestionsResponseSchema
- File inspected: src/main/services/schemas.ts - Matched terms: concurrency, issue, drafting, tickets, ready, column, agent, draft; characters read: 12000; symbols: RelaySchema, nonEmptyString, numberSchema, unknownRecordSchema, mutableArray, withDefault
  Matched lines:
  - 2: import * as SchemaIssue from "effect/SchemaIssue";
  - 5: AgentTicketUpdate,
  - 6: AgentTicketUpdateInput,
- File inspected: src/renderer/src/App.tsx - Matched terms: drafting, tickets, ready, column, agent, draft, createticketdraft, ticketdraft; characters read: 12000; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast, LocalAgentProgress, TicketSuggestionCreateState
  Matched lines:
  - 39: RelayColumn,
  - 44: TicketDraft,
  - 45: TicketDraftErrorPayload,
- File inspected: src/shared/types.ts - Matched terms: concurrency, drafting, tickets, ready, column, agent, draft, ticketdraft; characters read: 12000; symbols: RELAY_SCHEMA_VERSION, RELAY_TODO_STATUS, RELAY_READY_STATUS, RELAY_IN_PROGRESS_STATUS, RELAY_NEEDS_CLARIFICATION_STATUS, RELAY_REVIEW_STATUS
  Matched lines:
  - 3: export const RELAY_READY_STATUS = "ready";
  - 10: export const DEFAULT_COLUMNS: RelayColumn[] = [
  - 12: { id: RELAY_READY_STATUS, name: "Ready", position: 2000, terminal: false },
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

### 5/12/2026, 1:54:07 PM

**Summary**
Implemented the internal lane split for Codex runs. Draft runs now register in `activeDraftRuns`, implementation runs in `activeImplementationRuns`, and the Ready scheduler only counts implementation runs plus startup reservations. The implementation lane is hard-capped at one active worker per project while preserving the existing `agentConcurrency` setting for compatibility.

**Files Changed**
- [src/main/services/codex/index.ts](/Users/robertpitt/Projects/relay/src/main/services/codex/index.ts:98)
- [tests/backend.test.ts](/Users/robertpitt/Projects/relay/tests/backend.test.ts:1164)

**Commands Run**
- `git status --short`
- `grep` / `nl` / `sed` inspections
- `git diff --check -- src/main/services/codex/index.ts tests/backend.test.ts`
- `npm run typecheck`
- `npm test`

**Tests**
- `npm run typecheck`: passed
- `npm test`: passed, 125/125 tests passing. Existing esbuild warning about `import.meta` with CJS output appeared during test bundling.

**Subagent Usage**
- none used

**Remaining Risks / Follow-Up**
- No known implementation risks.
- Worktree still has unrelated pre-existing dirty `.relay`, renderer, keyboard shortcut, and sidebar test files; I left them untouched.


No Codex run has been started.
