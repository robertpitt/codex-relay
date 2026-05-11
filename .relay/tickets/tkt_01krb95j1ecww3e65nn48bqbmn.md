---
schemaVersion: 1
id: tkt_01krb95j1ecww3e65nn48bqbmn
title: >-
  Improve keyboard shortcuts for modal closing, ticket navigation, and ticket
  creation
status: completed
position: 14000
priority: medium
labels:
  - frontend
  - ux
  - accessibility
  - keyboard-shortcuts
createdAt: '2026-05-11T10:26:18.798Z'
updatedAt: '2026-05-11T10:37:28.468Z'
codexThreadId: 019e1694-8900-7fc0-96fb-c4e0be433cfa
runStatus: completed
lastRunId: run_01krb9924n6r102hd9v1ejdjs5
---
# Improve keyboard shortcuts for modal closing, ticket navigation, and ticket creation

## Context

Relay should support faster keyboard-driven workflows for common ticket board actions. The initial target shortcuts are Escape to close open modals, Tab-based navigation between tickets where appropriate, and Command+Space to open the Create Ticket flow. These bindings need to work predictably without breaking native focus behavior or accessibility expectations.

## Requirements

- Add a centralized keyboard shortcut handling approach that fits the existing frontend architecture.
- Support Escape to close the topmost open modal, dialog, popover, or drawer when it is safe to do so.
- When a modal has unsaved or in-progress input, Escape must not silently discard data; preserve the current app confirmation or cancellation behavior if one exists.
- Support keyboard navigation between tickets from the main board/list context.
- Avoid overriding native Tab focus traversal globally; if Tab is used for ticket navigation, scope it to the ticket browsing context or document the chosen alternative.
- Support opening the Create Ticket UI via a global shortcut, targeting Command+Space on macOS and Control/Meta-compatible behavior on other platforms if feasible.
- Ensure shortcuts do not fire while the user is typing in text inputs, textareas, editors, selects, or contenteditable elements, except for Escape where modal semantics require it.
- Expose shortcut behavior in any existing shortcut help, command palette, or relevant UI affordance if the app has one.
- Add or update tests for the shortcut behavior and important focus/input edge cases.

## Acceptance Criteria

- Pressing Escape closes the currently active modal/dialog without affecting the underlying page state.
- If multiple overlays are stacked, Escape closes only the topmost overlay first.
- Escape does not discard unsaved Create/Edit Ticket form content without the expected confirmation or preservation behavior.
- From the ticket board/list view, the user can move keyboard focus/selection between tickets using the agreed shortcut behavior.
- Ticket navigation does not break normal keyboard accessibility for tabbing through interactive controls.
- Pressing the agreed Create Ticket shortcut opens the Create Ticket modal or route from the main app context.
- The Create Ticket shortcut does not trigger while focus is inside normal typing fields.
- Automated tests cover Escape closing behavior, ticket-to-ticket navigation, Create Ticket shortcut opening, and ignored shortcuts inside text entry fields.

## Clarification Questions

- Should Tab literally move between tickets, or should Relay preserve Tab for accessibility focus traversal and use Arrow keys/J/K for ticket navigation instead?
- Command+Space is reserved by Spotlight on macOS in many environments. Should the app still attempt to support it, or use a fallback such as Command+K / Command+Shift+N?
- Which views should support ticket-to-ticket navigation: board columns only, ticket lists only, search results, or all ticket collections?

## Implementation Notes

- Look for existing modal/dialog, command palette, and keyboard listener patterns before adding new infrastructure.
- Prefer a single shortcut registry/hook/service over scattered window keydown handlers.
- Use platform-aware shortcut labels and detection where the app already distinguishes Mac vs Windows/Linux.
- Be careful with focus management after closing modals and after opening Create Ticket; focus should land on the expected control.
- Include regression coverage for shortcuts inside nested modals and active form fields.

## Codex Handoff

### 5/11/2026, 11:37:28 AM

**Summary of Changes**
- Added a centralized renderer shortcut registry with overlay priority handling and text-entry suppression.
- Wired `Escape` to close the topmost safe overlay, while preserving dirty Create/Edit Ticket input.
- Added Create Ticket shortcut support for `Cmd+Space` / `Ctrl+Space`.
- Added board-scoped ticket navigation with Arrow keys and `J`/`K`; `Tab` remains native focus traversal.
- Exposed/documented shortcut behavior in the UI and README.
- Added regression tests for shortcut dispatch and input edge cases.

**Files Changed**
- [App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx)
- [keyboardShortcuts.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/lib/keyboardShortcuts.tsx)
- [AgentActivity.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/components/AgentActivity.tsx)
- [styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css)
- [keyboard-shortcuts.test.ts](/Users/robertpitt/Projects/relay/tests/keyboard-shortcuts.test.ts)
- [run-tests.mjs](/Users/robertpitt/Projects/relay/tests/run-tests.mjs)
- [README.md](/Users/robertpitt/Projects/relay/README.md)

**Commands Run**
- Inspection: `find`, `grep`, `sed`, `git diff`, `git status --short`
- Verification: `npm run typecheck`, `npm test`, `git diff --check`
- Note: `rg` was attempted first but is not installed in this environment.

**Tests Run**
- `npm run typecheck`: passed.
- `npm test`: passed, 30/30 tests.
- `git diff --check`: passed.

**Remaining Risks / Follow-up**
- I did not manually run the Electron UI.
- `Cmd+Space` can be intercepted by macOS Spotlight/input-source settings, so Relay supports it when the app receives the key event, with `Ctrl+Space` also supported.
- The worktree already contains unrelated `.relay` and docs/theme changes; I left them intact.


No Codex run has been started.
