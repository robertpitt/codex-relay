---
schemaVersion: 1
id: tkt_01krewzayqm33ehhce46ghebf1
title: >-
  Replace Codex UI wording, add ticket Effort setting, and clean up Create
  Ticket dialog
ticketType: task
status: completed
position: 61000
priority: medium
labels: []
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T20:10:09.751Z'
updatedAt: '2026-05-12T20:57:50.873Z'
codexThreadId: 019e1deb-13fb-7bc0-9a66-331c524053a5
runStatus: completed
lastRunId: run_01kreyp20hqwfzbpas3e0barhr
lastRunStartedAt: '2026-05-12T20:40:05.221Z'
---
## Original Idea

1. Update the UI so user-facing copy is not prefixed with or centered on the word "Codex". Use more generic agent terminology, such as changing "Start Codex" to "Start Agent".
2. Introduce an Effort option on tickets and during ticket creation. Effort should default from project-level configuration in `.relay/project.json`, defaulting to Medium when no project default is set.
3. Clean up the Create Ticket dialog so the Details textarea is the central focus. Place it directly below the card header, make it full width with a capped height, and organize compact dropdown/options controls below it.

## Requirements

### Generic Agent Wording

- Replace user-facing UI labels that unnecessarily prefix or refer to actions as "Codex" with generic agent terminology.
- Example: change "Start Codex" to "Start Agent".
- Keep references to Codex only where they are specifically about Codex execution metadata, logs, provider details, or other technically accurate implementation/runtime concepts.

### Ticket Effort Setting

- Add Effort as ticket metadata.
- Supported Effort values should include Low, Medium, High, and Extra High.
- The project-level default Effort should be stored under `.relay/project.json`.
- When creating a ticket, the Effort selector should default from the project config, falling back to Medium if no project default exists.
- The selected Effort should be persisted on the ticket.
- The persisted ticket Effort should be used as the default for later agent runner / implementation runs.
- Ticket Effort must remain editable after creation. For example, if a draft was created with Extra High, the ticket should default later agent runs to Extra High, but the user can change that option on the ticket.
- Use one shared Effort value for drafting and implementation rather than separate Draft Effort and Implementation Effort controls.

### Create Ticket Dialog Cleanup

- Make the Details textarea the primary control in the Create Ticket dialog.
- Place Details directly below the card/dialog header.
- Make Details full width with a capped height so it stays prominent without consuming the entire dialog.
- Move secondary options below Details.
- Present secondary options as compact dropdowns/selections so they take up less space.
- Include Effort as one of the compact ticket creation options.

## Clarification Answers

- Effort should be persisted on the ticket, with its default configured at the project level.
- The ticket's selected Effort should become the default for later agent runner runs, while remaining editable on the ticket.
- Use a shared Effort setting for drafting and implementation.

## Research Metadata

- No research metadata recorded.

## Codex Handoff

### 5/12/2026, 9:57:01 PM

Implemented the ticket.

**Summary**
- Reworded user-facing Codex action/copy to generic agent terminology while keeping technical Codex runtime/status/log references.
- Added persisted ticket `effort` metadata with `low`, `medium`, `high`, `xhigh` values and project default `settings.defaultTicketEffort`.
- Wired ticket effort into draft intake, draft generation, and implementation run thread options.
- Added editable Effort controls in ticket creation and ticket detail.
- Reworked the Create Ticket dialog so Details is the primary full-width textarea, with compact options below it.

**Files Changed**
- `src/shared/types.ts`
- `src/main/services/schemas.ts`
- `src/main/services/storage/index.ts`
- `src/main/services/codex/index.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/lib/agentProgress.ts`
- `src/renderer/src/styles.css`
- `tests/backend.test.ts`
- `tests/schemas.test.ts`
- `tests/ticket-draft.test.ts`
- `tests/ticket-draft-ui.test.tsx`

Existing dirty Relay runtime/clarification files were already present and left in place.

**Commands Run**
- `git status --short`
- `find` / `grep` / `sed` / `git diff` inspection commands
- `npm run typecheck`
- `npm test`
- `git diff --check`
- `git diff --stat`
- `git diff --name-only`

`rg` was not installed, so I used `find`/`grep`.

**Tests**
- `npm run typecheck`: passed after fixing one test typing issue.
- `npm test`: passed, `144` tests, `0` failures.
- `git diff --check`: passed.

**Subagent Usage**
- none used

**Remaining Risks**
- No browser visual pass was run; coverage is from typecheck, unit tests, and static review.


Clarifications have been answered. Implementation can proceed from the requirements above.
