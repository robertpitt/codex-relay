---
schemaVersion: 1
id: tkt_01krcvs1jze3j48t5rc4mycyt4
title: Enable same-column ticket drag reordering
ticketType: task
status: todo
position: 12000
priority: medium
labels:
  - frontend
  - backend
  - board
  - drag-and-drop
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T01:10:46.111Z'
updatedAt: '2026-05-12T01:15:39.257Z'
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krcvs1hwfga5trr620tjnk14
lastRunStartedAt: null
---
# Enable same-column ticket drag reordering

## Context

Users can already drag tickets between board columns, but dropping a ticket within its current column is a no-op. Implement same-column reordering by sending existing before/after move anchors from the renderer and making storage persist a new sparse numeric `position` even when the status does not change.

## Codebase Findings

- `src/renderer/src/App.tsx:494-545` defines `DroppableColumn`; the column itself is the only droppable target and ticket cards are just mapped in current position order.
- `src/renderer/src/App.tsx:603-640` defines `DraggableCard` with `useDraggable({ id: ticket.id })`; the drag handle exists, but cards are not sortable drop targets.
- `src/renderer/src/App.tsx:677-683` builds `orderedTickets` by grouping filtered board tickets per column and sorting by `ticket.position`; `src/renderer/src/App.tsx:823-827` passes each column only its ordered tickets.
- `src/renderer/src/App.tsx:810-837` wraps the board in `DndContext` with pointer sensors only and no sortable context or collision detection override.
- `src/renderer/src/App.tsx:3097-3105` treats `event.over.id` as a target status and returns early when `ticket.status === targetStatus`, which makes same-column drops no-op and cannot handle `over.id` being another ticket id.
- `src/shared/types.ts:355-361` already defines `TicketMoveInput` with optional `beforeTicketId` and `afterTicketId`; no new IPC shape is required for order anchors.
- `src/main/services/schemas.ts:422-428` already accepts optional `beforeTicketId` and `afterTicketId` in `ticketMoveInputSchema`.
- `src/main/ipc/methods/tickets.ts:163-171` parses `ticket:move`, calls storage `moveTicket`, reconciles queue state, then returns `readBoard`; the IPC path can already return the updated board after a reorder.
- `src/main/services/storage/index.ts:992-1002` has `calculatePosition` support for before/after anchor positions, but it does not validate anchors or exclude the moving ticket explicitly.
- `src/main/services/storage/index.ts:1013-1056` computes a new position only when `fromStatus !== targetStatus`; same-status moves preserve the old position even if anchors are provided.
- `src/main/services/storage/index.ts:1171-1178` passes `beforeTicketId` and `afterTicketId` from `moveTicket` into `transitionTicketStatus`, so the backend fix is localized to position calculation and transition logic.
- `package.json:21-24` already includes `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities`; use the existing sortable package instead of adding a new dependency.
- `tests/backend.test.ts:249-266` covers status-only manual moves, but there is no same-status reorder test yet.
- `tests/run-tests.mjs:11-30` bundles `backend.test.ts` and `ticket-draft-ui.test.tsx`, so focused backend and renderer helper coverage can be added without changing the test runner.
- Inspected src/renderer/src/App.tsx (Matched terms: let, tickets, same, board, column, drag, drop; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast).
- Inspected src/shared/types.ts (Matched terms: let, tickets, board, column; symbols: RELAY_SCHEMA_VERSION, RELAY_TODO_STATUS, RELAY_READY_STATUS, RELAY_IN_PROGRESS_STATUS).
- Inspected tests/keyboard-shortcuts.test.ts (Matched terms: let, tickets, board; symbols: KeyboardShortcutEvent, ShortcutDirection, FakeKeyboardShortcutEvent, target).
- Inspected tests/backend.test.ts (Matched terms: let, tickets, board, column; symbols: CodexRunDependencies, CreateCodexDependencies, CodexCliCandidate, createProject).
- Inspected src/main/ipc/methods/tickets.ts (Matched terms: let, tickets, board; symbols: AnyRelayIpcMethod, ticketIpcMethods, parsed, resolvedProjectPath).
- Inspected src/main/services/storage/index.ts (Matched terms: let, tickets, board, column; symbols: BoardSnapshot, ClarificationQuestion, ClarificationQuestionStore, ClarificationQuestionCreateInput).
- Research limitation: Code search stopped after scanning 160 candidate files.

