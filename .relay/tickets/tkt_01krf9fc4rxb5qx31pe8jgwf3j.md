---
schemaVersion: 1
id: tkt_01krf9fc4rxb5qx31pe8jgwf3j
title: Reduce density and improve View Ticket dialog hierarchy
ticketType: task
status: in_progress
position: 1000
priority: medium
effort: high
labels:
  - frontend
  - ui
  - ticket-detail
  - accessibility
  - polish
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-12T23:48:38.168Z'
updatedAt: '2026-05-12T23:52:05.320Z'
authoringState: ready
codexThreadId: 019e1e9a-d98d-7791-a617-e70d82668e6a
runStatus: running
lastRunId: run_01krf9nnxnf37h7j18p00w9hwr
lastRunStartedAt: '2026-05-12T23:52:05.077Z'
---
# Reduce density and improve View Ticket dialog hierarchy

## Context

Refine the existing near-full-screen ticket detail modal so it reads less like a technical console and more like a focused work item view. Keep the current ticket storage, run/update/refinement flows, clarification handling, blocker logic, and Markdown editing behavior intact; this ticket is a frontend presentation and interaction pass for the View Ticket dialog.

## Goal

Rename the primary implementation CTA to explicit agent-oriented copy: use `Resume AI Agent` when resuming an existing Codex thread and `Start AI Agent` for a new run. Keep button behavior and disabled states unchanged.

## Decisions / Assumptions

- This ticket should not introduce board breadcrumbs, related-ticket previews, cross-ticket quick navigation, activity/comment tabs, or broader kanban model changes.
- A collapsible/lighter sidebar is sufficient for this pass; draggable panel resizing and a full focus-mode reader are out of scope unless they fall out trivially from the layout changes.
- Inline editable metadata can use compact selects/inputs rather than building a custom chip editor, because the existing state and validation already use standard form controls.
- Agent telemetry should remain available for debugging through Logs and a collapsed diagnostics area, but should not be the default visual emphasis in the sidebar.

## Requirements

- Rename the primary implementation CTA to explicit agent-oriented copy: use `Resume AI Agent` when resuming an existing Codex thread and `Start AI Agent` for a new run. Keep button behavior and disabled states unchanged.
- Reduce sidebar dependency by moving Status, Priority, Effort, and Labels into a compact editable metadata row directly under the ticket title/header area, reusing the existing state values and save semantics. Avoid introducing new persistence paths.
- Convert the sidebar details area into a lighter, collapsible/supporting area focused on blockers/subtasks/danger actions and optional metadata overflow rather than always showing a stacked form. The content column should feel wider and less crowded on desktop.
- Improve rendered ticket description readability by tuning `TicketMarkdownTabs`/`MarkdownBlock` styling for ticket detail preview: stronger text contrast, larger body copy where appropriate, clearer heading spacing, and better code/table/checklist scanning without changing Markdown parsing semantics.
- Simplify Agent Activity in the sidebar by showing a human-readable status and short recent activity timeline by default, while moving thread id, event counts, token usage, and other diagnostics behind progressive disclosure such as a collapsed `details` section or existing Logs entry point.

## Acceptance Criteria

- The View Ticket dialog has explicit primary CTA copy: no visible `Resume Implementation` or ambiguous `Implement` copy remains in the primary run action.
- Status, priority, effort, and labels are editable from a compact metadata area near the title and still save through the existing Save flow with unsaved-change protection.
- The right sidebar is visually lighter and no longer dominated by always-visible stacked metadata fields; blocker, clarification, agent activity, duplicate, and delete workflows remain reachable.
- Rendered ticket Markdown in preview mode is easier to scan, with improved contrast and hierarchy for headings, paragraphs, checklists, code blocks, and tables, without regressing unsafe-link handling or copy controls.
- Agent Activity defaults to human-readable progress/recent updates and keeps raw diagnostics available through progressive disclosure or Logs, rather than showing thread id/event/token telemetry as primary content.

## Test Plan

- Run `npm run typecheck`.
- Run `npm test`.
- Add/update component render assertions in `tests/agent-progress.test.tsx` to verify Agent Activity still exposes `Open Logs`, shows recent activity, and hides thread/token diagnostics behind a disclosure by default.
- Add/update render assertions in `tests/ticket-draft-ui.test.tsx` for any exported ticket detail subcomponents touched, especially `TicketMarkdownTabs` preview/edit behavior if class names or labels change.
- Manual validation in the app: open a normal ticket, a ticket with an existing `codexThreadId`, a running/drafting ticket, a ticket with pending clarifications, and an epic ticket; verify actions, save behavior, sidebar collapse/overflow, keyboard focus rings, and mobile layout.

