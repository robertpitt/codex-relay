---
schemaVersion: 1
id: tkt_01krbgz3ah5ezhw2gaye44hs42
title: Fix @ mention dropdown being hidden by create ticket modal footer
status: completed
position: 23000
priority: medium
labels:
  - bug
  - ui
  - create-ticket
  - modal
  - ticket-drafts
createdAt: '2026-05-11T12:42:35.729Z'
updatedAt: '2026-05-11T12:49:18.050Z'
codexThreadId: 019e170f-ab42-73c3-9caf-09358e9c2cc9
runStatus: completed
lastRunId: run_01krbgzanyh43qd1rc2as14xe2
---
# Fix @ mention dropdown being hidden by create ticket modal footer

## Context

In the simplified create-ticket flow for agent-generated drafts only, typing `@` opens a dropdown that is visually obscured by the modal footer area. This makes the mention/project-context picker difficult or impossible to use from within the create ticket modal.

## Research Findings

- SPEC.md states Relay should let users create tickets through a Codex-powered ticket drafting chat and should keep project-folder workflows local-first.
- tests/ticket-draft.test.ts covers `createTicketDraft`, `draftToCreateInput`, and draft validation behavior, confirming there is existing automated coverage around agent-generated ticket drafts.
- src/main/services/codex.ts imports `ticketDraftSchema` and defines draft-related Codex service types such as `CreateDraftInput`, indicating draft generation is validated in the main service layer.
- src/shared/types.ts defines core ticket/project types and default board columns, but the bounded scan did not inspect the renderer component that owns the create ticket modal or `@` dropdown positioning.
- Research did not include the linked local ticket file `tkt_01krbfxjdbf3r1yevxspkjwjad.md`; implementation should verify any additional constraints from that ticket before editing UI code.

## Requirements

- When the user types `@` in the agent-generated create ticket modal, the dropdown must render above the modal footer and remain fully visible within the viewport where possible.
- The dropdown must be clickable and keyboard-navigable without footer controls intercepting pointer or focus interactions.
- The fix must preserve the simplified agent-generated drafts-only modal behavior from the referenced ticket.
- The solution should use the existing UI layering/portal/popover pattern if one already exists in the renderer codebase.
- Avoid broad visual refactors or unrelated changes to ticket draft generation logic.

## Implementation Plan

- Open the linked ticket file and locate the renderer component(s) for the create ticket modal, ticket draft prompt input, and `@` dropdown/popover.
- Identify whether the dropdown is positioned inline, absolutely inside the modal body, or via a portal, and inspect the modal footer stacking context and overflow rules.
- Fix the layering issue using the smallest consistent change: prefer rendering the dropdown through the existing portal/popover system, or adjust local stacking context, `z-index`, and overflow boundaries if that matches existing patterns.
- Ensure the dropdown positioning accounts for the modal footer by flipping upward, constraining max height, or using collision detection if supported by the existing popover library.
- Add or update focused UI tests for opening the create ticket modal, typing `@`, and asserting the dropdown is visible and not covered by footer controls.
- Run the relevant renderer/unit tests, including existing ticket draft tests if draft modal behavior is touched, and perform a manual browser/electron check of the modal interaction.

## Acceptance Criteria

- Typing `@` in the create ticket modal opens a dropdown that appears above the footer area and is not clipped or obscured.
- Dropdown options can be selected with mouse and keyboard while the modal footer remains visible.
- The modal still supports the agent-generated drafts-only flow and does not reintroduce manual ticket creation UI removed by the referenced simplification ticket.
- No regressions in existing ticket draft tests such as `tests/ticket-draft.test.ts`.
- A focused regression test or documented manual verification covers the `@` dropdown layering bug.

## Clarification Questions

- None.

## Implementation Notes

- Likely root cause is a stacking context, `overflow`, or portal placement issue in the renderer modal/popover layer; confirm before changing `z-index` globally.
- Do not change `src/main/services/codex.ts` draft generation behavior unless the renderer fix reveals a contract issue.
- If the dropdown is shared with other inputs, verify the fix does not break mention dropdown placement outside the create ticket modal.

## Research Metadata

- File inspected: tests/ticket-draft.test.ts - Matched terms: sing, create, drafts; characters read: 11627; symbols: TicketDraftDependencies, readyStatus, createProject, projectPath, validDraftJson, prompt
- File inspected: src/main/services/codex.ts - Matched terms: create, drafts, symbol; characters read: 12000; symbols: Thread, ThreadEvent, ThreadItem, ThreadOptions, AgentTicketUpdate, AgentTicketUpdateInput
- File inspected: tests/git-metadata.test.tsx - Matched terms: sing, create; characters read: 6079; symbols: GitCommandRunner, createProjectPath, metadata, output, projectPath, execGit
- File inspected: tests/keyboard-shortcuts.test.ts - Matched terms: sing, create; characters read: 6294; symbols: KeyboardShortcutEvent, ShortcutDirection, FakeKeyboardShortcutEvent, target, keyboardEvent, defaultPrevented
- File inspected: SPEC.md - Matched terms: sing, create, modal, using; characters read: 12000; symbols: RelayCodexInput, RelayCodexThreadOptions, RelayCodexRunOptions, RelayCodexEvent, CodexClient, and
- File inspected: src/shared/types.ts - Matched terms: sing, create, symbol; characters read: 11226; symbols: RELAY_SCHEMA_VERSION, DEFAULT_COLUMNS, TicketPriority, RunStatus, ProjectHealth, ThemePreference

## Codex Handoff

### 5/11/2026, 1:49:18 PM

**Summary of Changes**
- Fixed the create-ticket `@` mention dropdown to render as a floating portal layer anchored to the idea textarea, avoiding modal overflow/footer clipping.
- Added placement logic that flips the dropdown above the textarea when the modal footer leaves too little room below, while constraining height to the viewport.
- Added regression coverage for footer-constrained and normal dropdown placement.

**Files Changed**
- [src/renderer/src/App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx:84)
- [src/renderer/src/styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css:1291)
- [tests/create-ticket-mention-layout.test.ts](/Users/robertpitt/Projects/relay/tests/create-ticket-mention-layout.test.ts:1)
- [tests/run-tests.mjs](/Users/robertpitt/Projects/relay/tests/run-tests.mjs:15)

**Commands Run**
- Inspection: `git status --short`, `find`, `grep`, `sed`, `git diff`, `nl`
- Attempted `rg`, but it is not installed in this environment.
- Verification: `npm run typecheck`, `npm test`, `npm run build`

**Tests Run**
- `npm run typecheck`: passed.
- `npm test`: passed, 46/46 tests.
- `npm run build`: passed.

**Remaining Risks / Follow-Up**
- I did not run an interactive Electron/browser smoke test; the available verification is typecheck, full tests, production build, and the focused dropdown placement regression test.
- The worktree already had unrelated/pre-existing dirty `.relay`, draft simplification, and ticket-draft files; I left those intact.


No Codex run has been started.
