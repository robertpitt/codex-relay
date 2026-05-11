---
schemaVersion: 1
id: tkt_01krbamaxqc3fjs926xbhy2ebx
title: Add expandable project swimlane counts to sidebar
status: completed
position: 16000
priority: medium
labels:
  - frontend
  - sidebar
  - projects
  - ux
createdAt: '2026-05-11T10:51:51.607Z'
updatedAt: '2026-05-11T11:05:56.723Z'
codexThreadId: 019e16b0-9f93-7151-92de-1ca48329f3c0
runStatus: completed
lastRunId: run_01krbb17sc5ddwr83k8czrnmq8
---
# Add expandable project swimlane counts to sidebar

## Context

Improve the Relay sidebar Projects section so users can quickly inspect each project's swimlanes and see how many tickets are in each lane without opening the project board first.

## Requirements

- Render each project in the sidebar as an expandable/collapsible parent item.
- When a project is expanded, display a nested list of that project's swimlanes.
- For each swimlane row, show the swimlane name and the number of tickets currently in that lane for that project.
- Include lanes with zero tickets so the sidebar reflects the full project structure.
- Keep existing project navigation, active states, permissions, and loading behavior intact.
- Ensure ticket counts update when tickets are created, deleted, moved between lanes, or reassigned to another project, using the app's existing state/query invalidation patterns.
- Use the existing sidebar styling and component conventions for hierarchy, spacing, icons, hover states, and selected states.
- Support keyboard and screen-reader accessibility for expanding/collapsing project rows.

## Acceptance Criteria

- A user can expand and collapse each project from the sidebar.
- Expanded projects show one nested row per swimlane with the lane name and ticket count.
- Ticket counts match the number of tickets in each swimlane for that specific project.
- Lanes with no tickets display a count of 0.
- Moving a ticket between swimlanes updates the affected counts without requiring a manual page refresh, assuming the app already supports live or query-driven updates elsewhere.
- Existing sidebar project selection/navigation continues to work as before.
- The expanded sidebar layout remains readable at supported sidebar widths and does not cause text/count overlap.
- Expand/collapse controls are operable by keyboard and expose appropriate accessible labels or aria state.

## Clarification Questions

- Should clicking a swimlane row filter/navigate the board to that swimlane, or should rows be display-only for this ticket?
- Should projects remember their expanded/collapsed state across page reloads or sessions?
- Should swimlanes be ordered by existing board order, alphabetically, or by ticket count?

## Implementation Notes

- Start by locating the existing sidebar Projects component and the data source used for project and ticket/board state.
- Prefer existing project, lane, and ticket query/state models rather than adding a separate fetch path if the data is already available.
- If ticket counts require aggregation, compute counts by project id and swimlane id/name in a memoized selector or equivalent local pattern.
- Use the project's existing icon/disclosure component if available; otherwise use a minimal chevron-style disclosure consistent with the sidebar.
- Add focused tests around the aggregation logic and a component test for expand/collapse rendering if the repo has frontend test coverage in place.

## Codex Handoff

### 5/11/2026, 12:05:56 PM

**Summary**
Implemented expandable Projects sidebar rows with a keyboard-accessible chevron disclosure. Expanded projects now show nested swimlane rows with ticket counts, including zero-count lanes, using the existing project summary/board data path. Counts refresh through existing board/project reloads and are also updated after drag-and-drop ticket moves.

**Files Changed**
- [src/shared/types.ts](/Users/robertpitt/Projects/relay/src/shared/types.ts)
- [src/main/services/storage.ts](/Users/robertpitt/Projects/relay/src/main/services/storage.ts)
- [src/renderer/src/App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx)
- [src/renderer/src/styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css)
- [tests/backend.test.ts](/Users/robertpitt/Projects/relay/tests/backend.test.ts)
- [tests/project-sidebar.test.tsx](/Users/robertpitt/Projects/relay/tests/project-sidebar.test.tsx)
- [tests/run-tests.mjs](/Users/robertpitt/Projects/relay/tests/run-tests.mjs)

**Commands Run**
- Discovery: `find`, `grep`, `sed`, `cat`, `git status --short`, `git diff`
- Note: `rg` was attempted first but is not installed in this workspace.
- Verification: `npm test`, `npm run typecheck`

**Tests**
- `npm test`: passed, 36/36 tests.
- `npm run typecheck`: passed.

**Remaining Risks**
No known implementation blockers. The worktree contains unrelated pre-existing changes and `.relay` artifacts outside this ticket; I left them untouched.


No Codex run has been started.
