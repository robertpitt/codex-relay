---
schemaVersion: 1
id: tkt_01kre1ccbq3951e6msq1cbzky7
title: Make Project Sidebar Toggleable with Cmd+B
ticketType: task
status: completed
position: 54000
priority: medium
labels:
  - frontend
  - renderer
  - keyboard-shortcuts
  - accessibility
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T12:07:57.047Z'
updatedAt: '2026-05-12T13:00:05.147Z'
codexThreadId: 019e1c2d-0a09-7be0-929a-ed580b7c08eb
runStatus: completed
lastRunId: run_01kre2szbvcfdkb5r4e6tnef78
lastRunStartedAt: '2026-05-12T12:32:51.664Z'
---
# Make Project Sidebar Toggleable with Cmd+B

## Context

Add a local UI toggle for the Relay project sidebar so users can hide/show it from the keyboard and from visible controls. The sidebar should remain visible by default, preserve current app state when hidden, and use Relay's existing renderer shortcut infrastructure.

## Codebase Findings

- src/renderer/src/App.tsx:407 defines ProjectSidebar with projects, selectedPath, loading, onAdd, onSelect, onRemove, onReveal, and defaultExpandedProjectPaths props; it owns expandedProjectPaths state internally at src/renderer/src/App.tsx:426 and auto-expands the selected project at src/renderer/src/App.tsx:430.
- src/renderer/src/App.tsx:457 renders the project sidebar as <aside className="sidebar" aria-label="Projects">. The heading currently contains the Projects label and Add project icon button at src/renderer/src/App.tsx:458-462, and selected-project Reveal/Remove actions render at src/renderer/src/App.tsx:536-546.
- src/renderer/src/App.tsx:3006 wraps the app in KeyboardShortcutProvider, and RelayApp begins at src/renderer/src/App.tsx:3023 with renderer state for projects, selectedPath, board, createOpen, ticketSuggestionsOpen, and openTicketId.
- src/renderer/src/App.tsx:3217-3228 registers the existing Create Ticket shortcut through useKeyboardShortcut, using an enabled flag, matcher helper, and handler that returns true after updating state.
- src/renderer/src/App.tsx:3231 currently builds app-shell classes only from detail-open and modal-open states; ProjectSidebar is always rendered before BoardView/empty state at src/renderer/src/App.tsx:3232-3245.
- src/renderer/src/App.tsx:847-874 shows the topbar button accessibility pattern: buttons include titles, aria-keyshortcuts for shortcuts, icons from lucide-react, and a visible <kbd> shortcut label for Create Ticket.
- src/renderer/src/lib/keyboardShortcuts.tsx:75-79 has a private hasOnlyModifier helper for commandOrControl that requires exactly one of ctrlKey/metaKey and rejects alt/shift. src/renderer/src/lib/keyboardShortcuts.tsx:115-116 uses it for the Create Ticket shortcut.
- src/renderer/src/lib/keyboardShortcuts.tsx:138-172 dispatches shortcuts globally, ignores defaultPrevented/composing events, skips text-entry targets unless allowInTextEntry is set, and prevents default/stops propagation when a handler succeeds. The window keydown listener is installed at src/renderer/src/lib/keyboardShortcuts.tsx:198-213.
- tests/keyboard-shortcuts.test.ts:119-143 covers Create Ticket shortcut dispatch for Meta+Space/Ctrl+Space, and tests/keyboard-shortcuts.test.ts:145-198 confirms shortcuts are ignored for input, textarea, select, contenteditable, and role=textbox targets by default.
- tests/project-sidebar.test.tsx:26-42 has a renderSidebar helper for ProjectSidebar, with existing sidebar accessibility assertions at tests/project-sidebar.test.tsx:44-60 and long-label render coverage at tests/project-sidebar.test.tsx:81-108.
- src/renderer/src/styles.css:257-267 defines .app-shell as a two-column grid with a fixed 282px sidebar column and flexible workspace column. src/renderer/src/styles.css:293-308 defines .sidebar as a flex column with overflow hidden.
- src/renderer/src/styles.css:278-284 blurs/dims sidebar and workspace when detail-open or modal-open classes are present. Any collapsed state should compose with these classes without changing detail/modal behavior.
- src/renderer/src/styles.css:3101-3145 switches the shell to one column and two rows on narrow screens, with the sidebar becoming a capped horizontal top area; collapsed mobile CSS must override this so the workspace still fills the viewport when the sidebar is hidden.
- package.json:18 runs the bundled test suite with node tests/run-tests.mjs, and package.json:19 runs TypeScript validation with tsc --noEmit.
- package.json:29 already depends on lucide-react. The installed lucide-react package exports PanelLeftClose and PanelLeftOpen from node_modules/lucide-react/dist/esm/lucide-react.js:114-116.
- Inspected src/renderer/src/styles.css (Matched terms: sidebar, app).
- Inspected src/main/electron/ElectronApp.ts (Matched terms: app; symbols: ElectronAppPathName, ElectronAppService, ElectronApp, ElectronAppLive).
- Inspected tests/project-sidebar.test.tsx (Matched terms: sidebar, app; symbols: projectPath, project, renderSidebar, markup).
- Inspected src/main/services/runtime/appLayer.ts (Matched terms: app; symbols: ElectronDesktopLive, AppLayerLive, installAppRuntime, runtimeDisposed).
- Inspected src/main/services/registry/index.ts (Matched terms: sidebar, app; symbols: defaultRegistry, registryPath, readRegistryPromise, raw).
- Inspected src/preload/index.ts (Matched terms: sidebar, app; symbols: RelayIpcArgs, RelayIpcChannel, RelayIpcResult, invoke).
- Research limitation: Code search stopped after scanning 160 candidate files.

