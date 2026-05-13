---
schemaVersion: 1
id: tkt_01krhf2jbryw7c2199t7fqpha7
title: Add Redraft Action for AI-Generated Tickets
ticketType: task
status: completed
position: 75000
priority: medium
effort: medium
labels:
  - tickets
  - ticket-drafting
  - codex
  - ux
  - electron-ipc
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-13T20:04:58.872Z'
updatedAt: '2026-05-13T20:34:50.632Z'
authoringState: ready
codexThreadId: 019e22f4-a29d-7ae0-a367-1228e0fbdee2
runStatus: completed
lastRunId: run_01krhf980h4p2vtaqgy7c2xgax
lastRunStartedAt: '2026-05-13T20:08:38.081Z'
---
# Add Redraft Action for AI-Generated Tickets

## Context

Add a Redraft button that lets users rerun Codex ticket drafting for an existing ticket when the previous draft failed or when the user wants another generated version. Redrafting should update the existing ticket in place after a successful draft and should not destroy the current recoverable ticket content if the new draft attempt fails.

## Goal

Add a Redraft button in the ticket detail view for failed draft placeholders and existing AI-generated draft tickets.

## Decisions / Assumptions

- Eligibility is limited to failed draft placeholders and existing draft/generated tickets, not arbitrary manually-authored tickets.
- Redraft does not require a new user prompt; when no override is provided, it reuses the ticket's original idea/intake context.
- The existing ticket remains in its current board column during redraft; no automatic status change is required beyond any existing pending/drafting metadata.
- The button belongs in the ticket detail view rather than the board card or global ticket input bar.

## Requirements

- Add a Redraft button in the ticket detail view for failed draft placeholders and existing AI-generated draft tickets.
- When clicked, start a new async draft run for the same ticket ID and board position, showing disabled/loading state while the run is active.
- On successful redraft, replace the existing ticket's generated title, markdown/body, labels, priority, requirements, plan, tests, acceptance criteria, assumptions, and related draft metadata with the new draft output.
- On failed redraft, keep the ticket recoverable by preserving the prior successful content or failed placeholder content, and surface an error/retry state in the ticket detail view.
- Reuse the existing draft intake, research context, `TicketDraftSchema`, and `markdownFromDraft` behavior; do not introduce a divergent draft format.

## Acceptance Criteria

- A user can open an eligible ticket and click Redraft to start a new async draft run for that same ticket.
- The ticket keeps its existing ID and board relationship after redraft succeeds.
- A successful redraft replaces the generated ticket content and metadata with the new draft output.
- A failed redraft does not overwrite or delete the prior recoverable ticket content and presents an actionable retry/error state.
- The implementation uses the existing Codex draft schema, markdown conversion, research-aware draft context, and async start-result pattern.

## Test Plan

- Run the existing ticket IPC/service tests covering draft creation, then add or update tests for successful redraft replacing an existing ticket in place.
- Add a failure-path test where Codex redraft parsing or execution fails and assert the previous ticket title/body/metadata remain unchanged and retry remains possible.
- Add a UI/component test or focused manual validation for the ticket detail Redraft button states: visible, disabled while running, success refresh, and error retry.
- Run the project’s normal validation command for this area, likely `npm test` or the existing targeted test script documented in `package.json`.

## Implementation Notes

