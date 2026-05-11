---
schemaVersion: 1
id: tkt_01kra4gpaj1s0n7zygcqjf4dr7
title: Automate ticket swim-lane transitions during Codex execution
status: completed
position: 3000
priority: high
labels:
  - workflow
  - tickets
  - codex
  - ui
  - automation
createdAt: '2026-05-10T23:45:46.322Z'
updatedAt: '2026-05-10T23:57:59.533Z'
codexThreadId: 019e1448-9009-7071-a14f-cde9b9e023c1
runStatus: completed
lastRunId: run_01kra4zfy8v1b10ndrym0cyen2
---
# Automate ticket swim-lane transitions during Codex execution

## Context

Relay currently has board columns: Todo, In Progress, Needs Clarification, Not Doing, and Completed. The desired workflow is for Codex-driven ticket execution to update the ticket lifecycle as work progresses, including raising clarification questions that can be answered through the product UI.

## Requirements

- When Codex begins executing a ticket, the ticket is moved to In Progress automatically.
- When Codex determines it cannot continue without user input, the ticket is moved to Needs Clarification.
- Codex can attach one or more structured clarification questions to the ticket when moving it to Needs Clarification.
- Clarification questions are visible in the UI on the relevant ticket and can be answered through the UI/UX flow.
- Answers submitted in the UI are persisted against the originating question and made available to Codex when work resumes.
- When Codex completes the ticket, the ticket is moved to Completed automatically.
- Status changes and clarification question events should be recorded in a way that is auditable by users and developers.
- Existing board columns and manual ticket operations should continue to work without regression.

## Acceptance Criteria

- Starting Codex execution for a Todo ticket moves it to In Progress without requiring a manual board update.
- If Codex requests clarification, the ticket appears in Needs Clarification and displays the submitted questions in the ticket UI.
- A user can answer clarification questions from the UI, and the answers remain associated with the ticket.
- Codex can read or receive the submitted clarification answers before continuing execution.
- Completing Codex execution moves the ticket to Completed.
- Manual status changes still work for all existing columns.
- The UI clearly distinguishes unanswered and answered clarification questions.
- Automated status changes are tested at the backend or integration level, and the clarification UI flow is covered by at least one focused test.

## Clarification Questions

- Should answering all clarification questions automatically move the ticket back to In Progress, or should Codex explicitly move it when resuming?
- Should Codex be allowed to move tickets out of Not Doing, or should that column remain manual-only?
- Are clarification questions expected to support only plain text answers initially, or should they support structured answer types such as choices and boolean responses?

## Implementation Notes

- Model clarification questions as structured ticket-linked records rather than embedding them only in free-form comments.
- Prefer existing ticket status mutation paths so manual and automated transitions share validation and audit behavior.
- Add clear ownership metadata for automated events, such as actor = codex or source = agent_execution.
- Keep the initial UI simple: show pending questions on the ticket detail view with answer inputs and submitted answer state.
- Ensure the execution/resume path has a reliable way to fetch unanswered and answered clarification records for the active ticket.

## Codex Handoff

### 5/11/2026, 12:57:59 AM

**Summary**
Implemented automated Codex swim-lane lifecycle handling plus structured clarification records. Codex starts move tickets to `in_progress`, clarification requests move to `needs_clarification`, normal completion moves to `completed`, and clarification answers are loaded into the resume prompt. I also added `.relay/audit.jsonl` event logging for status and clarification events.

**Files Changed**
- [src/shared/types.ts](/Users/robertpitt/Projects/relay/src/shared/types.ts)
- [src/main/services/storage.ts](/Users/robertpitt/Projects/relay/src/main/services/storage.ts)
- [src/main/services/codex.ts](/Users/robertpitt/Projects/relay/src/main/services/codex.ts)
- [src/main/services/clarificationParser.ts](/Users/robertpitt/Projects/relay/src/main/services/clarificationParser.ts)
- [src/main/services/schemas.ts](/Users/robertpitt/Projects/relay/src/main/services/schemas.ts)
- [src/main/index.ts](/Users/robertpitt/Projects/relay/src/main/index.ts)
- [src/preload/index.ts](/Users/robertpitt/Projects/relay/src/preload/index.ts)
- [src/renderer/src/App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx)
- [src/renderer/src/components/ClarificationPanel.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/components/ClarificationPanel.tsx)
- [src/renderer/src/styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css)
- [tests/backend.test.ts](/Users/robertpitt/Projects/relay/tests/backend.test.ts)
- [tests/clarification-panel.test.tsx](/Users/robertpitt/Projects/relay/tests/clarification-panel.test.tsx)
- [tests/run-tests.mjs](/Users/robertpitt/Projects/relay/tests/run-tests.mjs)
- [package.json](/Users/robertpitt/Projects/relay/package.json)
- [tsconfig.json](/Users/robertpitt/Projects/relay/tsconfig.json)

**Commands Run**
- `npm run typecheck`
- `npm test`
- `npm run build`
- plus inspection commands: `find`, `grep`, `sed`, `git status --short`

**Tests Run**
- `npm run typecheck`: passed
- `npm test`: passed, 4 tests
- `npm run build`: passed

**Remaining Risks**
The implementation uses plain-text clarification answers only, keeps `Not Doing` manual-only for Codex starts, and requires Codex to emit the documented `relay-clarification` fenced JSON block to create structured questions.


No Codex run has been started.
