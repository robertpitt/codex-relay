# Effect Workflow Lifecycle Evaluation

Status: Accepted for Relay v1 lifecycle guardrails

Date: 2026-05-12

## Decision

Relay should not adopt `effect/unstable/workflow` as the production ticket lifecycle engine in this ticket.

For Relay v1, the authoritative product model remains:

- Board columns from project configuration, normalized from `DEFAULT_COLUMNS`.
- Ticket front matter status and position.
- Ticket `runStatus` for Codex execution state.
- Existing storage helpers, run events, audit events, and Codex run orchestration.

Production code under `src/main` and `src/preload` must not import `effect/unstable/workflow` or `effect/unstable/workflow/*` until a future ticket deliberately removes that guard after proving durable persistence, cancellation parity, and schema compatibility. Relay can still borrow narrower Effect concepts such as scoped cleanup, explicit registries, queues, semaphores, `Ref`, or finalizers where they solve concrete problems without changing the public lifecycle model.

This evaluation is a decision record and guardrail. It is not a production migration, it does not change runtime ticket lifecycle behavior, and it does not alter IPC contracts, shared public types, renderer UI, `.relay` formats, ticket markdown, run logs, or audit event shapes.

## Scope/Non-goals

Scope:

- Evaluate the local `effect@4.0.0-beta.65` unstable Workflow source that is already present in the repository.
- Compare Workflow concepts against Relay's current ticket lifecycle requirements.
- Document the current lifecycle and recommend a Relay-native follow-up path.
- Add an import boundary guard to prevent accidental production adoption.

Non-goals:

- No production use of `Workflow`, `WorkflowEngine`, activities, durable clocks, or deferreds.
- No replacement of project columns, ticket status, `runStatus`, or Codex run orchestration.
- No background daemon that automatically picks up tickets outside explicit user action.
- No new `.relay` schema, `.relay/workflow.md`, ticket markdown, run JSONL, or audit format.
- No dependency upgrade or external documentation dependency for this decision.

## Current Relay Lifecycle

Relay currently separates product lifecycle from execution lifecycle:

- Built-in board statuses are declared by `DEFAULT_COLUMNS`: `todo`, `ready`, `in_progress`, `needs_clarification`, `review`, `not_doing`, and `completed`.
- Execution state is separate in `RunStatus`: `idle`, `queued`, `drafting`, `draft_failed`, `draft_complete`, `running`, `blocked`, `failed`, `completed`, and `cancelled`.
- Project columns are configurable. Existing `.relay/project.json` can contain custom or older columns, such as `for_amitava`, and storage normalization inserts missing default `ready` and `review` columns at runtime when needed.

### Transition Matrix