## Requirements

- Sidebar is visible by default on app startup and after reload; persistence across app restarts is not required.
- Add a Command/Ctrl+B sidebar toggle shortcut using Relay's existing commandOrControl shortcut behavior: Meta+B on macOS and Ctrl+B elsewhere should toggle; repeated keydown, alt/shift variants, and ctrl+meta together should not match.
- Do not enable the sidebar shortcut inside text entry targets. Leave allowInTextEntry unset so inputs, textareas, selects, contenteditable regions, and role=textbox keep their normal behavior.
- Add a visible icon-only sidebar hide control in the sidebar heading without removing or degrading the existing Add project button.
- When the sidebar is collapsed, provide a visible restore button that works even when no project is selected or the board topbar is not rendered.
- Use accessible labels, titles, aria-controls, aria-expanded, and aria-keyshortcuts="Meta+B Control+B" on the hide/show controls.
- Collapsing the sidebar must only affect visibility/layout. It must preserve selected project, loaded board, query, modal/detail state, and ProjectSidebar's expanded project state while hidden.
- When collapsed, the workspace must expand to the available shell area on desktop and mobile, with no empty 282px column or empty mobile top row left behind.
- Keep the existing detail-open/modal-open blur and status rail behavior intact.
- Use existing local patterns: lucide-react icons, clsx class composition, useKeyboardShortcut registration, and styles.css for layout changes.

## Implementation Plan