## Implementation Notes

- Codebase finding: `src/renderer/src/App.tsx:3566-4112` renders the ticket detail dialog as `.detail-panel` with a header, `.ticket-detail-layout`, primary content column, and `.ticket-detail-sidebar`. The current header shows run/authoring/checklist/blocker pills at `3570-3578`, a large editable title input at `3583-3586`, and the close button at `3588-3590`.
- Codebase finding: `src/renderer/src/App.tsx:3594-3624` renders the dominant action row. The primary CTA currently says `Resume Implementation` when `frontMatter.codexThreadId` exists and `Implement` otherwise; both call `startRun(...)`.
- Codebase finding: `src/renderer/src/App.tsx:3775-3879` renders the sidebar metadata section as stacked form fields for Status, Priority, Effort, and Labels plus compact Blocker/Subtask/Tags buttons and blocker summary. These fields already use local state setters and participate in `hasUnsavedChanges` at `3118-3138` and `save` behavior.
- Codebase finding: `src/renderer/src/App.tsx:4087-4096` mounts `AgentActivityPanel` in the sidebar. `src/renderer/src/components/AgentActivity.tsx:218-296` currently shows `AgentProgressSummary`, optional `AgentRunSummaryDetails`, and recent events; `AgentRunSummaryDetails` exposes status, started/ended, duration, thread id, event count, and token usage at `113-162`.
- Codebase finding: `src/renderer/src/App.tsx:408-517` defines `TicketMarkdownTabs`; preview mode renders `MarkdownBlock` with title `Preview` at `476-482`, and edit mode renders the Markdown textarea at `499-511`. `MarkdownBlock` already supports headings, lists/checklists, blockquotes, code blocks, tables, safe links, and copy controls in `src/renderer/src/components/MarkdownBlock.tsx:341-486`, with coverage in `tests/markdown-block.test.tsx:34-77`.
- Implementation: In `src/renderer/src/App.tsx`, update the action row labels at the existing primary run button: `Resume AI Agent` for `ticket.frontMatter.codexThreadId` and `Start AI Agent` otherwise; optionally adjust the secondary fresh-thread label to `Start New Agent Thread` if space allows.
- Implementation: In `TicketDetail` in `src/renderer/src/App.tsx`, add a compact metadata strip under the editable title using the existing `status`, `priority`, `effort`, and `labels` state and setters. Use accessible labels or visually hidden text so the selects/input remain keyboard and screen-reader usable.
- Implementation: Refactor the current sidebar metadata block in `src/renderer/src/App.tsx:3775-3879` so the duplicated stacked Status/Priority/Effort/Labels form is removed or collapsed, while preserving blocker actions, subtask action for epics, tag focusing behavior if still needed, blocker summary, clarification panel, Agent Activity, duplicate, and delete controls.
- Implementation: Update `src/renderer/src/components/AgentActivity.tsx` so `AgentActivityPanel` presents a simpler default: status summary plus recent human-readable events. Move `AgentRunSummaryDetails` and low-level metrics such as thread id, event count, and token usage into an initially collapsed diagnostics/details section, keeping `Open Logs` available.
- Implementation: Update `src/renderer/src/styles.css` for the new metadata strip, reduced sidebar width/density, ticket-detail Markdown readability, activity diagnostics disclosure, contrast, and focus states. Keep existing mobile media behavior at `max-width: 860px` and `max-width: 520px` coherent with the new layout.
- Research was bounded and `rg` is unavailable in this environment, so searches used `grep`/`find`. The affected renderer files and tests above were directly inspected, but the scan was not exhaustive.
- The working tree already contains unrelated modified files and generated Relay artifacts; implementation should avoid reverting user changes and keep edits scoped to the renderer/test files required for this ticket.
- There is an existing Todo ticket, `tkt_01krf8jqh84mj5kxmhxb1f4wjx`, for expanded Markdown preview being obscured by the update composer. Do not fold that bug into this ticket unless a layout adjustment here naturally fixes it without extra scope.

## Codex Handoff

No Codex run has been started.
