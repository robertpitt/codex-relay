---
schemaVersion: 1
id: tkt_01krbcxevws5hfzvnm82ed8z4m
title: Make Board Cards Static and Crisp-Bordered
status: completed
position: 18000
priority: medium
labels:
  - ui
  - ux
  - frontend
  - renderer
  - polish
createdAt: '2026-05-11T11:31:47.708Z'
updatedAt: '2026-05-11T11:35:29.952Z'
codexThreadId: 019e16ce-cc03-7813-9369-cc59761665b9
runStatus: completed
lastRunId: run_01krbcxjx4d5rsr18v59db6tq9
---
# Make Board Cards Static and Crisp-Bordered

## Context

Relay board cards currently expand on hover and show a subtle lighting/shadow artifact. The requested change is to make cards default to their expanded presentation so scrolling and hovering do not cause layout shifts, and to replace shadow-like card effects with a plain card background plus a thin, crisp border.

## Research Findings

- SPEC.md defines Relay as a local-first desktop application whose primary surface is a project board rather than a chat list; card interactions should support stable, repeated board scanning.
- README.md describes Relay as an Electron, React, TypeScript desktop app for managing software work as kanban cards, so this is a renderer/UI change rather than a data-model change.
- src/renderer/src/styles.css contains global Relay styling and design tokens such as --relay-font-sans and is a likely place to inspect for card shadows, hover transitions, borders, transforms, or height changes.
- src/shared/types.ts defines DEFAULT_COLUMNS for the board columns; the visual behavior should apply consistently to cards across all columns, not only one board state.
- Bounded research did not identify the exact React card component file. Implementation should locate the board/card component and its CSS classes before editing.

## Requirements

- Board cards must render in their expanded state by default, including any details or actions currently revealed only on hover.
- Hovering, focusing, or moving the pointer across cards must not change card height, width, spacing, scale, transform, max-height, or visible content in a way that shifts surrounding layout.
- Remove card shadow, glow, sheen, gradient highlight, or lighting-artifact effects from normal, hover, active, and selected card states unless a state indicator is functionally required.
- Use a plain card background consistent with the existing app theme and add a thin, crisp border around each card.
- Preserve existing card content, click behavior, drag/drop behavior if present, keyboard accessibility, and run/status indicators.
- Apply the change across all board columns and card variants, including empty/long/active/run-state cards where applicable.

## Implementation Plan

- Locate the board card component and associated styles by searching the renderer for card class names, hover selectors, shadow tokens, transform/scale transitions, max-height transitions, and board column/card components.
- Identify what content is currently hidden or collapsed until hover, then make that content part of the default card layout without requiring hover state.
- Remove or neutralize CSS rules that change card dimensions or content visibility on :hover, :focus-within, selected, or drag-adjacent states; keep non-layout-affecting affordances only if they are subtle and necessary.
- Replace card box-shadow/glow/background-highlight rules with a stable plain background and a 1px-style border using existing theme variables where possible.
- Review dark/light theme behavior if Relay supports theme preferences, ensuring the border has enough contrast without becoming visually heavy.
- Test the board manually with multiple cards in multiple columns by scrolling and moving the pointer across cards to confirm no layout shift occurs.
- Run the project’s relevant lint/typecheck/test command after changes, or document if no suitable command is available.

## Acceptance Criteria

- Cards appear expanded immediately on board load with no hover required to reveal the expanded content.
- Pointer hover over cards does not cause neighboring cards, columns, or scroll position to shift.
- No visible shadow, glow, sheen, or lighting artifact remains on cards in default or hover states.
- Each card has a clean plain background and a thin crisp border that works in the supported theme(s).
- Existing card actions, status badges, selection, drag/drop, and click behavior continue to work.
- A coding agent can verify the change by opening the Relay board, scrolling through cards, and moving the pointer across cards without seeing layout movement.

## Clarification Questions

- Should selected or actively running cards keep any special visual treatment, such as border color only, or should all card states use the same plain border treatment?

## Implementation Notes

- Keep this scoped to board card presentation; do not change ticket data structures, DEFAULT_COLUMNS, persistence, or Codex run behavior.
- Prefer existing renderer styling conventions and theme variables from src/renderer/src/styles.css instead of introducing a new design system.
- If the card expansion is implemented in React state rather than CSS hover alone, remove the hover-driven expansion state while preserving any real selection or action state.
- Avoid replacing shadows with heavy borders; the requested look is plain background plus a thin crisp line.

## Research Metadata

- File inspected: SPEC.md - Matched terms: just, relay, desktop, app, two; characters read: 12000; symbols: RelayCodexInput, RelayCodexThreadOptions, RelayCodexRunOptions, RelayCodexEvent, CodexClient, and
- File inspected: src/renderer/src/styles.css - Matched terms: just, relay, app; characters read: 12000
- File inspected: src/shared/types.ts - Matched terms: relay, app, two; characters read: 10485; symbols: RELAY_SCHEMA_VERSION, DEFAULT_COLUMNS, TicketPriority, RunStatus, ProjectHealth, ThemePreference
- File inspected: src/main/index.ts - Matched terms: relay, app; characters read: 8252; symbols: MessageBoxOptions, OpenDialogOptions, __dirname, mainWindow, createWindow, registerIpc
- File inspected: README.md - Matched terms: relay, desktop, app; characters read: 8905
- File inspected: src/preload/index.ts - Matched terms: relay, app; characters read: 3093; symbols: api, wrapped

## Codex Handoff

### 5/11/2026, 12:35:29 PM

**Summary**
Made board cards static and border-only: excerpts now render at the expanded 4-line presentation by default, labels and drag handles are always visible, card hover/focus no longer changes height, transform, max-height, shadows, gradients, or revealed content. Keyboard focus/selected/dragging states now use border color only. Removed the extra drag rotate/scale while keeping DnD transform movement.

**Files Changed**
- [App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx)
- [styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css)

**Commands Run**
- Attempted `rg`; unavailable in this shell, so used `grep`, `find`, `sed`, `cat package.json`, `git status --short`, and `git diff` for inspection.
- `npm run typecheck`
- `npm test`
- `npm run build`

**Tests**
- `npm run typecheck`: passed.
- `npm test`: passed, 36/36 tests.
- `npm run build`: passed.

**Remaining Risks / Follow-up**
- I did not perform an interactive Electron hover/scroll pass in the running app from this tool session. Static inspection and build/tests confirm the card hover expansion/shadow rules are removed.
- The worktree already had unrelated changes before this ticket; I only touched the card drag transform and card presentation CSS.


No Codex run has been started.
