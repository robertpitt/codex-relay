---
schemaVersion: 1
id: tkt_01kreb0r980bfvhp8hgrr3yyx1
title: Evaluate Effect Workflow for Relay Ticket Lifecycle Control
ticketType: task
status: review
position: 2000
priority: medium
labels:
  - backend
  - effect
  - workflow
  - architecture
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T14:56:21.800Z'
updatedAt: '2026-05-12T16:41:52.790Z'
codexThreadId: 019e1ce9-79ee-7170-86ef-2246baf5364b
runStatus: completed
lastRunId: run_01kredy41qcdhkwgn3ccwctdzg
lastRunStartedAt: '2026-05-12T15:58:43.553Z'
---
# Evaluate Effect Workflow for Relay Ticket Lifecycle Control

## Context

Create a codebase-grounded evaluation of Effect's unstable Workflow engine and related lifecycle concepts for Relay's native ticket lifecycle. The deliverable should be a documented decision plus guardrails, not a production migration. Relay currently controls lifecycle through project columns, ticket front matter, runStatus, storage helpers, and Codex run orchestration.

## Codebase Findings

- SPEC.md:55-57 says Relay v1 must not run a background daemon that automatically picks up tickets and must not invent a full workflow engine; columns and card state are enough for v1.
- SPEC.md:145-156 assigns filesystem, .relay initialization/migrations, Codex SDK lifecycle, run log writes, typed IPC handlers, and security checks to the Electron main process.
- src/shared/types.ts:2-17 defines the built-in lifecycle status IDs and DEFAULT_COLUMNS: todo, ready, in_progress, needs_clarification, review, not_doing, completed.
- src/shared/types.ts:22-32 defines RunStatus separately from board status: idle, queued, drafting, draft_failed, draft_complete, running, blocked, failed, completed, cancelled.
- .relay/project.json:7-43 shows the current local relay project has a custom For Amitava column and older column positions; src/main/services/storage/index.ts:102-128 normalizes missing default Ready and Review columns into existing project configs.
- src/main/services/storage/index.ts:1013-1057 implements transitionTicketStatus: validates targetStatus against project columns, recalculates position when status changes, writes the ticket, and appends ticket.status_changed audit events.
- src/main/services/storage/index.ts:1059-1118 implements queue-specific lifecycle helpers: setTicketQueued moves to Ready when available and sets runStatus queued, clearQueuedTicket resets queued state, and listQueuedReadyTickets returns queued Ready tickets in board order.
- src/main/ipc/methods/tickets.ts:163-172 handles ticket moves by validating ticketMoveInput, calling moveTicket, reconciling queue state, then returning readBoard.
- src/main/services/codex/index.ts:90-104 keeps lifecycle execution state in module-level maps: activeImplementationRuns, activeDraftRuns, queuedRunIntents, startingRuns, projectSchedulers, activeTicketUpdateRuns, and activeTicketUpdateRunsByTicket.
- src/main/services/codex/index.ts:152-205 creates a per-project scheduler with Effect Queue, enforces IMPLEMENTATION_WORKER_CONCURRENCY = 1, and starts queued Ready runs in board order.
- src/main/services/codex/index.ts:1928-2041 implements preflightCodexRunInternal, blocking terminal statuses, epics, active blockers, duplicate active runs, queued/running/drafting run states, and unanswered clarifications before Codex can start.
- src/main/services/codex/index.ts:2140-2161 marks a queued run running, transitions the ticket to In Progress when available, emits ticket.status_changed, then starts SDK streaming with AbortSignal.
- src/main/services/codex/index.ts:2261-2296 turns clarification requests into stored questions, marks runStatus blocked, moves the ticket to Needs Clarification when available, and emits clarification.requested.
- src/main/services/codex/index.ts:2301-2330 marks successful runs completed, appends the Codex handoff, moves the ticket to Review when available, and emits run.completed.
- src/main/services/codex/index.ts:2335-2350 cleans activeImplementationRuns and startingRuns in finally and wakes the scheduler; src/main/services/codex/index.ts:2458-2489 cancels queued, active implementation, and draft runs with current AbortController-backed behavior.
- src/renderer/src/App.tsx:2340-2353 exposes moveTicketTo through the renderer API; src/renderer/src/App.tsx:2568-2584 uses it for Mark Accepted and Reopen; src/renderer/src/App.tsx:3227-3236 uses it for drag-and-drop board moves.
- tests/backend.test.ts:234-265 covers automated status transitions and audit events; tests/backend.test.ts:267-284 covers manual ticket moves.
- tests/backend.test.ts:1164-1255 covers Ready queue ordering and transition to In Progress/Review; tests/backend.test.ts:1362-1420 covers queued cancellation returning a ticket to Todo; tests/backend.test.ts:1422-1482 covers manual Ready moves enqueuing and moving out clearing queued state.
- docs/effect-layered-architecture.md:21-31 states compatibility rules: window.relay names stay stable, no Effect types leak through shared renderer contracts, .relay formats stay stable, and new backend internals should use Context.Service/Layer while keeping Promise conversion at IPC/test boundaries.
- docs/backend-effect-v4-upgrade-plan.md:195-204 already recommends moving lifecycle state out of module-level maps in phases, starting with AgentRunRegistry, then using Effect.acquireRelease, Effect.scoped, Effect.ensuring, Effect.forkScoped, Queue, Semaphore, or Ref only where concrete concurrency needs exist.
- docs/backend-effect-v4-upgrade-plan.md:501-541 marks the long-running Codex run lifecycle as the highest-risk future migration area and requires parity for starting, resuming, cancelling, failing, clarification-blocked, and completed runs; its listed file paths still mention older src/main/services/codex.ts and storage.ts paths.
- package.json:21-28 declares effect at 4.0.0-beta.65, so any evaluation should target the current beta package already installed in Relay.
- .effect/packages/effect/src/unstable/workflow/Workflow.ts:276-390 defines Workflow.make with payload/success/error schemas, idempotencyKey-derived executionId, execute, poll, interrupt, resume, toLayer, executionId, and withCompensation.
- .effect/packages/effect/src/unstable/workflow/WorkflowEngine.ts:21-196 defines WorkflowEngine operations including register, execute, poll, interrupt, interruptUnsafe, resume, activityExecute, deferredResult, deferredDone, and scheduleClock.
- .effect/packages/effect/src/unstable/workflow/WorkflowEngine.ts:522-530 documents WorkflowEngine.layerMemory as useful for tests/local development but not suitable for production because it does not provide durability guarantees.
- .effect/packages/effect/test/unstable/workflow/WorkflowEngine.test.ts:15-28 shows the local workflow engine pattern: Workflow.execute, Workflow.poll, and WorkflowEngine.layerMemory provided through a Layer.
- Inspected .effect/packages/ai/anthropic/src/AnthropicLanguageModel.ts (Matched terms: effect, control; symbols: MessageStreamEvent, Model, Config, SystemMessageOptions).
- Inspected .effect/packages/ai/openrouter/src/OpenRouterLanguageModel.ts (Matched terms: effect, control; symbols: ChatStreamingResponseChunkData, Config, ReasoningDetails, FileAnnotation).
- Inspected .effect/packages/ai/anthropic/src/Generated.ts (Matched terms: effect, control; symbols: APIError, AuthenticationError, Base64ImageSource, Base64PDFSource).
- Inspected docs/backend-effect-v4-upgrade-plan.md (Matched terms: effect, lifecycle, control; symbols: rather).
- Inspected .effect/packages/ai/anthropic/package.json (Matched terms: effect).
- Inspected .effect/packages/ai/anthropic/src/AnthropicClient.ts (Matched terms: effect, control; symbols: Service, and, MessageStreamEvent, AnthropicClient).
- Research limitation: Code search stopped after scanning 160 candidate files.