- Codebase finding: `src/main/ipc/methods/tickets.ts` already exposes ticket drafting IPC via `ticket:createDraft`, imports `TicketDraftStartResult`, and uses `createDraftIntake`, `storage`, and project path resolution for ticket operations.
- Codebase finding: `src/main/services/codex/index.ts` contains the Codex draft generation path using `CreateDraftInput`, `DraftIntakeAnswer`, `TicketDraftSchema`, and `markdownFromDraft`, which should be reused for redraft rather than creating a separate draft schema.
- Codebase finding: `src/main/services/codex/research.ts` defines `TicketDraftResearchContext` and `DEFAULT_TICKET_DRAFT_RESEARCH_LIMITS`; redraft should keep using the same research-aware draft context as initial draft generation.
- Codebase finding: Related completed task `tkt_01krc7d576324320f5tgxz030y` introduced asynchronous drafting with a pending ticket state, so redraft should follow the same non-blocking placeholder/progress behavior instead of synchronously waiting in the UI.
- Codebase finding: Related completed task `tkt_01kra5k0phx2f4p2b1w7f63ayd` made draft timeouts recoverable; redraft failure handling must preserve the previous ticket state so users can retry.
- Implementation: Add a main-process IPC/service entry point such as `ticket:redraft` in `src/main/ipc/methods/tickets.ts` that accepts an existing ticket ID plus optional draft intake overrides and returns the same async start-result shape as `ticket:createDraft`.
- Implementation: Extend the Codex drafting service in `src/main/services/codex/index.ts` so an existing ticket can be targeted by a draft run; persist the draft output to that ticket only after `TicketDraftSchema` parsing and markdown generation succeed.
- Implementation: Ensure redraft reuses `createDraftIntake` and research collection from `src/main/services/codex/research.ts`, seeding the original idea from the existing ticket's draft/original-idea metadata when no new prompt is supplied.
- Implementation: Update shared IPC/types for the redraft request/result alongside `TicketDraftStartResult`, keeping names consistent with existing ticket IPC conventions.
- Implementation: Update the ticket detail UI to render the Redraft button, wire it to the new IPC method, and handle idle/loading/success/error disabled states without changing the ticket ID or board column.
- Bounded research read only the first 7000 characters of the three most relevant files and stopped after scanning 90 candidate files, so exact UI component filenames were not confirmed. The backend entry points and shared service patterns were identified enough for implementation to start.
- The current placeholder ticket for this request is `tkt_01krhf2jbryw7c2199t7fqpha7`; it should be usable as a manual validation fixture if still present.

## Codex Handoff

### 5/13/2026, 9:15:30 PM

Summary of changes made:
- Added `ticket:redraft` IPC/API contract and preload wiring.
- Added `startTicketRedraftRun` in the Codex draft service, reusing the existing draft schema, research, async run events, and `applyTicketDraftToTicket`.
- Redraft now updates the same ticket in place on success and preserves prior content/title/labels/priority/status on failure while surfacing `draft_failed`.
- Added a Redraft button in ticket detail for eligible generated/failed draft tickets, with loading/disabled state when its redraft is active.
- Added focused backend and UI tests for redraft success, failure preservation, retryability, IPC registration, and eligibility.

Files changed:
- `src/shared/types.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/services/schemas.ts`
- `src/main/ipc/methods/tickets.ts`
- `src/main/services/codex/index.ts`
- `src/renderer/src/lib/relayQueries.ts`
- `src/renderer/src/App.tsx`
- `tests/ticket-draft.test.ts`
- `tests/ticket-draft-ui.test.tsx`

Commands run:
- `npm run typecheck`
- `node --import tsx --test ...` attempted, but `tsx` is not installed
- `npm test`
- Custom esbuild targeted test harness for `ticket-draft.test.ts`, `ticket-draft-ui.test.tsx`, and `ipc-contract.test.ts`
- `git diff --check -- ...`

Tests run and results:
- `npm run typecheck`: passed.
- Targeted esbuild harness: passed, 51 tests.
- `npm test`: failed due existing unrelated backend expectations around a `not_doing` workflow column / `.relay/project.json`; redraft-related tests passed in that run.

Subagent usage:
- none used.

Remaining risks or follow-up:
- Existing generated tickets do not always contain the original rough idea, so redraft falls back to the current generated ticket title and markdown as drafting context when no `Original Idea` section or override is available.
- Full-suite failure should be handled separately; it is outside this ticket’s touched files.


No Codex run has been started.