| Flow                          | Entry point                                                                                                                                                                    | Board status effect                                                                                                                                                                                                                            | `runStatus` effect                                                                                                                                                                                                                                   | Guardrail notes                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Manual board drag             | Renderer board `DndContext` calls the drag move handler, then IPC `ticketMove` validates input, calls `moveTicket`, runs `reconcileTicketQueueState`, and returns `readBoard`. | Moves to the selected project column after validation. `transitionTicketStatus` validates target status against project columns, recalculates position on status changes, writes the ticket, and appends `ticket.status_changed` audit events. | Usually unchanged unless queue reconciliation applies.                                                                                                                                                                                               | Columns stay product-visible and configurable. Manual drag remains a first-class lifecycle control.                                                          |
| Manual ticket edit            | IPC ticket save calls `saveTicket`, then `reconcileTicketQueueState`.                                                                                                          | Saved front matter status is validated against project columns.                                                                                                                                                                                | Usually unchanged unless the saved status enters or leaves `ready`.                                                                                                                                                                                  | Ticket markdown/front matter remains the persistence boundary.                                                                                               |
| Ready queueing                | `reconcileTicketQueueState` queues a ticket manually moved or saved into `ready`; direct Codex start also queues through `setTicketQueued`.                                    | `setTicketQueued` moves the ticket to `RELAY_READY_STATUS` when that column exists, otherwise leaves the current status.                                                                                                                       | Sets `runStatus: "queued"` and `lastRunId`. `listQueuedReadyTickets` returns queued Ready tickets in board position order.                                                                                                                           | The per-project scheduler uses an Effect `Queue`, `IMPLEMENTATION_WORKER_CONCURRENCY = 1`, and board order. This is queueing, not a hidden lifecycle engine. |
| Queued cancellation           | `cancelCodexRun` sees a queued run intent.                                                                                                                                     | Deletes queued intent and, when `todo` exists, `clearQueuedTicket` moves the ticket back to Todo through normal transition/audit logic.                                                                                                        | `clearQueuedTicket` resets `runStatus` to `idle` and clears `lastRunId` when the expected run matches.                                                                                                                                               | Queued cancellation is persisted through ticket front matter, not a Workflow execution record.                                                               |
| Active cancellation           | `cancelCodexRun` sees an active implementation run or draft run.                                                                                                               | No automatic board-column acceptance or review transition is performed by cancellation itself.                                                                                                                                                 | Uses the run's `AbortController`, marks `runStatus: "cancelled"`, and the stream failure path emits a cancelled `run.failed` event for implementation runs.                                                                                          | Current semantics are AbortSignal-backed and must be preserved before any Effect interruption migration.                                                     |
| Run start                     | Scheduler drains `listQueuedReadyTickets`, records `startingRuns`, and calls `startQueuedRunNow`.                                                                              | `startQueuedRunNow` targets `RELAY_IN_PROGRESS_STATUS` when available and calls `transitionTicketStatus`.                                                                                                                                      | `preflightCodexRunInternal` blocks terminal statuses, epics, active blockers, duplicate active runs, queued/running/drafting conflicts, and unanswered clarifications. On start it sets `runStatus: "running"`, `lastRunId`, and `lastRunStartedAt`. | Start behavior depends on both persisted ticket state and module-level active run maps.                                                                      |
| Clarification blocking        | Codex handoff parsing detects clarification requests during `turn.completed`.                                                                                                  | Moves to `RELAY_NEEDS_CLARIFICATION_STATUS` when available.                                                                                                                                                                                    | Creates stored clarification questions, appends the Codex handoff, sets `runStatus: "blocked"`, and emits `clarification.requested`.                                                                                                                 | Human answers remain ticket-adjacent data; preflight blocks new runs while unanswered questions exist.                                                       |
| Run completion to Review      | Codex stream receives `turn.completed` without clarification requests.                                                                                                         | Moves to `RELAY_REVIEW_STATUS` when available.                                                                                                                                                                                                 | Appends the Codex handoff, sets `runStatus: "completed"`, keeps `lastRunId`, and emits `run.completed`.                                                                                                                                              | Review is a human review lane, not an engine terminal state.                                                                                                 |
| Human acceptance to Completed | Renderer `moveTicketTo("completed", "Ticket accepted.")` calls `getRelayApi().ticket.move`.                                                                                    | Moves from Review to `completed` when the Completed column is available.                                                                                                                                                                       | Does not reinterpret the Codex run. The completed run status remains historical execution state.                                                                                                                                                     | Human acceptance is separate from Codex completing a run.                                                                                                    |
| Reopen                        | Renderer `moveTicketTo("todo", "Ticket reopened.")` calls the same move API.                                                                                                   | Moves from Completed to Todo when available.                                                                                                                                                                                                   | Does not create or resume a run by itself.                                                                                                                                                                                                           | Reopen is product lifecycle control, not Workflow resume.                                                                                                    |


The key lifecycle functions to preserve are `transitionTicketStatus`, `setTicketQueued`, `clearQueuedTicket`, `listQueuedReadyTickets`, `preflightCodexRunInternal`, `startQueuedRunNow`, `reconcileTicketQueueState`, `cancelCodexRun`, and the renderer `moveTicketTo` and board drag entry points.

## Effect Workflow Concepts

The local Effect source exposes Workflow through the unstable import path `effect/unstable/workflow`.


