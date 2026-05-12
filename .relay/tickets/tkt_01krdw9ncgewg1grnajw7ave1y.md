---
schemaVersion: 1
id: tkt_01krdw9ncgewg1grnajw7ave1y
title: 'Tighten app shell, sidebar, and topbar responsiveness'
ticketType: task
status: completed
position: 53000
priority: medium
labels:
  - frontend
  - responsive
  - ui-polish
parentEpicId: tkt_01krdtm7bz1j098hdxjvj2js8m
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T10:39:05.104Z'
updatedAt: '2026-05-12T12:07:30.435Z'
codexThreadId: 019e1bc6-dff4-7c93-9284-8ad162cb02dd
runStatus: completed
lastRunId: run_01krdwdq7f3xm5q3wfzz1vf4eb
lastRunStartedAt: '2026-05-12T10:41:18.268Z'
---
# Tighten app shell, sidebar, and topbar responsiveness

## Parent Epic

Frontend refinement and completion pass

## Context

Make the main app chrome feel stable and complete across desktop and narrow windows without changing project selection, board loading, or shortcut behavior.

## Codebase Findings

- `src/renderer/src/App.tsx:353`-`490` renders `ProjectSidebar`, including project folder disclosure buttons, swimlane rows, an empty swimlane fallback, and selected-project `Reveal`/`Remove` actions.
- `src/renderer/src/App.tsx:756`-`793` renders the board topbar with project title/path, `GitMetadataPill`, search, generate, and create buttons.
- `src/renderer/src/App.tsx:3130`-`3168` composes `ProjectSidebar`, `BoardView`, and the no-project empty state.
- `src/renderer/src/styles.css:257`-`620` styles the app shell, sidebar, topbar, topbar actions, project metadata, and search input.
- `src/renderer/src/styles.css:2875`-`3049` defines current responsive behavior for 900px, 700px, and 520px breakpoints.
- `tests/project-sidebar.test.tsx:44`-`79` already validates sidebar disclosure labels, swimlane visibility, zero-count lanes, and active run indicators.

## Requirements

- Long project names and paths must truncate or wrap intentionally without forcing topbar or sidebar overflow.
- The search control and topbar buttons must remain usable at 900px, 700px, and 520px breakpoints.
- The create-ticket shortcut `<kbd>` may be hidden or moved at narrow widths, but the button title and `aria-keyshortcuts` behavior must remain intact.
- Sidebar project rows, swimlane counts, active run indicators, and `Reveal`/`Remove` actions must remain accessible and reachable on narrow screens.
- Do not change project selection, project removal, folder reveal, board loading, or Git metadata fetching behavior.

## Implementation Plan

- Add class names around the topbar title/meta group and individual topbar controls in `BoardView` at `src/renderer/src/App.tsx:756`-`793` so CSS can size them independently.
- Update `ProjectSidebar` markup only where needed for stable sizing of project rows, swimlane lists, and bottom actions while preserving the existing roles and aria attributes at `src/renderer/src/App.tsx:402`-`489`.
- Update `src/renderer/src/styles.css:257`-`620` so `.app-shell`, `.sidebar`, `.topbar`, `.project-header-meta`, `.topbar-actions`, and `.search` use `min-width: 0`, stable wrapping, and predictable truncation.
- Update responsive rules in `src/renderer/src/styles.css:2875`-`3049` so narrow layouts stack actions cleanly, keep sidebar actions visible, and avoid text/button overlap.
- Extend `tests/project-sidebar.test.tsx` with a long project/swimlane name case that proves disclosure labels remain present and rows render without dropping counts or active indicators.
- Run `npm run typecheck` and `npm test`.

## Test Plan

- Run `npm test -- tests/project-sidebar.test.tsx` if the runner supports file filtering; otherwise run `npm test`.
- Run `npm run typecheck`.
- Manual check with `npm run dev`: verify the sidebar and topbar at about 1200px, 900px, 700px, and 520px widths with a long project path and at least one active run.

## Acceptance Criteria

- Topbar controls never overlap the project title/path/Git pill at supported breakpoints.
- Search, Generate Tickets, and Create Ticket remain visible and clickable on desktop and narrow layouts.
- Project rows and swimlane rows preserve existing accessible disclosure/count labels and truncate long text cleanly.
- The no-project empty state remains centered and the Add Project button remains usable.
- Existing sidebar tests pass, including the new long-label coverage.

## Assumptions / Open Questions

- The sidebar should remain visible on narrow screens rather than becoming a hidden drawer.
- No new responsive breakpoint system is required beyond refining the existing 900px, 700px, and 520px media queries.

## Implementation Notes

- Keep this task focused on layout and accessibility polish for shell/sidebar/topbar chrome; leave board card styling, modals, ticket detail, and toast behavior to the sibling subtickets.

## Codex Handoff

### 5/12/2026, 11:52:56 AM

**Summary**
Implemented the app chrome responsiveness pass: added sizing hooks in [App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx:429), tightened sidebar/topbar truncation and wrapping in [styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css:293), and added long-label sidebar coverage in [project-sidebar.test.tsx](/Users/robertpitt/Projects/relay/tests/project-sidebar.test.tsx:81). Existing selection, reveal/remove, board loading, shortcuts, and Git metadata behavior were left unchanged.

**Files Changed**
- [src/renderer/src/App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx:429)
- [src/renderer/src/styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css:293)
- [tests/project-sidebar.test.tsx](/Users/robertpitt/Projects/relay/tests/project-sidebar.test.tsx:81)

**Commands Run**
- `git status --short`
- `sed`, `grep`, `find`, `nl`, `git diff` for inspection
- `npm test`
- `npm run typecheck`
- `npm run dev`
- `npm run dev -- --host 127.0.0.1`
- `npm run build`

**Tests**
- `npm test`: passed, 116/116 tests. Existing esbuild warning about `import.meta` in CJS test output remains non-fatal.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run dev`: blocked by sandbox bind error `listen EPERM ::1:5173`.
- `npm run dev -- --host 127.0.0.1`: blocked because `electron-vite dev` does not accept `--host`.

**Subagent Usage**
None used. The changes were small and tightly coupled across one component, CSS, and its existing test.

**Remaining Risks**
The width-by-width visual manual check could not be completed here because the dev server cannot bind in this sandbox and the browser automation backend is not exposed in this session. Pre-existing `.relay` metadata changes were present before this work and were left untouched.


No Codex run has been started.