- In src/renderer/src/lib/keyboardShortcuts.tsx, export isSidebarToggleShortcut(event) and sidebarToggleShortcutLabel(platform = navigator.platform). Reuse normalizeKey and hasOnlyModifier; match key "b" case-insensitively, require !event.repeat, and use commandOrControl.
- In src/renderer/src/App.tsx, import PanelLeftClose and PanelLeftOpen from lucide-react, and import isSidebarToggleShortcut and sidebarToggleShortcutLabel from ./lib/keyboardShortcuts.
- In RelayApp, add sidebarCollapsed state plus a toggleSidebar useCallback. Register useKeyboardShortcut with id "toggle-sidebar", matcher isSidebarToggleShortcut, and a handler that toggles sidebarCollapsed and returns true. Do not set allowInTextEntry.
- Compute the sidebar shortcut label once in RelayApp with sidebarToggleShortcutLabel(), add sidebar-collapsed to the app-shell clsx when sidebarCollapsed is true, and keep ProjectSidebar mounted so its internal expandedProjectPaths state survives collapse/show cycles.
- Extend ProjectSidebar props with onToggleVisibility and toggleShortcutLabel. Add id="project-sidebar" to the aside. In the heading, add a sidebar-heading-actions wrapper containing a new hide button using PanelLeftClose plus the existing Add project button.
- Give the hide button className="sidebar-icon-button", aria-label/title like "Hide sidebar (⌘ B)" or "Hide sidebar (Ctrl B)", aria-controls="project-sidebar", aria-expanded={true}, and aria-keyshortcuts="Meta+B Control+B".
- In RelayApp, render a fixed restore button only when sidebarCollapsed is true. Use PanelLeftOpen, className such as sidebar-restore-button, onClick toggleSidebar, aria-label/title like "Show sidebar (⌘ B)", aria-controls="project-sidebar", aria-expanded={false}, and aria-keyshortcuts="Meta+B Control+B".
- In src/renderer/src/styles.css, add .sidebar-heading-actions styles so the new hide button and existing add button align cleanly in the heading without text overflow.
- In src/renderer/src/styles.css, add collapsed shell CSS: .app-shell.sidebar-collapsed uses grid-template-columns: minmax(0, 1fr); .app-shell.sidebar-collapsed > .sidebar uses display: none; and the workspace gets enough left padding or spacing so the restore button does not overlap the project title/empty state.
- In src/renderer/src/styles.css, add .sidebar-restore-button styling consistent with existing icon buttons: fixed near the top-left, small square hit target, z-index above workspace chrome but below modals/detail panels, focus-visible styling via existing button focus behavior, and responsive positioning.
- In the existing @media (max-width: 700px) block, add .app-shell.sidebar-collapsed { grid-template-rows: minmax(0, 1fr); } so the workspace fills the mobile viewport after the sidebar is hidden.
- Update tests/keyboard-shortcuts.test.ts to import and cover isSidebarToggleShortcut and sidebarToggleShortcutLabel, including Meta+B, Ctrl+B, repeat rejection, extra modifier rejection, and default text-entry suppression through handleKeyboardShortcutKeyDown.
- Update tests/project-sidebar.test.tsx renderSidebar helper for the new ProjectSidebar props and add assertions that the sidebar renders the hide button with the expected accessible label, aria-controls, aria-expanded, and aria-keyshortcuts while preserving existing Add project and disclosure markup.

## Test Plan

- Run npm run typecheck.
- Run npm test.
- Manual validation in npm run dev: open Relay, confirm the sidebar is visible initially, press Cmd+B on macOS or Ctrl+B on non-Mac to hide and show it, and verify the workspace fills the app shell.
- Manual validation: focus the search input and markdown/detail text areas, press Cmd+B/Ctrl+B, and confirm the sidebar does not toggle from text-entry contexts.
- Manual validation at a narrow viewport: collapse the sidebar and confirm no empty top row remains and the restore button does not overlap critical content.

## Acceptance Criteria

- Sidebar is visible by default and can be hidden and shown with Meta+B on macOS and Ctrl+B on non-Mac platforms.
- The sidebar shortcut is ignored while focus is in text-entry controls and does not hijack typing/editing contexts.
- A visible hide control exists in the sidebar heading, and a visible restore control exists while the sidebar is collapsed.
- Hide/show controls expose clear accessible labels, aria-controls="project-sidebar", correct aria-expanded state, aria-keyshortcuts="Meta+B Control+B", and useful titles.
- Collapsing the sidebar preserves the selected project, currently loaded board, query, open modal/detail state, and expanded project list state after the sidebar is shown again.
- When collapsed, the workspace occupies the available desktop and mobile layout space with no blank sidebar column or mobile sidebar row.
- Existing Create Ticket and ticket navigation shortcuts continue to pass their current tests.
- npm run typecheck and npm test pass.

## Assumptions / Open Questions

- Although the user named Cmd+B, Relay should follow its existing commandOrControl convention and support Ctrl+B on non-Mac platforms.
- Sidebar collapsed state is session-local React state and does not need to persist across app restarts.
- No Electron main-process menu or IPC changes are needed; the renderer window keydown shortcut infrastructure is sufficient.
- The shortcut should not run in text-entry contexts to avoid conflicting with expected editing behavior such as bold shortcuts in fields/editors.
- The restore button may be a compact icon-only fixed control rather than a full text button, matching existing icon-button patterns.

## Implementation Notes

- The current worktree is dirty and includes local modifications in src/renderer/src/App.tsx, src/renderer/src/styles.css, tests/project-sidebar.test.tsx, and tests/ticket-draft-ui.test.tsx. Preserve existing changes and avoid reverting unrelated work.
- The initial bounded search reported a scan limit; targeted follow-up reads covered the renderer app entry points, shortcut infrastructure, sidebar styles, and relevant tests needed for this ticket.
- rg is not available in the current shell, so targeted grep/find/nl commands were used for additional codebase research.

