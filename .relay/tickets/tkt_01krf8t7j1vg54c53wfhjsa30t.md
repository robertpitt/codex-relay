---
schemaVersion: 1
id: tkt_01krf8t7j1vg54c53wfhjsa30t
title: Replace Create Ticket modal with floating ticket input bar
ticketType: task
status: review
position: 1000
priority: high
effort: medium
labels:
  - frontend
  - ticket-creation
  - ux
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-12T23:37:05.345Z'
updatedAt: '2026-05-12T23:48:20.786Z'
authoringState: ready
codexThreadId: 019e1e91-4d0b-7a62-9b6e-edd766b2db59
runStatus: completed
lastRunId: run_01krf92jtt9p4hpqpe5dv5vv24
lastRunStartedAt: '2026-05-12T23:41:39.297Z'
---
# Replace Create Ticket modal with floating ticket input bar

## Context

Replace the topbar Create Ticket button and modal creation flow with a persistent bottom-center floating input bar for drafting tickets from a rough idea. The bar should be visually lightweight, support compact metadata controls, and submit via an icon button or Cmd+Enter/Ctrl+Enter while preserving multi-line text entry.

## Goal

Remove the visible Create Ticket topbar button and stop opening a create-ticket modal for normal ticket creation.

## Decisions / Assumptions

- The floating bar should create agent-drafted pending tickets only; manual title/label creation from the old modal is intentionally removed with the dialog.
- Mode defaults to Task rather than Auto, per clarification, even though the current modal has an Auto draft scope option.
- Priority should be passed through if the createDraft API supports it; if not currently accepted by the IPC contract, extend the contract/backend conservatively so the selected priority is applied to the pending draft metadata or generated ticket where appropriate.
- The existing Generate Tickets modal remains unchanged; only the Create Ticket dialog/button are removed.

## Requirements

- Remove the visible Create Ticket topbar button and stop opening a create-ticket modal for normal ticket creation.
- Add a bottom-center floating ticket input bar when a board/project is selected; it should contain the textarea, compact inline controls labeled visually as Type, Mode, Priority, and Effort with down-arrow affordance, and a compact icon submit button.
- Use Mode for drafting scope with choices Quick Bug, Task, Product Feature, Rewrite/Refactor, and Epic, defaulting to Task; use Type for existing Task/Epic ticket type, defaulting to Task.
- Submit the idea through the existing agent draft createDraft flow using selected type/scope/priority/effort where supported; Enter inserts a newline, Cmd+Enter/Ctrl+Enter submits, and empty/whitespace ideas cannot submit.
- The textarea should auto-grow with content up to about 100 text lines, then become internally scrollable; the bar should be transparent by default, less transparent on hover, and use a clean thin bordered focus state.

## Acceptance Criteria

- The board no longer shows a Create Ticket button in the topbar and no CreateTicketModal/backdrop appears for creating a ticket.
- A floating bottom-center input bar is available on project boards, accepts multi-line ideas, and remains visually unobtrusive until hover/focus.
- Type, Mode, Priority, and Effort can be changed from compact controls without visible field labels beyond the requested short control text.
- Clicking the submit icon or pressing Cmd+Enter/Ctrl+Enter starts the existing background agent draft flow, refreshes the board, clears or resets the composer after accepted submission, and shows existing success/error toast behavior.
- Plain Enter inserts a newline; long input grows the textarea up to the configured maximum and then scrolls internally.

## Test Plan

- Run npm test after implementation.
- Add/update renderer tests in tests/ticket-draft-ui.test.tsx for floating bar static markup/control labels and absence of the topbar Create Ticket button if practical with existing server-render tests.
- Update tests/keyboard-shortcuts.test.ts to cover Cmd/Ctrl+Space focusing/opening the floating composer behavior if exposed through helpers, and add coverage for Cmd/Ctrl+Enter submit vs Enter newline where the logic is factored into a testable helper.
- Update tests/create-ticket-mention-layout.test.ts or adjacent tests if menu positioning helper changes for the bottom floating bar.
- Run npm run typecheck to catch React prop/state refactor errors.

## Implementation Notes

