---
schemaVersion: 1
id: tkt_01krdw9nfgd71mt8kp8pyk1wb7
title: 'Improve ticket detail loading, hierarchy, and epic relationship panels'
ticketType: task
status: todo
position: 17000
priority: medium
labels:
  - frontend
  - ticket-detail
  - epic
  - ui-polish
  - accessibility
parentEpicId: tkt_01krdtm7bz1j098hdxjvj2js8m
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T10:39:05.200Z'
updatedAt: '2026-05-12T10:39:05.200Z'
codexThreadId: null
runStatus: idle
lastRunId: null
lastRunStartedAt: null
---
# Improve ticket detail loading, hierarchy, and epic relationship panels

## Parent Epic

Frontend refinement and completion pass

## Context

Make the ticket detail drawer feel more complete and easier to scan, especially while loading and when displaying blockers, parent epics, subtickets, clarifications, and agent update sections.

## Codebase Findings

- `src/renderer/src/App.tsx:1725`-`2904` implements `TicketDetail` and owns ticket loading, saving, run controls, update-agent controls, attachments, blockers, subtickets, and panel visibility.
- `src/renderer/src/App.tsx:1900`-`1962` derives draft/run state, linked subtickets, parent epic, blocker resolution, blocker candidates, linkable task tickets, clarification counts, and status availability.
- `src/renderer/src/App.tsx:2395`-`2400` renders ticket-detail loading as only a spinner inside `.detail-panel`.
- `src/renderer/src/App.tsx:2403`-`2508` renders detail header, run controls, save controls, compact blocker/subtask/tag controls, and draft warnings.
- `src/renderer/src/App.tsx:2559`-`2737` renders blocker manager, parent epic row, subticket list, add-subticket form, and link-existing form.
- `src/renderer/src/App.tsx:2739`-`2852` renders `ClarificationPanel`, agent ticket update controls, ticket metadata fields, Markdown editor, and preview.
- `src/renderer/src/components/ClarificationPanel.tsx:14`-`72` is already extracted and returns null when no questions are present.
- `src/renderer/src/styles.css:1792`-`2318` styles the detail drawer, detail actions, compact action buttons, epic link panels, subticket rows, blocker rows, add-subticket form, clarification panel, ticket update panel, and draft loading panel.
- `tests/ticket-draft-ui.test.tsx:83`-`92` covers `DraftingTicketDetailLoading`, but there is no equivalent named loading component for normal ticket-detail loading.

## Requirements

- Replace the bare ticket-detail loading spinner with an accessible loading component that includes a label and short text while preserving the detail drawer layout.
- Add a compact metadata row near the detail header that surfaces ticket type, current board status, priority, and label count without duplicating editable fields lower in the drawer.
- Parent epic, subticket, and blocker rows must handle long titles/status names without grid overlap and include useful labels/titles for row actions.
- The add-subticket/link-existing area must keep its existing create/link behavior but feel visually connected to the subticket panel and remain usable on narrow widths.
- Do not change ticket save payloads, subticket creation/link/unlink APIs, blocker persistence, clarification submission, attachment handling, or Codex run/update controls.

## Implementation Plan

- Add and export a `TicketDetailLoading` component near `DraftingTicketDetailLoading` in `src/renderer/src/App.tsx:251`-`260`, then use it in place of the bare spinner at `src/renderer/src/App.tsx:2395`-`2400`.
- Add a compact, read-only detail metadata row in `TicketDetail` after the header at `src/renderer/src/App.tsx:2403`-`2421`, using existing `ticketTypeLabel`, `statusName`, priority pill styles, and label count from `labelCount`.
- Update parent epic, subticket, and blocker row markup at `src/renderer/src/App.tsx:2559`-`2737` with non-behavioral accessibility attributes such as `aria-label`/`title` for open, remove, unlink, create, and link actions where the visible text can truncate.
- Refine `.detail-panel`, `.detail-header`, `.detail-actions`, `.ticket-detail-actions-row`, `.epic-link-panel`, `.subticket-row`, `.blocker-main`, `.add-subticket-panel`, and `.link-existing-row` in `src/renderer/src/styles.css:1792`-`2119` for hierarchy, spacing, truncation, and mobile grid behavior.
- Extend `tests/ticket-draft-ui.test.tsx` with static-render coverage for the new `TicketDetailLoading` component and any exported helper used for detail metadata labels.
- Run `npm run typecheck` and `npm test`.

## Test Plan

- Run `npm test -- tests/ticket-draft-ui.test.tsx` if supported; otherwise run `npm test`.
- Run `npm run typecheck`.
- Manual check with `npm run dev`: open a task, an epic with no subtickets, an epic with multiple subtickets, a task with a parent epic, a blocked ticket, and a ticket with pending clarifications.

## Acceptance Criteria

- Ticket detail loading state includes accessible text and no longer renders as a lone spinner.
- Detail header shows compact metadata for type/status/priority/label count without changing editable form fields.
- Long parent epic, subticket, and blocker titles truncate or wrap intentionally without overlapping status/priority/remove controls.
- Subticket create/link controls retain existing behavior and remain usable at narrow widths.
- Existing clarification, blocker, subticket, attachment, save, and Codex run/update behavior remains intact.

## Assumptions / Open Questions

- Ticket detail should remain a right-side drawer on desktop and full-screen on narrow screens, matching existing CSS at `styles.css:2967`-`2972`.
- The metadata row should be read-only; edits still happen through the existing fields lower in the drawer.

## Implementation Notes

- Keep behavioral changes out of this task; the goal is presentation, accessibility metadata, and loading/completeness polish.

## Codex Handoff

No Codex run has been started.