| Concept                                     | Local source behavior                                                                                                                                               | Relay fit                                                                                                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Workflow.make` schemas                     | `Workflow.make` defines a named workflow with payload, success, and error schemas.                                                                                  | Useful as a design reminder for typed lifecycle commands, but Relay already has ticket front matter, IPC schemas, run events, and audit events that must stay stable.                                                                                 |
| Deterministic execution IDs and idempotency | `Workflow.make` derives `executionId` from the workflow name and `idempotencyKey(payload)`. `execute(..., { discard: true })` can return that ID.                   | Relay has `runId`, `lastRunId`, Codex thread IDs, queued intents, and audit entries. Deterministic IDs could help future de-duplication, but adopting Workflow IDs now would create a second execution identity before persistence design is settled. |
| `execute`, `poll`, `interrupt`, `resume`    | Workflows expose these operations through `WorkflowEngine`.                                                                                                         | The names overlap with Relay needs, but semantics are not yet proven against Codex SDK streaming, AbortSignal cancellation, `.relay` run JSONL, and human board moves.                                                                                |
| `toLayer` registration                      | Workflows are registered through a Layer before execution.                                                                                                          | This matches Relay's Effect layering direction, but registration would be an internal implementation detail and should not replace the product lifecycle model.                                                                                       |
| Compensation/finalizers                     | `withCompensation` registers cleanup if the workflow fails, and the engine has scoped instances.                                                                    | This is conceptually useful. Relay should first apply narrower `Effect.acquireRelease`, `Effect.scoped`, `Effect.ensuring`, or `Effect.forkScoped` patterns around current run maps and AbortControllers.                                             |
| Activities                                  | `WorkflowEngine.activityExecute` caches activity result state by execution/activity/attempt.                                                                        | Relay's Codex stream events and file mutations are not currently modeled as idempotent activities. Activity adoption would require a durable activity store and replay policy.                                                                        |
| Complete and Suspended results              | Workflow results are `Complete` or `Suspended`; suspended executions are retried using a schedule.                                                                  | Relay has human clarification blocking and queue waiting, but those are visible ticket states, not hidden suspended engine states. Mapping clarification questions to `Suspended` would obscure product state unless designed carefully.              |
| Durable deferreds and clocks                | The engine interface includes `deferredResult`, `deferredDone`, and `scheduleClock`.                                                                                | These could model future wakeups or external signals, but Relay v1 explicitly avoids a background daemon. There is no durable clock/deferred storage design in `.relay` today.                                                                        |
| In-memory layer                             | `WorkflowEngine.layerMemory` is documented as useful for tests/local development but not suitable for production because it does not provide durability guarantees. | This disqualifies `layerMemory` for Relay's production ticket lifecycle. Relay must survive app restarts with persisted tickets, run metadata, and audit logs.                                                                                        |
| Unstable API surface                        | The import path is `effect/unstable/workflow`; package version is `effect@4.0.0-beta.65`.                                                                           | Production lifecycle control should not depend on this unstable API while Relay v1 lifecycle requirements are already satisfied by columns plus `runStatus`.                                                                                          |


## Fit/Gaps

What fits:

- Explicit lifecycle operations map well to a future internal lifecycle policy service.
- Deterministic execution IDs are worth revisiting for duplicate queued starts and resume decisions.
- Scoped cleanup and finalizers are directly relevant to current module-level maps and `AbortController` cleanup.
- Queues and semaphores already match the per-project single implementation worker model.

What does not fit yet:

- Relay's lifecycle is user-visible and board-first. Workflow execution state would be an internal engine state that could diverge from ticket front matter unless it had a durable `.relay` persistence design.
- Relay must preserve cancellation semantics backed by Codex SDK `AbortSignal`. Effect interruption and Workflow `interrupt` cannot be substituted until parity tests cover queued, starting, streaming, blocked, failed, completed, draft, and ticket-update runs.
- `WorkflowEngine.layerMemory` is explicitly non-production for durability, and no production durable WorkflowEngine layer exists in Relay.
- Workflow `Suspended` is not the same as Relay clarification blocking. Relay stores questions, marks `runStatus: "blocked"`, moves the card to Needs Clarification when available, and blocks preflight until answers exist.
- Activities, durable deferreds, and durable clocks would require new persisted records and migration rules, which are out of scope for this evaluation.
- The unstable import path and beta package version make direct production adoption too risky for ticket lifecycle control.

## Recommended Relay-Native Path

The next practical step is to extract small Relay-native services before any WorkflowEngine experiment:

1. Create an `AgentRunRegistry` around `activeImplementationRuns`, `activeDraftRuns`, `queuedRunIntents`, `startingRuns`, `projectSchedulers`, `activeTicketUpdateRuns`, and `activeTicketUpdateRunsByTicket`.
2. Keep the registry behavior-compatible with current maps while making registration, starting, cancellation, cleanup, and scheduler wakeups explicit.
3. Extract a lifecycle policy service for pure decisions: preflight eligibility, target status selection, queue reconciliation, cancellation destination, and run completion or clarification transitions.
4. Keep storage writes in `src/main/services/storage/index.ts` and run event writes in the run-event sink. The policy service should decide; existing persistence helpers should persist.
5. Add parity tests for the transition matrix above before changing orchestration internals.
6. Use narrow Effect primitives only where they address a concrete concurrency or cleanup need. Examples: `Queue` for scheduling, `Semaphore` for concurrency, `Ref` for registry state, `Effect.acquireRelease` or `Effect.ensuring` for cleanup, and `Effect.scoped` or `Effect.forkScoped` for lifetimes.
7. Reconsider `effect/unstable/workflow` only after Relay has a durable persistence design for workflow executions, durable signals/timers if needed, cancellation parity with Codex SDK streaming, and an intentional migration story for current `.relay` records.

## Follow-up Ticket Candidates

- Extract `AgentRunRegistry` without behavior changes and cover cleanup with tests.
- Extract a pure lifecycle policy module that returns transition decisions without writing files.
- Add a lifecycle parity test suite for manual moves, manual edits, queueing, cancellation, start, clarification blocking, completion to Review, acceptance, and reopen.
- Evaluate deterministic `runId` or idempotency strategies for duplicate Ready queue starts without changing existing run log identity.
- Spike a test-only WorkflowEngine adapter using `WorkflowEngine.layerMemory`, explicitly outside production code, to learn API behavior without changing Relay lifecycle control.
- Design a durable execution store only if a future product requirement needs hidden timers, cross-process resumption, or workflow replay beyond current ticket/run/audit files.

## Source References

- `SPEC.md:55-57` prohibits a background daemon and a full workflow engine for Relay v1.
- `SPEC.md:145-156` assigns filesystem, `.relay` initialization, Codex SDK lifecycle, run log writes, typed IPC, and security checks to Electron main.
- `src/shared/types.ts:2-32` declares `DEFAULT_COLUMNS` status IDs and `RunStatus`.
- `.relay/project.json:7-43` shows a local project with custom or older columns; `src/main/services/storage/index.ts:102-128` normalizes missing default Ready and Review columns.
- `src/main/services/storage/index.ts:1013-1057` implements `transitionTicketStatus`.
- `src/main/services/storage/index.ts:1059-1118` implements `setTicketQueued`, `clearQueuedTicket`, and `listQueuedReadyTickets`.
- `src/main/ipc/methods/tickets.ts:150-172` reconciles queue state after ticket save and move.
- `src/main/services/codex/index.ts:100-108` holds current module-level lifecycle maps.
- `src/main/services/codex/index.ts:154-205` creates the per-project scheduler and drains queued Ready tickets in board order.
- `src/main/services/codex/index.ts:2047-2160` implements `preflightCodexRunInternal`.
- `src/main/services/codex/index.ts:2162-2268` starts queued runs and transitions to In Progress when available.
- `src/main/services/codex/index.ts:2377-2450` handles clarification blocking and completion to Review.
- `src/main/services/codex/index.ts:2454-2469` cleans active run maps in stream finalization.
- `src/main/services/codex/index.ts:2527-2605` implements `reconcileTicketQueueState` and `cancelCodexRun`.
- `src/renderer/src/App.tsx:933`, `src/renderer/src/App.tsx:2549-2561`, and `src/renderer/src/App.tsx:2777-2793` expose board drag, `moveTicketTo`, Mark Accepted, and Reopen entry points.
- `tests/backend.test.ts:234-284`, `tests/backend.test.ts:1164-1255`, `tests/backend.test.ts:1362-1482` cover status transitions, manual moves, Ready queue ordering, transition to In Progress/Review, queued cancellation, and manual Ready queue reconciliation.
- `docs/effect-layered-architecture.md:21-31` keeps shared renderer contracts and `.relay` formats stable while permitting Effect internals behind boundaries.
- `docs/backend-effect-v4-upgrade-plan.md:195-204` already recommends moving lifecycle state out of module-level maps in phases before broader migration.
- `package.json:21-28` pins `effect` to `4.0.0-beta.65`.
- `.effect/packages/effect/src/unstable/workflow/Workflow.ts:276-390` defines `Workflow.make`, schema fields, idempotency-derived `executionId`, `execute`, `poll`, `interrupt`, `resume`, `toLayer`, and `withCompensation`.
- `.effect/packages/effect/src/unstable/workflow/Workflow.ts:407-531` defines `Complete` and `Suspended` workflow results.
- `.effect/packages/effect/src/unstable/workflow/Workflow.ts:705-746` defines compensation and suspension behavior.
- `.effect/packages/effect/src/unstable/workflow/WorkflowEngine.ts:21-196` defines engine operations including register, execute, poll, interrupt, resume, activities, deferreds, and clock scheduling.
- `.effect/packages/effect/src/unstable/workflow/WorkflowEngine.ts:522-530` documents `WorkflowEngine.layerMemory` as non-production because it lacks durability guarantees.
- `.effect/packages/effect/test/unstable/workflow/WorkflowEngine.test.ts:15-28` shows the local pattern using `Workflow.execute`, `Workflow.poll`, and `WorkflowEngine.layerMemory`.