- Codebase finding: src/renderer/src/App.tsx:1183 currently renders the topbar Create Ticket button with Plus icon, Cmd/Ctrl+Space shortcut hint, and onCreate callback.
- Codebase finding: src/renderer/src/App.tsx:1674 defines CreateTicketModal; it owns idea, ticketType, draftScopeOverride, manualPriority, manualEffort, draft status, ticket reference menu state, and Escape overlay behavior.
- Codebase finding: src/renderer/src/App.tsx:1945 and src/renderer/src/App.tsx:1977 contain the existing createDraft calls used by agent drafting; successful submission closes the modal, refreshes the board, and shows an info toast.
- Codebase finding: src/renderer/src/App.tsx:2168 renders the modal textarea, ticket-reference mention menu, Draft with Agent button, and Type/Draft Mode/Priority/Effort controls; src/renderer/src/App.tsx:2273 also supports manual Title/Labels fields that are only needed for modal/manual creation.
- Codebase finding: src/renderer/src/App.tsx:4018 registers Cmd/Ctrl+Space to set createOpen=true, and src/renderer/src/App.tsx:4119 conditionally renders CreateTicketModal; src/renderer/src/lib/keyboardShortcuts.tsx:119 defines the shortcut matcher.
- Implementation: Refactor the reusable draft submission and ticket-reference editor logic out of CreateTicketModal into a new floating-bar component or shared hooks inside src/renderer/src/App.tsx, keeping createDraft request sequencing, stale-result protection, toasts, and refreshAll behavior.
- Implementation: Remove BoardView's Create Ticket button rendering and onCreate prop usage; keep Generate Tickets and repository chat controls unchanged.
- Implementation: Replace App's createOpen state/modal rendering with a focusable floating create bar rendered when board and selectedPath exist; update modal-open class logic and ticketNavigationEnabled so the board remains usable while the bar is present.
- Implementation: Wire Cmd/Ctrl+Space to focus the floating textarea instead of opening a modal, and add local textarea key handling so Cmd+Enter/Ctrl+Enter submits while plain Enter creates new lines and ticket-reference menu Enter behavior still takes precedence when the menu is open.
- Implementation: Map controls to existing metadata: Type uses ticketTypeOptions, Mode uses draftScopeOptions without Auto and defaults to task, Priority uses priorityOptions, Effort uses ticketEffortOptions/defaultTicketEffort; when Mode is Epic, set/prefer epic ticket type consistently with existing ticketTypeForDraftScope behavior.
- Bounded research found the main affected surface in src/renderer/src/App.tsx and src/renderer/src/styles.css; code search was limited and used grep because rg is unavailable in this environment.
- Check src/shared/ipc.ts and backend createDraft input handling while implementing priority support, because the current App.tsx call at lines 1950-1957 sends effort/preferredTicketType/draftScope but not manualPriority.

## Codex Handoff

### 5/13/2026, 12:48:20 AM

**Summary**
- Removed the visible topbar `Create Ticket` action and stopped wiring the normal create flow to modal state.
- Added a persistent bottom-center floating ticket composer with multiline textarea, Type/Mode/Priority/Effort controls, submit icon, `Cmd/Ctrl+Enter` submission, and `Cmd/Ctrl+Space` focus.
- Routed composer submissions through existing `ticket.createDraft`, including selected type/scope/priority/effort.
- Extended `CreateDraftInput` schema/storage so selected priority is applied to pending draft tickets.
- Added renderer and shortcut tests for the floating composer and submit shortcut, plus draft priority coverage.

**Files Changed**
- `src/renderer/src/App.tsx`
- `src/renderer/src/styles.css`
- `src/renderer/src/lib/keyboardShortcuts.tsx`
- `src/shared/types.ts`
- `src/main/services/schemas.ts`
- `src/main/services/storage/filesystem.ts`
- `tests/keyboard-shortcuts.test.ts`
- `tests/ticket-draft-ui.test.tsx`
- `tests/ticket-draft.test.ts`

**Commands Run**
- `npm run typecheck`
- `npm test`
- Also tried `node --import tsx --test ...`, but this repo does not have `tsx`; switched to the repo’s `npm test` runner.

**Tests**
- `npm run typecheck`: passed
- `npm test`: passed, 153 tests passing
- The direct `node --import tsx --test ...` attempt failed because `tsx` is not installed; not a product test failure.

**Subagent Usage**
- none used

**Remaining Risks / Follow-Up**
- The old `CreateTicketModal` implementation is now disconnected from normal app flow but still exists as dead code in `App.tsx`; I left it intact to avoid a large unrelated deletion of exported/test-adjacent draft UI helpers.
- The working tree also has `.relay/` metadata/run files modified or untracked; I did not edit or revert those.


No Codex run has been started.
