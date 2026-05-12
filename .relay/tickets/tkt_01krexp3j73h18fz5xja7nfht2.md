---
schemaVersion: 1
id: tkt_01krexp3j73h18fz5xja7nfht2
title: Restore clarification answer UI in ticket detail modal
ticketType: task
status: completed
position: 62000
priority: high
labels:
  - frontend
  - ui
  - ticket-detail
  - clarification
  - regression
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T20:22:35.847Z'
updatedAt: '2026-05-12T20:58:13.504Z'
codexThreadId: 019e1de3-42a5-70e3-8dce-07725ba02540
runStatus: completed
lastRunId: run_01krey6g5538fz6w6ze5e4h624
lastRunStartedAt: '2026-05-12T20:31:33.302Z'
---
# Restore clarification answer UI in ticket detail modal

## Context

Regression after completed ticket `tkt_01krejavnr3q5jm9pve1c9hjyv`: agent-asked clarification questions are no longer visible or answerable from the redesigned near-full-screen ticket detail modal.

## Goal

Tickets with pending agent clarification questions must show the question text and answer composer prominently inside the ticket detail modal, without requiring the user to leave the dialog or hunt through the right sidebar.

## Decisions / Assumptions

- This is a renderer placement/visibility regression, not a backend persistence regression, because the current code already loads and submits clarifications.
- Pending clarifications are blocking content, so they should be promoted to the primary modal column ahead of ticket markdown/update content.
- Existing clarification storage, IPC channels, run preflight behavior, and ticket statuses are correct and out of scope.

## Requirements

- Tickets with pending agent clarification questions must show the question text and answer composer prominently inside the ticket detail modal, without requiring the user to leave the dialog or hunt through the right sidebar.
- Answer submission must continue to use the existing `ticket.answerClarification` renderer/API/IPC path, preserving toasts, refresh, `onChanged`, and draft auto-resume behavior.
- Preserve the near-full-screen two-column modal; avoid rendering duplicate editable answer controls for the same pending question.

## Acceptance Criteria

- Opening a ticket with a pending agent clarification displays the exact question and an answer input inside the ticket detail modal without leaving the dialog.
- Submitting an answer invokes the existing clarification answer path for the current project, ticket, question, and answer, then refreshes the modal state and preserves auto-resume behavior.
- The modal remains usable in the redesigned two-column layout, with metadata/activity still accessible and no duplicate pending answer forms.

## Test Plan

- Add a focused renderer static test in `tests/ticket-draft-ui.test.tsx` or a new small test for the exported presentational wrapper: with one pending clarification, assert the pending section contains the question text, answer textarea placeholder, and `Submit Answer` in the primary/modal content path.
- If `ClarificationPanel` gains props for pending/history modes, extend `tests/clarification-panel.test.tsx` to cover editable pending questions and non-editable answered history.
- Run `npm test` and `npm run typecheck`; manually validate with `npm run dev` by opening a ticket in Needs Clarification, confirming the question is visible near the top of the modal, entering an answer, and seeing the existing save/refresh behavior.

## Implementation Notes

- Codebase finding: `.relay/tickets/tkt_01krejavnr3q5jm9pve1c9hjyv.md:28` and `:75` define the redesign as a near-full-screen two-column modal and explicitly moved clarification UI into the right column with metadata/activity.
- Codebase finding: `src/renderer/src/App.tsx:2433-2448` loads ticket data and `ticket.clarifications`; `:2490-2502` reloads on `clarification.requested`; `:2602-2605` computes unanswered count. The primary column only shows a generic warning at `:3136-3140`; the actual answer UI is mounted later in the sidebar at `:3502-3508`.
- Codebase finding: `src/renderer/src/components/ClarificationPanel.tsx:21-31` hides only when no questions and shows answered count; `:40-63` renders question markdown, textarea, and `Submit Answer`. Existing coverage in `tests/clarification-panel.test.tsx:23-48` asserts answered/unanswered rendering.
- Implementation: In `src/renderer/src/App.tsx`, split `clarifications` into pending and answered lists near the existing `unansweredClarificationCount` logic, then render pending clarification questions in `.ticket-detail-primary` immediately after the current unanswered warning block around `:3136-3140`. Reuse `ClarificationPanel` if its current UI is sufficient, or add a focused presentational wrapper that passes the same `answerDrafts`, `submittingAnswerId`, draft-change handler, and `submitClarificationAnswer`.
- Implementation: Change the existing sidebar mount at `src/renderer/src/App.tsx:3502-3508` so the sidebar is no longer the only answer path: render it only when there are no pending questions, or render answered/history-only clarifications there if a small prop on `ClarificationPanel` is cleaner.
- Implementation: Update `src/renderer/src/styles.css` around the existing modal/sidebar and clarification rules (`:2342-2380`, `:2838-2944`) only as needed so the primary pending-clarification panel fits the modal scroll area and keeps the textarea/button usable on desktop and narrow widths.
- `rg` was unavailable in the local shell, so follow-up research used `find`/`grep`. The relevant renderer, CSS, IPC/API, and test paths were covered.
- `TicketDetail` is not exported (`src/renderer/src/App.tsx:2368`), so a small exported presentational wrapper may be the lowest-friction way to regression-test the modal placement without rendering the full API-backed detail component.
- Do not change backend contracts unless implementation uncovers a separate broken IPC path; current findings point to a frontend layout regression.

## Codex Handoff

### 5/12/2026, 9:36:16 PM

**Summary**
Implemented the modal regression fix by rendering pending clarifications in the primary ticket detail column before ticket markdown/update content, while keeping the existing `ticket.answerClarification` submission path intact. The sidebar now shows only answered clarification history when pending questions exist, avoiding duplicate editable answer forms.

**Files Changed**
- [App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx:485)
- [ClarificationPanel.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/components/ClarificationPanel.tsx:6)
- [styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css:2379)
- [ticket-draft-ui.test.tsx](/Users/robertpitt/Projects/relay/tests/ticket-draft-ui.test.tsx:219)
- [clarification-panel.test.tsx](/Users/robertpitt/Projects/relay/tests/clarification-panel.test.tsx:50)

**Commands Run**
- `rg ...` failed because `rg` is not installed in this shell; used `grep`, `sed`, `nl`, `git diff`, and `git status` for inspection.
- `npm test`
- `npm run typecheck`

**Tests**
- `npm test`: passed, 143/143 tests. Existing `import.meta` CJS warning appeared.
- `npm run typecheck`: passed.
- Manual `npm run dev` UI validation was not run.

**Subagent Usage**
None used.

**Remaining Risks**
Manual Electron validation is still the only unchecked item: opening a real Needs Clarification ticket and submitting an answer through the modal. Static renderer coverage now verifies the primary pending composer renders the question, textarea placeholder, and `Submit Answer`, and panel coverage verifies answered history is non-editable.


No Codex run has been started.
