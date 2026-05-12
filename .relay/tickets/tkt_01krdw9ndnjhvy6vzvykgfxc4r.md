---
schemaVersion: 1
id: tkt_01krdw9ndnjhvy6vzvykgfxc4r
title: 'Refine board cards, metadata pills, and empty column states'
ticketType: task
status: completed
position: 52000
priority: medium
labels:
  - frontend
  - board
  - ui-polish
  - accessibility
parentEpicId: tkt_01krdtm7bz1j098hdxjvj2js8m
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T10:39:05.141Z'
updatedAt: '2026-05-12T12:07:26.071Z'
codexThreadId: 019e1bd1-8787-7412-b123-5eba65c5c6cf
runStatus: completed
lastRunId: run_01krdwenyd5g3cyy543ttn9g6q
lastRunStartedAt: '2026-05-12T10:52:56.985Z'
---
# Refine board cards, metadata pills, and empty column states

## Parent Epic

Frontend refinement and completion pass

## Context

Make the kanban board easier to scan by improving status-specific empty states, card metadata clarity, label overflow affordances, and focus/drag visual states.

## Codebase Findings

- `src/renderer/src/App.tsx:325`-`328` defines `emptyColumnMessage(columnName)` with a generic `{column} is clear` title and identical detail for every column.
- `src/renderer/src/App.tsx:494`-`545` renders `DroppableColumn`, including the empty-column block at lines 537-542.
- `src/renderer/src/App.tsx:548`-`600` renders `TicketCardContent`; it shows epic/subticket pills, blocker pills, high/urgent priority, non-idle run status, elapsed runtime, two visible labels, and a `+N` overflow count.
- `src/renderer/src/App.tsx:603`-`640` renders `DraggableCard`, with a full-card open button and a separate drag handle.
- `src/renderer/src/styles.css:657`-`1047` styles the board grid, columns, empty columns, cards, metadata pills, labels, and drag handle.
- `tests/ticket-draft-ui.test.tsx:45`-`81` already covers `TicketCardContent` runtime metadata and hidden elapsed state.

## Requirements

- Use status-aware empty column copy for the standard board columns: Todo, Ready, In Progress, Needs Clarification, Review, Completed, and keep a safe generic fallback for custom column names.
- Keep cards dense: do not add full priority pills for low/medium priorities unless they are already shown elsewhere; high/urgent, relationship, blocker, and run states must stay visible.
- Make `+N` label overflow explain which labels are hidden through a `title` and accessible label.
- Ensure card focus, keyboard-selected, hover, and drag states are visually distinct without layout shift.
- Do not change drag/drop IDs, ticket ordering, ticket opening behavior, blocker resolution behavior, or elapsed runtime calculation.

## Implementation Plan

- Export `emptyColumnMessage` from `src/renderer/src/App.tsx:325` and update it to return status-aware copy from the column name with a generic fallback for custom columns.
- Update `TicketCardContent` at `src/renderer/src/App.tsx:548`-`600` so label overflow includes a useful `title` and `aria-label`, and compact pills include titles where the visible text is ambiguous.
- Update `DraggableCard` at `src/renderer/src/App.tsx:603`-`640` only for non-behavioral accessibility attributes such as clearer card/drag-handle labels if needed.
- Refine `.empty-column`, `.ticket-card`, `.card-open`, `.card-meta`, `.labels`, and `.drag-handle` in `src/renderer/src/styles.css:744`-`1047` for stable dimensions, focus clarity, and no layout shift.
- Extend `tests/ticket-draft-ui.test.tsx` with cases for status-aware `emptyColumnMessage` output and label overflow metadata on `TicketCardContent`.
- Run `npm run typecheck` and `npm test`.

## Test Plan

- Run `npm test -- tests/ticket-draft-ui.test.tsx` if file filtering is supported; otherwise run `npm test`.
- Run `npm run typecheck`.
- Manual check with `npm run dev`: verify empty Todo/Ready/In Progress/Needs Clarification/Review/Completed columns, focused cards, dragged cards, high/urgent tickets, blocked tickets, and cards with more than two labels.

## Acceptance Criteria

- Standard columns show distinct empty-state copy that matches the column's workflow purpose.
- Cards with hidden labels expose the hidden label names through title/accessible text while still rendering only two visible labels plus `+N`.
- Focused, keyboard-selected, hovered, and dragged cards remain visually distinct and do not resize the board.
- Existing card runtime and blocker metadata behavior remains intact.
- Updated `tests/ticket-draft-ui.test.tsx` coverage passes.

## Assumptions / Open Questions

- The existing choice to show only high/urgent priorities on board cards is intentional for scan density and should remain unchanged.
- Column names are the stable input for empty-copy mapping; custom columns should receive the generic fallback rather than failing.

## Implementation Notes

- This task should avoid broad component extraction; keep changes near `emptyColumnMessage`, `TicketCardContent`, `DraggableCard`, and the board/card CSS.

## Codex Handoff

### 5/12/2026, 12:04:53 PM

**Summary**
Implemented the board refinement pass: exported status-aware `emptyColumnMessage`, added hidden label names to `+N` overflow via `title` and `aria-label`, added compact pill titles/labels, kept high/urgent-only priority behavior, and refined card/drag/focus CSS states without layout-shifting borders.

**Files Changed**
- [App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx)
- [styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css)
- [ticket-draft-ui.test.tsx](/Users/robertpitt/Projects/relay/tests/ticket-draft-ui.test.tsx)

**Commands Run**
- Inspection: `git status --short`, `git diff`, `sed`, `grep`, `nl -ba`
- Validation: `npm run typecheck`, `npm test`

**Tests**
- `npm run typecheck`: passed
- `npm test`: passed, 119 tests. Existing esbuild `import.meta` warning appeared, but tests exited 0.

**Subagent Usage**
None used.

**Remaining Risks / Follow-Up**
Manual `npm run dev` visual verification was not run, so the hover/focus/drag styling is validated by code review and tests, not by an Electron UI pass. Existing unrelated dirty files and `.relay` artifacts were already present and left untouched.


No Codex run has been started.
