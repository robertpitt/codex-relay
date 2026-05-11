---
schemaVersion: 1
id: tkt_01krbf6mtmq3nghfg9adr81xh4
title: Add Epic Mode for Linked Subtickets and Agent-Created Epic Plans
status: completed
position: 24000
priority: medium
labels:
  - feature
  - tickets
  - epics
  - codex-agent
  - storage
  - ui
createdAt: '2026-05-11T12:11:45.876Z'
updatedAt: '2026-05-11T13:09:39.451Z'
codexThreadId: 019e171b-f95e-73d3-a079-7bfcd65143af
runStatus: completed
lastRunId: run_01krbhqy7wqzvn8zerw31abnwz
---
# Add Epic Mode for Linked Subtickets and Agent-Created Epic Plans

## Context

Relay should support an Epic ticket type for larger pieces of work. When creating a ticket, the user should be able to switch the ticket type to Epic. Epic tickets should allow linked subtickets to be added manually, and the Codex-powered ticket drafting flow should be able to generate the epic plus its subtickets in one creation flow.

## Research Findings

- SPEC.md: Relay explicitly needs a repeatable way to turn rough ideas into well-scoped tickets before asking Codex to implement them, and supports manual ticket creation plus Codex-powered ticket drafting chat.
- README.md: Relay stores board state locally in each project under `.relay/`, with tickets stored as Markdown files at `.relay/tickets/<ticket-id>.md` using YAML front matter; this feature should extend that local file model rather than introduce a database.
- src/shared/types.ts: Shared schema types define `RELAY_SCHEMA_VERSION`, `DEFAULT_COLUMNS`, ticket priorities, run statuses, and project settings; epic fields should be added here first so main and renderer code share the same contract.
- tests/ticket-draft.test.ts: Existing tests cover `createTicketDraft`, `draftToCreateInput`, and valid draft JSON from the agent. The drafting contract needs tests for epic output containing subtickets.
- tests/backend.test.ts: Backend tests already exercise `createTicket`, `createClarificationQuestions`, and `transitionTicketStatus`; storage and state transition tests should be expanded for epic/subticket relationships.
- src/main/services/codex.ts: The Codex service contains draft-related types/functions including `CreateDraftInput` and `createClarificationQuestions`; the agent prompt/schema should be updated so epic ticket creation can return a structured epic plus child tickets.
- No external URLs were provided or fetched for this ticket.

## Requirements

- Add a first-class ticket type field that supports at least `task` and `epic`, with existing tickets treated as normal task tickets for backward compatibility.
- Allow users creating a ticket manually to switch the ticket type to Epic before saving.
- For Epic tickets, provide an `Add Tickets` action that creates or links subtickets under the epic.
- Persist epic/subticket links in local Relay ticket storage so relationships survive app restart and project reload.
- Subtickets must remain normal board tickets with their own status, priority, labels, acceptance criteria, and implementation plan, while also referencing their parent epic.
- Epic tickets must display their linked subtickets in a way that makes each sub ticket's title, status, and priority visible and navigable.
- The Codex-powered ticket drafting flow must support generating an epic ticket and multiple subtickets from one rough idea.
- The agent-created epic flow must let the user review the epic and generated subtickets before committing them to storage.
- Deleting or unlinking a subticket must not delete the parent epic unless the user explicitly deletes the epic ticket itself.
- Existing non-epic ticket creation, ticket draft, board read, and status transition behavior must continue to work.

## Implementation Plan

- Extend shared ticket schema in `src/shared/types.ts` with a ticket type field and relationship fields such as `parentEpicId` on subtickets and `subticketIds` or derived child lookup support for epics.
- Update Markdown/YAML ticket serialization and parsing in the storage service so the new epic fields are persisted and older tickets without a type field load as normal task tickets.
- Add backend service operations for linking, unlinking, and creating subtickets under an epic, reusing existing `createTicket` behavior where possible.
- Update the manual ticket creation UI to include a ticket type selector with Task as the default and Epic as the alternate mode.
- Add Epic-specific UI on the ticket detail/create surface: an `Add Tickets` action, linked subticket list, and navigation from epic to subticket.
- Update the Codex ticket draft schema and prompt flow in `src/main/services/codex.ts` so the model can return either a single task ticket or an epic draft with child ticket drafts.
- Update `draftToCreateInput` and related draft creation logic so accepting an epic draft creates the parent epic first, then creates/link subtickets to that epic.
- Add validation to prevent invalid relationships such as an epic being linked as its own child, missing parent IDs, duplicate child links, or unsupported nested epic behavior unless nesting is intentionally supported.
- Expand `tests/ticket-draft.test.ts` with cases for valid epic draft JSON, epic draft conversion into create inputs, and rejection or clarification for malformed epic/subticket output.
- Expand backend/storage tests in `tests/backend.test.ts` or adjacent storage tests to verify persisted epic links, board reload behavior, status changes on subtickets, and backward compatibility for existing tickets.