## Requirements

- Create docs/effect-workflow-lifecycle-evaluation.md as an ADR-style evaluation grounded in the source references above.
- The evaluation must explicitly decide that Relay should not adopt effect/unstable/workflow as the production ticket lifecycle engine in this ticket; Relay v1 should keep columns plus ticket runStatus as the product model and borrow only narrower concepts where useful.
- The evaluation must include a current Relay lifecycle map covering manual board moves, manual ticket edits, Ready queueing, queued cancellation, active cancellation, run start, clarification blocking, run completion to Review, and human acceptance to Completed.
- The evaluation must compare Effect Workflow concepts against Relay needs: deterministic execution IDs/idempotency, execute/poll/interrupt/resume, compensation/finalizers, activities, suspended results, durable clocks/deferreds, in-memory layer limitations, and unstable API risk.
- The evaluation must recommend a Relay-native follow-up path centered on a small AgentRunRegistry/lifecycle policy service before any broader Effect Workflow adoption.
- Update docs/backend-effect-v4-upgrade-plan.md Phase 5 to link to the new evaluation, use current file paths such as src/main/services/codex/index.ts and src/main/services/storage/index.ts, and record the no-production-Workflow decision.
- Add a guard to tests/import-boundaries.test.ts that fails production src/main or src/preload imports from effect/unstable/workflow or effect/unstable/workflow/*, with an error message pointing to the evaluation document.
- Do not change runtime ticket lifecycle behavior, IPC contracts, .relay ticket/config/run/audit formats, renderer UI, or shared public types as part of this evaluation ticket.
- Do not create or modify .relay/workflow.md; this ticket is about Effect's Workflow engine concepts, not the Relay workflow-definition artifact from older tickets.

## Implementation Plan

- Create docs/effect-workflow-lifecycle-evaluation.md with sections: Decision, Scope/Non-goals, Current Relay Lifecycle, Effect Workflow Concepts, Fit/Gaps, Recommended Relay-Native Path, Follow-up Ticket Candidates, and Source References.
- Populate the Current Relay Lifecycle section with a transition matrix using the exact current symbols and files: DEFAULT_COLUMNS/RunStatus, transitionTicketStatus, setTicketQueued, clearQueuedTicket, listQueuedReadyTickets, preflightCodexRunInternal, startQueuedRunNow, reconcileTicketQueueState, cancelCodexRun, and renderer moveTicketTo/drag move entry points.
- Write the Decision section to choose concept-only adoption for now: keep board columns and runStatus authoritative, do not import effect/unstable/workflow in production code, and defer any engine adoption until a durable persistence and cancellation-parity design exists.
- Write the Effect Workflow Concepts section from the local .effect source findings, including Workflow.make, executionId/idempotencyKey, toLayer registration, execute/poll/interrupt/resume, withCompensation, Complete/Suspended results, and WorkflowEngine.layerMemory's non-production durability limitation.
- Update docs/backend-effect-v4-upgrade-plan.md Phase 5 to reference docs/effect-workflow-lifecycle-evaluation.md, correct stale file paths, and frame AgentRunRegistry/lifecycle policy extraction as the next practical step before any WorkflowEngine experiment.
- Add an import-boundary assertion in tests/import-boundaries.test.ts that scans the existing sourceRoots and reports a violation for production imports matching effect/unstable/workflow or effect/unstable/workflow/*.
- Optionally add a one-sentence cross-link in docs/effect-layered-architecture.md under Transitional Facades pointing lifecycle readers to the new evaluation, without changing the architecture rules.
- Run the validation commands and leave any failures with exact command output in the handoff.

## Test Plan

- Run npm run typecheck.
- Run npm test.
- Verify tests/import-boundaries.test.ts fails clearly if a temporary production import from effect/unstable/workflow is introduced, then remove the temporary import before finishing.
- Read the final docs/effect-workflow-lifecycle-evaluation.md and docs/backend-effect-v4-upgrade-plan.md diff to confirm the recommendation is consistent and no runtime behavior change is implied.

## Acceptance Criteria

- docs/effect-workflow-lifecycle-evaluation.md exists and contains a concrete decision, current lifecycle map, Effect Workflow concept comparison, risks, and recommended follow-up path with source references.
- The documented decision says production Relay should not use effect/unstable/workflow for ticket lifecycle control in this ticket and should keep columns plus runStatus as authoritative for v1.
- docs/backend-effect-v4-upgrade-plan.md Phase 5 links to the evaluation, uses current file paths, and reflects AgentRunRegistry/lifecycle policy extraction as the next step.
- tests/import-boundaries.test.ts prevents accidental production imports of effect/unstable/workflow until a future ticket intentionally changes the guard.
- No source runtime behavior, shared IPC contracts, renderer UI, .relay schema, ticket markdown format, run log format, or audit event shape changes are included.
- npm run typecheck and npm test pass, or any failure is documented as pre-existing/unrelated with enough detail for follow-up.

## Assumptions / Open Questions

- This is an evaluation and guardrail task, not a production lifecycle migration.
- Relay v1 product constraints in SPEC.md remain authoritative, especially the prohibition on a full workflow engine.
- The current effect@4.0.0-beta.65 dependency is the version to evaluate; no dependency upgrade is required for this ticket.
- External Effect documentation is not required for this ticket because local .effect source contains the relevant Workflow APIs and explicitly marks the package path unstable.
- Future implementation tickets may intentionally remove or narrow the import guard after selecting a durable workflow persistence strategy and proving cancellation parity.

## Implementation Notes

- Initial bounded research mostly matched third-party .effect files and docs/backend-effect-v4-upgrade-plan.md; additional local research used git grep, grep, find, and targeted file reads because rg is not installed in this workspace.
- No URLs were provided in the idea, and network-backed external documentation was not fetched; the Effect Workflow evaluation should cite the local .effect source that is present in the repository.
- The local .effect Workflow API is under effect/unstable/workflow and may change; this instability is part of the evaluation outcome.
- Current .relay/project.json has custom/older columns including For Amitava and omits Ready/Review, while storage normalization inserts missing default columns at runtime; the evaluation should respect configurable columns rather than treating DEFAULT_COLUMNS as the only possible board shape.
- Older .relay logs mention a separate .relay/workflow.md artifact decision; that is separate from this Effect Workflow engine evaluation and should not be altered here.

## Research Metadata

- File inspected: .effect/packages/ai/anthropic/src/AnthropicLanguageModel.ts - Matched terms: effect, control; characters read: 12000; symbols: MessageStreamEvent, Model, Config, SystemMessageOptions, UserMessageOptions, AssistantMessageOptions
  Matched lines:
  - 4: /** @effect-diagnostics preferSchemaOverJson:skip-file */
  - 5: import * as Arr from "effect/Array"
  - 6: import * as Context from "effect/Context"