## Requirements

- Dragging a ticket within the same board column and dropping it before/after another ticket must update the ticket order visible on the board.
- The reordered ticket order must persist through `ticket:move` by updating markdown front matter `position`, and must be reflected after `readBoard` reloads the project.
- Existing cross-column drag behavior must continue to change ticket status; detail actions that call `ticket.move({ targetStatus })` must continue working.
- Same-column reorders must not emit `ticket.status_changed` audit events because status is unchanged.
- Dropping a ticket onto itself, dropping without a valid target, or dropping without an actual order change must be a no-op in the renderer.
- Storage must reject invalid order anchors before writing: missing anchor ids, anchors in a different target status, duplicate before/after anchors, or anchors equal to the moving ticket.
- Use the existing sparse numeric `position` model; do not add a separate ordering file or schema version change.

## Implementation Plan

- Update `src/renderer/src/App.tsx` imports to use `closestCenter` from `@dnd-kit/core` and `SortableContext`, `useSortable`, `verticalListSortingStrategy`, and `arrayMove` from `@dnd-kit/sortable`.
- Convert `DraggableCard` from `useDraggable` to `useSortable({ id: ticket.id })`, applying sortable `transform`, `transition`, `isDragging`, and the existing handle listeners/attributes without changing the card open button behavior.
- Wrap each column’s ticket list in `DroppableColumn` with `SortableContext` using that column’s ordered ticket ids and `verticalListSortingStrategy`; keep `useDroppable({ id: column.id })` for empty/background column drops.
- Set `DndContext` collision detection to `closestCenter` so drag end events can resolve ticket targets reliably inside a column.
- Add an exported renderer helper near `BoardView`, for example `buildTicketMoveTarget(board, activeTicketId, overId)`, that resolves `overId` as either a ticket id or column id, derives `targetStatus`, and returns `{ ticketId, targetStatus, beforeTicketId, afterTicketId }` or `null`. For same-column ticket drops, use `arrayMove` over the full sorted column tickets and derive immediate previous as `afterTicketId` and immediate next as `beforeTicketId`; for same-column column-background drops, move to the end of that column when not already last.
- Update `App`’s `moveTicket` handler at `src/renderer/src/App.tsx:3097` to call the helper, return on `null`, then call `getRelayApi().ticket.move({ projectPath: selectedPath, ...target })`, set the returned board, and show the existing style of error toast if persistence fails.
- Update `src/main/services/storage/index.ts` so `calculatePosition` accepts the moving ticket id, excludes it from target-column anchor lookup, validates anchors, and computes the sparse position from `beforeTicketId`/`afterTicketId` using current semantics: before-only means just before that ticket, after-only means just after that ticket, both means between them.
- Update `transitionTicketStatus` so it recalculates position when either the status changes or an order anchor is provided. Keep the existing audit append guarded by `fromStatus !== targetStatus`; add a no-op return for same-status moves with no anchors.
- Keep `saveTicket`, detail `moveTicketTo`, queue reconciliation, and status-only `moveTicket` callers compatible by preserving optional anchors and default append behavior when no anchors are supplied.
- Add backend tests in `tests/backend.test.ts` for same-status `moveTicket` reorders using before/after anchors, persisted order after `readBoard`, and invalid anchor rejection without changing the original positions.
- Add renderer helper tests in `tests/ticket-draft-ui.test.tsx` for same-column reorder target derivation, no-op self drop, same-column append-to-end via column drop, and cross-column target status resolution.

## Test Plan

- Run `npm test` after adding backend and renderer helper coverage.
- Run `npm run typecheck`.
- Manually validate in the app that dragging a card within one column changes its order, reloads the board in that order, and dragging a card to a different column still changes status.

## Acceptance Criteria

