---
schemaVersion: 1
id: tkt_01kra432ftt7pqebvxhahgn42n
title: >-
  Add Ticket Blocker Metadata and Start Guards for Tickets, Epics, and
  Subtickets
ticketType: task
status: completed
position: 33000
priority: medium
labels:
  - workflow
  - tickets
  - agent-readiness
  - epics
parentEpicId: null
subticketIds: []
createdAt: '2026-05-10T23:38:20.023Z'
updatedAt: '2026-05-11T19:11:01.970Z'
codexThreadId: 019e1864-861b-7cb1-8c9d-477de7608568
runStatus: completed
lastRunId: run_01krc690t82aj6j069btpdz2xv
---
# Add Ticket Blocker Metadata and Start Guards for Tickets, Epics, and Subtickets

## Context

Symphony's SPEC.md normalizes issue blockers and uses them during dispatch eligibility, including avoiding work on `Todo` issues that still have non-terminal blockers. Source: https://raw.githubusercontent.com/openai/symphony/refs/heads/main/SPEC.md

Relay does not need a full external issue model, but local tickets can still benefit from first-class blocker metadata. This helps users avoid starting Codex on work that depends on unfinished local tickets, epic tickets, or subtickets.

Relay already stores hierarchy metadata such as `parentEpicId` and `subticketIds`. Blocker support should work cleanly with that hierarchy without turning epics and subtickets into a separate dependency system.

## Requirements

- Add optional blocker metadata to Relay tickets in a backward-compatible way.
- Support blocker relationships where the blocked item or blocker item can be a regular ticket, an epic ticket, or a subticket.
- Let users choose one or more existing tickets, epic tickets, or subtickets as blockers from the ticket detail UI.
- Show enough context in blocker selectors and blocker summaries to distinguish epics, subtickets, and regular tickets with similar titles.
- Show blocked status on board cards and in ticket detail when any blocker is not in a terminal column.
- Show blocked status in epic-related views when an epic or one of its visible subtickets is blocked.
- Prevent `Start Codex` by default for blocked runnable tickets, including subtickets, and show which blockers are still active.
- If Relay supports starting Codex from epic-level actions, apply the same blocker guard there.
- Provide an explicit user override for starting a blocked ticket if product patterns support overrides; otherwise document that blockers are strict.
- Handle deleted or invalid blocker references gracefully.
- Handle blockers that point to deleted epics, deleted subtickets, or stale parent/subticket relationships without crashing the board or detail views.
- Prevent a ticket from directly blocking itself.
- Avoid creating special behavior where a parent epic automatically blocks its subtickets, or subtickets automatically block their parent epic, unless the user explicitly adds those blocker references.
- Keep blocker logic local to `.relay` ticket state; do not add external tracker dependencies.

## Acceptance Criteria

- Existing tickets without blocker metadata still parse and render normally.
- Existing epics and subtickets without blocker metadata still parse and render normally.
- A ticket can reference other local tickets, epic tickets, or subtickets as blockers and show their titles/statuses.
- An epic can be marked blocked by another local ticket, epic ticket, or subticket.
- A subticket can be marked blocked by another local ticket, epic ticket, or subticket.
- A blocked ticket or subticket cannot accidentally start a Codex run without the user seeing the blocker reason.
- If epic-level Codex start actions exist, a blocked epic cannot accidentally start a Codex run without the user seeing the blocker reason.
- Moving blocker tickets, epics, or subtickets into terminal columns updates the blocked item's eligibility on the next board refresh.
- Deleted or missing blocker tickets appear as warnings rather than crashing the board.
- Deleted or missing epic/subticket blocker references appear as warnings rather than crashing the board or epic views.
- Blocker displays make parent/child context clear enough that users can tell whether the blocker is an epic, a subticket, or a regular ticket.
- The project's standard validation command succeeds.

## Clarification Questions

- None.

## Implementation Notes

- The existing ticket front matter parser uses passthrough behavior, but shared TypeScript types and renderer forms should still be updated if blocker metadata becomes first-class.
- Treat terminal columns using `.relay/project.json` column metadata instead of hard-coding `completed`.
- Reuse existing hierarchy metadata such as `parentEpicId` and `subticketIds` when displaying blocker context for epics and subtickets.
- Store blocker references by stable local ticket id rather than by title, position, or parent relationship.
- Blocker eligibility should be based on the referenced blocker ticket's own status/column, not inferred from its parent epic or child subtickets.
- Avoid implementing dependency graphs, critical paths, automatic scheduling, inherited blockers, or automatic parent/child blocking in this ticket.

## Codex Handoff

### 5/11/2026, 8:07:45 PM

**Summary**
Added first-class local ticket blocker metadata via `blockedByIds`, with shared blocker resolution for tickets, epics, and subtickets. Blocked state now appears on board cards, ticket detail, parent epic rows, and visible subticket rows. `Start Codex` preflight now strictly blocks active blockers and reports the active blocker titles/statuses; stale or missing blocker references warn without crashing.

No override was added; blockers are strict until referenced blockers move to a terminal column.

**Files Changed**
- `src/shared/blockers.ts`
- `src/shared/types.ts`
- `src/main/services/schemas.ts`
- `src/main/services/storage/index.ts`
- `src/main/services/codex/index.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/styles.css`
- `tests/backend.test.ts`

**Commands Run**
- `git status --short`
- `find`, `grep`, and `sed` inspection commands
- `git diff --check -- ...`
- `npm run typecheck`
- `npm test`
- `npm run build`

**Tests**
- `npm run typecheck`: passed
- `npm test`: passed, 66 tests
- `npm run build`: passed

**Remaining Risks / Follow-Up**
- Existing unrelated worktree changes remain in `.relay/...` and `.effect/`; I left them untouched.
- Blocker overrides are intentionally not implemented because there is no existing Relay override pattern.


No Codex run has been started.