## Research Metadata

- File inspected: src/renderer/src/styles.css - Matched terms: sidebar, app; characters read: 12000
  Matched lines:
  - 4: Inter, "DM Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  - 8: --relay-sidebar: #121419;
  - 257: .app-shell {
- File inspected: src/main/electron/ElectronApp.ts - Matched terms: app; characters read: 1453; symbols: ElectronAppPathName, ElectronAppService, ElectronApp, ElectronAppLive, getElectronPath
  Matched lines:
  - 1: import { app } from "electron";
  - 4: export type ElectronAppPathName = "userData";
  - 6: export type ElectronAppService = {
- File inspected: tests/project-sidebar.test.tsx - Matched terms: sidebar, app; characters read: 3697; symbols: projectPath, project, renderSidebar, markup, longProjectName, longSwimlaneName
  Matched lines:
  - 4: import { ProjectSidebar } from "../src/renderer/src/App";
  - 7: const projectPath = "/tmp/relay-sidebar-project";
  - 10: projectId: "prj_sidebar",
- File inspected: src/main/services/runtime/appLayer.ts - Matched terms: app; characters read: 1393; symbols: ElectronDesktopLive, AppLayerLive, installAppRuntime, runtimeDisposed, disposeAppRuntime
  Matched lines:
  - 2: import { ElectronAppLive, ElectronDialogLive, ElectronIpcLive, ElectronShellLive, ElectronWindowLive } from "../../electron";
  - 14: ElectronAppLive,
  - 21: export const AppLayerLive = Layer.mergeAll(
- File inspected: src/main/services/registry/index.ts - Matched terms: sidebar, app; characters read: 4052; symbols: defaultRegistry, registryPath, readRegistryPromise, raw, writeRegistryPromise, target
  Matched lines:
  - 2: import type { AppRegistry } from "../../../shared/types";
  - 6: import { appRegistrySchema, parseSchema } from "../schemas";
  - 8: const defaultRegistry = (): AppRegistry => ({
- File inspected: src/preload/index.ts - Matched terms: sidebar, app; characters read: 4719; symbols: RelayIpcArgs, RelayIpcChannel, RelayIpcResult, invoke, api, wrapped
  Matched lines:
  - 12: RelayApprovalDecision,
  - 30: removeFromSidebar: (projectPath: string) => invoke(relayIpcChannels.projectsRemoveFromSidebar, projectPath),
  - 64: approveAction: (approvalId: string, decision: RelayApprovalDecision) => invoke(relayIpcChannels.codexApproveAction, approvalId, decision),
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

### 5/12/2026, 1:43:53 PM

Implemented the sidebar toggle.

**Summary**
- Added Cmd/Ctrl+B sidebar toggle via existing renderer shortcut infrastructure.
- Added sidebar hide button and fixed restore button with required labels, titles, `aria-controls`, `aria-expanded`, and `aria-keyshortcuts`.
- Kept `ProjectSidebar` mounted while collapsed so project expansion state is preserved.
- Added collapsed desktop/mobile CSS so the workspace fills the shell.
- Fixed Mac platform detection so `MacIntel` gets command-key labels.

**Files Changed**
- `src/renderer/src/App.tsx`
- `src/renderer/src/lib/keyboardShortcuts.tsx`
- `src/renderer/src/styles.css`
- `tests/keyboard-shortcuts.test.ts`
- `tests/project-sidebar.test.tsx`

Existing `.relay` metadata changes are still present in the worktree; I did not treat them as implementation files.

**Commands Run**
- `git status --short`
- targeted `sed`/`grep` inspections
- `git diff`
- `npm run typecheck`
- `npm test`
- `npm run dev`
- `HOST=127.0.0.1 npm run dev`

**Tests**
- `npm run typecheck`: passed
- `npm test`: passed, 124/124 tests
- `npm run dev`: main/preload builds succeeded, but Electron dev server failed to bind `::1:5173` with `EPERM` in this sandbox, so manual UI keyboard validation was blocked.

**Subagent Usage**
- none used

**Remaining Risks**
- Manual Electron interaction checks for Cmd+B/Ctrl+B and narrow viewport behavior still need to be performed outside the sandbox bind restriction.


No Codex run has been started.