## Acceptance Criteria

- A user can create a normal task ticket exactly as before.
- A user can switch a new ticket to Epic mode and save it as an epic ticket.
- An epic ticket can have one or more linked subtickets added manually.
- Linked subtickets appear on the epic ticket with enough metadata to identify and open them.
- Each subticket references its parent epic and remains independently movable across board columns.
- Reloading the project preserves epic/subticket relationships from `.relay/tickets/*.md`.
- The Codex ticket drafting flow can produce an epic draft with subtickets from the rough idea, and accepting the draft creates all related tickets.
- Existing ticket draft tests and backend tests pass, with new tests covering epic creation and relationships.
- Older projects/tickets without epic metadata still load without migration errors.

## Clarification Questions

- Should Relay support nested epics, or should epic subtickets always be normal task tickets for this first implementation?
- When an epic is moved to Completed, should Relay leave subtickets unchanged, warn if subtickets are incomplete, or offer to complete all subtickets?
- Should `Add Tickets` create brand-new subtickets only, or also allow linking existing tickets to an epic?

## Implementation Notes

- Prefer a minimal schema extension and backward-compatible defaults over a separate epic storage system.
- Keep relationship data human-readable in ticket front matter because Relay's current storage model is local Markdown files.
- If subticket ordering matters in the UI, store an ordered child ID list on the epic; otherwise derive children from `parentEpicId` to reduce duplication.
- Agent draft output should be strict structured JSON and should fail closed with clarification or validation errors when the model returns inconsistent epic relationships.

## Research Metadata

- File inspected: tests/ticket-draft.test.ts - Matched terms: create, tickets, idea; characters read: 12000; symbols: TicketDraftDependencies, readyStatus, createProject, projectPath, validDraftJson, prompt
- File inspected: SPEC.md - Matched terms: mode, create, sub, tickets, idea; characters read: 12000; symbols: RelayCodexInput, RelayCodexThreadOptions, RelayCodexRunOptions, RelayCodexEvent, CodexClient, and
- File inspected: src/shared/types.ts - Matched terms: mode, create, sub, tickets, idea; characters read: 10723; symbols: RELAY_SCHEMA_VERSION, DEFAULT_COLUMNS, TicketPriority, RunStatus, ProjectHealth, ThemePreference
- File inspected: tests/backend.test.ts - Matched terms: create, tickets, switch; characters read: 12000; symbols: CodexRunDependencies, createProject, projectPath, auditEvents, raw, allowNonGitRuns
- File inspected: README.md - Matched terms: mode, where, create, tickets, here; characters read: 8905
- File inspected: src/main/services/codex.ts - Matched terms: mode, create, tickets, idea; characters read: 12000; symbols: Thread, ThreadEvent, ThreadItem, ThreadOptions, ClarificationQuestion, CodexStatus

## Codex Handoff

### 5/11/2026, 2:09:39 PM

Implemented epic mode end to end.

**Summary**
- Added `task`/`epic` ticket typing plus `parentEpicId` and ordered `subticketIds` front matter.
- Added backend create/link/unlink subticket operations, including nested-epic/self-link validation and cleanup when subtickets or epics are deleted.
- Updated create UI with ticket type selection, manual ticket creation, epic draft review, and generated subticket review.
- Added epic detail UI for parent/child navigation, creating subtickets, linking existing task tickets, and unlinking without deletion.
- Updated Codex ticket drafting schema/prompt to support epic drafts with normal task subtickets.
- Added regression coverage for epic drafts, persisted relationships, reload behavior, independent child status moves, unlink/delete behavior, nested epic rejection, and legacy tickets without epic metadata.

**Files Changed**
- `src/shared/types.ts`
- `src/main/services/schemas.ts`
- `src/main/services/storage.ts`
- `src/main/services/codex.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/lib/markdown.ts`
- `src/renderer/src/styles.css`
- `tests/backend.test.ts`
- `tests/ticket-draft.test.ts`

**Commands Run**
- `find ...`, `sed ...`, `grep ...` for inspection
- `git status --short`
- `npm run typecheck`
- `npm test`
- `npm run build`

**Tests Run**
- `npm run typecheck`: passed
- `npm test`: passed, 51/51 tests
- `npm run build`: passed

**Remaining Risks / Follow-up**
- I did not manually smoke-test the Electron UI; verification is via typecheck, test suite, and production build.
- The worktree still has pre-existing unrelated `.relay` file/run changes that I did not modify or revert.


No Codex run has been started.