- File inspected: .effect/packages/ai/openrouter/src/OpenRouterLanguageModel.ts - Matched terms: effect, control; characters read: 12000; symbols: ChatStreamingResponseChunkData, Config, ReasoningDetails, FileAnnotation, SystemMessageOptions, UserMessageOptions
  Matched lines:
  - 4: /** @effect-diagnostics preferSchemaOverJson:skip-file */
  - 5: import * as Arr from "effect/Array"
  - 6: import * as Context from "effect/Context"
- File inspected: .effect/packages/ai/anthropic/src/Generated.ts - Matched terms: effect, control; characters read: 12000; symbols: APIError, AuthenticationError, Base64ImageSource, Base64PDFSource, BashCodeExecutionToolResultErrorCode, BetaAPIError
  Matched lines:
  - 5: import * as Data from "effect/Data"
  - 6: import * as Effect from "effect/Effect"
  - 7: import type { SchemaError } from "effect/Schema"
- File inspected: docs/backend-effect-v4-upgrade-plan.md - Matched terms: effect, lifecycle, control; characters read: 12000; symbols: rather
  Matched lines:
  - 1: # Backend Effect v4 Upgrade Plan
  - 3: This is an exploration and planning document only. It does not authorize a broad backend migration in this ticket, and `.effect/` remains third-party reference source that shoul...
  - 7: The current working tree has moved beyond the older audit baseline in `docs/backend-effect-v4-audit.md`:
- File inspected: .effect/packages/ai/anthropic/package.json - Matched terms: effect; characters read: 1584
  Matched lines:
  - 2: "name": "@effect/ai-anthropic",
  - 6: "description": "An Anthropic provider integration for Effect AI SDK",
  - 7: "homepage": "https://effect.website",
- File inspected: .effect/packages/ai/anthropic/src/AnthropicClient.ts - Matched terms: effect, control; characters read: 12000; symbols: Service, and, MessageStreamEvent, AnthropicClient, Options, RedactedAnthropicHeaders
  Matched lines:
  - 4: * Provides a type-safe, Effect-based client for Anthropic operations including
  - 9: import * as Array from "effect/Array"
  - 10: import type * as Config from "effect/Config"
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

### 5/12/2026, 5:41:52 PM

**Summary**
Added the Effect Workflow lifecycle evaluation ADR and guardrails. The decision is explicit: Relay v1 should not use `effect/unstable/workflow` as the production ticket lifecycle engine; columns plus ticket `runStatus` remain authoritative.

**Files Changed**
- [docs/effect-workflow-lifecycle-evaluation.md](/Users/robertpitt/Projects/relay/docs/effect-workflow-lifecycle-evaluation.md)
- [docs/backend-effect-v4-upgrade-plan.md](/Users/robertpitt/Projects/relay/docs/backend-effect-v4-upgrade-plan.md)
- [docs/effect-layered-architecture.md](/Users/robertpitt/Projects/relay/docs/effect-layered-architecture.md)
- [tests/import-boundaries.test.ts](/Users/robertpitt/Projects/relay/tests/import-boundaries.test.ts)

**Commands Run**
- `git status --short`
- `rg --version` failed because `rg` is not installed; used `sed`, `nl`, `grep`, and `find`
- Targeted source/doc inspections with `sed`, `nl`, `grep`, `find`
- Focused import-boundary guard verification via `node --input-type=module -e ...`
- `npm run typecheck`
- `npm test`

**Tests Run**
- Temporary production import probe: failed as expected with `src/main/__workflow_import_boundary_probe__.ts: production import from effect/unstable/workflow is blocked; see docs/effect-workflow-lifecycle-evaluation.md`
- Focused import-boundary test after removing probe: passed
- `npm run typecheck`: passed
- `npm test`: passed, 129 tests. Non-fatal esbuild warning about `import.meta` with CJS output was emitted.

**Subagent Usage**
None used. The work was small and tightly coupled across docs plus one boundary test.

**Remaining Risks / Follow-up**
No runtime lifecycle behavior was changed. The worktree already had unrelated dirty `.relay`, runtime, renderer, shared type, and test files before this ticket; I left those untouched. Future implementation work should start with the documented `AgentRunRegistry` and lifecycle policy extraction before any WorkflowEngine experiment.


No Codex run has been started.
