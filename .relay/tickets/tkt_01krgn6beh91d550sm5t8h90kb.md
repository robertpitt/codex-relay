---
schemaVersion: 1
id: tkt_01krgn6beh91d550sm5t8h90kb
title: Add project header dropdown to open project in editor
ticketType: task
status: completed
position: 73000
priority: medium
effort: medium
labels:
  - renderer
  - ipc
  - desktop
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-13T12:32:39.889Z'
updatedAt: '2026-05-13T19:29:22.198Z'
authoringState: ready
codexThreadId: 019e216a-4c51-74d2-81df-e35b3aa72d2c
runStatus: completed
lastRunId: run_01krgpmhax9smmk3yy7k7s7y15
lastRunStartedAt: '2026-05-13T12:57:53.604Z'
---
# Add project header dropdown to open project in editor

## Context

Replace the active project path text under the project title with a compact dropdown control that opens the current project folder in VS Code or Cursor.

## Goal

Replace the project path subtitle in the active project header with a small dropdown button/control.

## Decisions / Assumptions

- Editor commands are `code` for VS Code and `cursor` for Cursor, available on the user’s PATH.
- The project path to open is the active project path already represented in `ProjectSummary`; no separate path lookup is required in the renderer.
- A compact text or icon+text dropdown is acceptable as long as it replaces the subtitle area and fits existing header styling.
- If no existing toast helper is available in the header area, use the nearest existing non-blocking renderer error pattern.

## Requirements

- Replace the project path subtitle in the active project header with a small dropdown button/control.
- Dropdown options must include fixed choices for VS Code and Cursor.
- Selecting an option must ask the main process to launch the selected editor for the current project path.
- If the editor cannot be launched, Relay must stay open and show a clear error/toast instead of failing silently.
- Do not add configurable editor registries, preferences, or auto-detection in this task.

## Acceptance Criteria

- The active project header shows a compact open-in-editor dropdown where the project path subtitle used to be.
- The dropdown includes VS Code and Cursor options.
- Selecting VS Code or Cursor attempts to open the active project folder in that editor via the main process.
- Unavailable commands or launch failures produce a visible non-blocking error/toast and do not crash or close Relay.
- Focused tests cover dropdown rendering and IPC call behavior.

## Test Plan

- Add or update a renderer test near `tests/project-sidebar.test.tsx` or the existing header/App test location to verify the raw project path subtitle is no longer rendered and the editor dropdown is present.
- Add a renderer interaction test that mocks the IPC bridge, selects VS Code and Cursor, and asserts the selected editor id plus active project path are sent.
- Add a main-process IPC unit test if an existing IPC test harness is present, covering command mapping and failure result behavior when spawn fails.
- Run focused renderer/header tests and any existing project IPC tests.
- Run the repo’s standard typecheck/test command if available.

## Implementation Notes

- Codebase finding: `src/main/ipc/methods/projects.ts` contains existing project IPC methods and already imports shared result types such as `AddProjectResult`; use this file for the main-process project editor launch method.
- Codebase finding: `src/main/ipc/methods/projects.ts` uses registry helpers such as `readRegistry`, `upsertProjectPath`, and `removeProjectPath`, confirming project-path operations are handled in project IPC rather than renderer-only code.
- Codebase finding: `src/renderer/src/styles.css` has global button styling around lines 96-103; new dropdown/button styling should align with existing button conventions.
- Codebase finding: `tests/project-sidebar.test.tsx` imports `ProjectSidebar` from `src/renderer/src/App` and `ProjectSummary` from `src/shared/types`, providing an existing renderer test pattern for project UI markup.
- Codebase finding: Bounded research identified likely affected areas as renderer project header/topbar UI, shared IPC types, and main-process project IPC methods; search stopped after 90 candidate files, so exact header component symbol was not confirmed.
- Implementation: Add shared IPC request/result types for opening a project in an editor, including editor ids `vscode` and `cursor`, a success/failure result shape, and a user-facing error message field.
- Implementation: Add a project IPC method in `src/main/ipc/methods/projects.ts` that validates editor id and project path, launches `code <projectPath>` for VS Code or `cursor <projectPath>` for Cursor using a safe child-process spawn pattern, and returns typed failure results on validation or spawn errors.
- Implementation: Expose/register the new IPC method through the existing Relay IPC/preload path used by project methods, following current naming and renderer call conventions.
- Implementation: Update the renderer project header/topbar component in `src/renderer/src/App` or its local child component so the path subtitle is replaced with a compact dropdown trigger containing VS Code and Cursor menu items, wired to the new IPC method with the active project path.
- Implementation: Use the existing renderer toast/error presentation pattern for returned failure messages, and add focused CSS in `src/renderer/src/styles.css` for the compact dropdown if existing classes are insufficient.
- Research was bounded by the drafting workflow; exact project-header symbol and IPC registration file should be resolved while applying the concrete changes above, not as open product discovery.
- Keep scope limited to fixed VS Code and Cursor support; defer custom editor configuration, editor availability detection UI, and persisted editor preferences.

## Codex Handoff

### 5/13/2026, 2:03:59 PM

Implemented the project header editor dropdown and IPC launch path.

**Summary of changes made**
- Replaced the active project path subtitle with a compact `Open in editor` dropdown containing `VS Code` and `Cursor`.
- Added renderer handling that calls `projects.openInEditor({ projectPath, editorId })` and shows existing toast errors on returned or thrown failures.
- Added shared IPC/API types and a new `projects:openInEditor` channel through preload.
- Added main-process project IPC launch logic mapping `vscode -> code` and `cursor -> cursor`.
- Kept raw process spawning behind the existing IO service boundary with `CommandExecutor.spawnDetached`.
- Added focused renderer and IPC tests for dropdown rendering, bridge-call behavior, command mapping, and spawn failure results.

**Files changed**
- `src/renderer/src/App.tsx`
- `src/renderer/src/styles.css`
- `src/shared/types.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/methods/projects.ts`
- `src/main/services/io/process.ts`
- `tests/project-sidebar.test.tsx`
- `tests/ipc-contract.test.ts`
- `tests/backend.test.ts`

**Commands run**
- `rg ...` / `rg --files ...` failed because `rg` is not installed.
- `find src tests -type f`
- `grep -RIn ...`
- Various `sed`, `nl`, `git diff`, and `git status` inspection commands.
- `npm test -- --test-name-pattern "project header|open-in-editor|IPC contract"`
- `npm run typecheck`
- `npm test`
- `node tests/run-tests.mjs`

**Tests run and results**
- `npm run typecheck`: passed.
- `node tests/run-tests.mjs`: new editor dropdown/IPC tests passed, import-boundary test passed, but the full suite still fails 5 existing backend tests around missing/unknown `not_doing` lane/status expectations.
- `npm test`: same full-suite behavior, because the test harness ignores the supplied name pattern and runs all tests.

**Subagent usage**
- none used

**Remaining risks or follow-up work**
- Full-suite green is blocked by unrelated existing `not_doing` lane/status test failures.
- I did not mark the ticket completed.


No Codex run has been started.