- A ticket can be reordered within its current column by dragging the existing handle over another ticket or to the column end.
- After reordering, the board order is stable after `readBoard` or app reload because the moved ticket’s front matter `position` changed.
- Same-column reorder keeps the ticket `status` unchanged and does not create a `ticket.status_changed` audit event.
- Invalid or stale before/after anchors fail with a clear error and leave ticket positions unchanged.
- Existing status moves through drag-and-drop and detail buttons still work with no `beforeTicketId`/`afterTicketId`.
- `npm test` and `npm run typecheck` pass.

## Assumptions / Open Questions

- Pointer drag-and-drop is sufficient for this ticket; keyboard-based reorder controls are out of scope because the current board DnD only configures `PointerSensor`.
- Reordering uses the existing `position` field on ticket front matter with sparse numeric values rather than rewriting every ticket on each move.
- When search filtering is active, reorder anchors are computed against the full current column order so hidden tickets keep their relative positions while the moved ticket is placed relative to the visible drop target.
- No new audit event type is required for pure reorders.

## Implementation Notes

- Initial bounded research stopped after scanning 160 candidate files; supplemental targeted reads covered the renderer board DnD, IPC contract, schemas, storage transition path, styles, and relevant tests.
- `rg` was unavailable in this environment, so supplemental code search used `grep` and targeted line reads.
- The repo was dirty at draft time; preserve unrelated existing changes while implementing.

## Research Metadata

- File inspected: src/renderer/src/App.tsx - Matched terms: let, tickets, same, board, column, drag, drop; characters read: 12000; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast, LocalAgentProgress, TicketSuggestionCreateState
  Matched lines:
  - 1: import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
  - 3: import { useDraggable, useDroppable } from "@dnd-kit/core";
  - 29: import type { CSSProperties, DragEvent, KeyboardEvent, ReactElement } from "react";
- File inspected: src/shared/types.ts - Matched terms: let, tickets, board, column; characters read: 12000; symbols: RELAY_SCHEMA_VERSION, RELAY_TODO_STATUS, RELAY_READY_STATUS, RELAY_IN_PROGRESS_STATUS, RELAY_NEEDS_CLARIFICATION_STATUS, RELAY_REVIEW_STATUS
  Matched lines:
  - 8: export const RELAY_COMPLETED_STATUS = "completed";
  - 10: export const DEFAULT_COLUMNS: RelayColumn[] = [
  - 17: { id: RELAY_COMPLETED_STATUS, name: "Completed", position: 7000, terminal: true }
- File inspected: tests/keyboard-shortcuts.test.ts - Matched terms: let, tickets, board; characters read: 6294; symbols: KeyboardShortcutEvent, ShortcutDirection, FakeKeyboardShortcutEvent, target, keyboardEvent, defaultPrevented
  Matched lines:
  - 4: handleKeyboardShortcutKeyDown,
  - 5: isCreateTicketShortcut,
  - 8: type KeyboardShortcutEvent,
- File inspected: tests/backend.test.ts - Matched terms: let, tickets, board, column; characters read: 12000; symbols: CodexRunDependencies, CreateCodexDependencies, CodexCliCandidate, createProject, projectPath, auditEvents
  Matched lines:
  - 14: reconcileTicketQueueState,
  - 26: deleteTicket,
  - 32: readBoard,
- File inspected: src/main/ipc/methods/tickets.ts - Matched terms: let, tickets, board; characters read: 8237; symbols: AnyRelayIpcMethod, ticketIpcMethods, parsed, resolvedProjectPath, meta, saved
  Matched lines:
  - 1: import type { TicketDraftStartResult, TicketSuggestionsGenerateResult } from "../../../shared/types";
  - 4: generateTicketSuggestions,
  - 6: reconcileTicketQueueState,
- File inspected: src/main/services/storage/index.ts - Matched terms: let, tickets, board, column; characters read: 12000; symbols: BoardSnapshot, ClarificationQuestion, ClarificationQuestionStore, ClarificationQuestionCreateInput, CreateDraftInput, InvalidTicket
  Matched lines:
  - 4: DEFAULT_COLUMNS,
  - 11: type BoardSnapshot,
  - 22: type RelayColumn,
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

No Codex run has been started.
