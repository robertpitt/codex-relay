---
schemaVersion: 1
id: tkt_01krbe0xcercx1s7xbcrt1acvp
title: Enable @-reference autocomplete in create-ticket idea input
status: completed
position: 20000
priority: medium
labels:
  - frontend
  - ticket-drafting
  - autocomplete
  - ticket-linking
createdAt: '2026-05-11T11:51:09.454Z'
updatedAt: '2026-05-11T11:56:11.528Z'
codexThreadId: 019e16e0-a6ea-7c11-8082-1d4880a42d66
runStatus: completed
lastRunId: run_01krbe19mcpk639kpw9a4b8py8
---
# Enable @-reference autocomplete in create-ticket idea input

## Context

The existing @-reference autocomplete for linking tickets while drafting does not work in the initial idea input used by the Create Ticket flow. Users should be able to type @ in the idea field before generating a draft and select existing tickets, so related ticket references are available to the draft-generation prompt and preserved through ticket creation.

## Research Findings

- `src/renderer/src/App.tsx` contains the renderer-side ticket drafting UI and related symbols including `TicketMentionToken`, `TicketDraftErrorPayload`, `TicketSummary`, `createTicketShortcutLabel`, `priorityOptions`, and `markdownFromDraft` usage. This is the likely place to wire the mention/autocomplete behavior into the create-ticket idea input.
- `src/main/index.ts` registers IPC for ticket draft creation and imports `TicketDraftResult` and `TicketSaveInput`; any renderer changes should keep the existing `ticket:createDraft` IPC contract intact unless a data-shape change is required.
- `src/main/services/codex.ts` imports and defines draft-related types and logic including `CreateDraftInput`, `TicketDraft`, `TicketDraftSchema`, and `markdownFromDraft`; this service likely receives the idea text that should now include inserted ticket references.
- `tests/ticket-draft.test.ts` covers `createTicketDraft`, `draftToCreateInput`, `extractTicketDraftUrls`, and draft prompt behavior. Add or extend tests here if the idea text/reference handling affects prompt input, URL extraction, or create-input conversion.
- `src/shared/types.ts` defines shared draft/run state such as `RunStatus` including `drafting`, board defaults including `Completed`, and project settings such as `ticketDraftingEnabled`; use existing shared types for ticket summaries or project state rather than adding renderer-only shapes.
- `SPEC.md` states Relay is board-first and users need a repeatable way to turn rough ideas into well-scoped tickets before asking Codex to implement them. Supporting ticket references in the idea input aligns with that workflow.

## Requirements

- When the Create Ticket idea input is focused, typing `@` should open the existing ticket-reference autocomplete experience or a behaviorally consistent equivalent.
- Autocomplete suggestions must include linkable tickets from the current project and allow keyboard and pointer selection.
- Selecting a suggestion must insert a stable ticket reference into the idea input in the same format expected by existing ticket-linking/drafting logic, such as the established markdown link/reference format already used elsewhere in the app.
- The inserted reference must be included in the payload sent through the existing create-draft flow so the generated draft can use the linked ticket context.
- The change must not regress existing @-reference autocomplete behavior in other drafting/editing surfaces.
- The idea input should remain usable as a plain textarea/input when no `@` query is active, including normal typing, deletion, paste, and submission shortcuts.
- Autocomplete UI must be accessible enough for keyboard use: arrow navigation, Enter/Tab selection where consistent with existing behavior, Escape to close, and focus retained in the idea field.

## Implementation Plan

- Locate the existing @-reference autocomplete implementation in `src/renderer/src/App.tsx`, especially around `TicketMentionToken` and any ticket summary/search state used by the completed linking feature.
- Identify the Create Ticket idea input component/state in `src/renderer/src/App.tsx` and determine whether it can reuse the existing mention/autocomplete component or needs a small shared hook/helper extracted from the current implementation.
- Refactor the mention detection, suggestion filtering, selection insertion, and keyboard handling into a reusable renderer helper if it is currently tied to another editor surface.
- Attach that helper/component to the create-ticket idea input, using the same project ticket source and insertion format as the existing drafting autocomplete.
- Verify that the idea text sent to `ticket:createDraft` remains a string accepted by `CreateDraftInput` in `src/main/services/codex.ts`, and update the main-service prompt handling only if references are currently stripped or ignored.
- Add focused tests for the create-draft path in `tests/ticket-draft.test.ts` if linked ticket references alter `createTicketDraft`, `extractTicketDraftUrls`, or `draftToCreateInput` behavior.
- Add or update renderer tests if the project already has coverage for App-level interactions; otherwise manually verify the create-ticket flow in the local app.
- Run the relevant test suite and typecheck/lint commands used by the project.

## Acceptance Criteria

- Typing `@` in the Create Ticket idea input displays ticket suggestions for the current project.
- Selecting a suggestion inserts a usable ticket reference into the idea text without losing the rest of the typed idea.
- Creating a draft from an idea containing an inserted ticket reference includes that reference in the draft-generation input.
- Existing @-reference autocomplete in the previously implemented drafting surface still works.
- Keyboard behavior works for opening, navigating, selecting, dismissing, and continuing to type after selection.
- Relevant automated tests pass, or any missing test coverage is explicitly documented.

## Clarification Questions

- Should the idea input show all project tickets in @ suggestions, or should it exclude terminal/completed tickets by default?

## Implementation Notes

- No external URLs were provided or researched.
- Bounded research inspected only the listed files and did not include a full renderer test inventory, so the implementer should confirm the app's current frontend test setup before adding UI tests.
- Prefer reusing the existing mention/autocomplete implementation over creating a second divergent autocomplete path.

## Research Metadata

- File inspected: tests/ticket-draft.test.ts - Matched terms: tickets, drafting, draft, createticketdraft, ticketdraft; characters read: 11332; symbols: TicketDraftDependencies, readyStatus, createProject, projectPath, validDraftJson, prompt
- File inspected: src/shared/types.ts - Matched terms: completed, add, tickets, drafting, draft, createdraft, ticketdraft; characters read: 10723; symbols: RELAY_SCHEMA_VERSION, DEFAULT_COLUMNS, TicketPriority, RunStatus, ProjectHealth, ThemePreference
- File inspected: SPEC.md - Matched terms: just, completed, add, tickets, drafting, cannot, draft; characters read: 12000; symbols: RelayCodexInput, RelayCodexThreadOptions, RelayCodexRunOptions, RelayCodexEvent, CodexClient, and
- File inspected: src/main/services/codex.ts - Matched terms: add, tickets, while, draft, createdraft, ticketdraft, ticketdraftschema, markdownfromdraft; characters read: 12000; symbols: Thread, ThreadEvent, ThreadItem, ThreadOptions, ClarificationQuestion, CodexStatus
- File inspected: src/main/index.ts - Matched terms: add, tickets, draft, createdraft, createticketdraft, ticketdraft, ticket:createdraft; characters read: 8408; symbols: MessageBoxOptions, OpenDialogOptions, __dirname, mainWindow, createWindow, registerIpc
- File inspected: src/renderer/src/App.tsx - Matched terms: completed, add, tickets, drafting, draft, ticketdraft, markdownfromdraft; characters read: 12000; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast, LocalAgentProgress, priorityOptions

## Codex Handoff

### 5/11/2026, 12:56:11 PM

**Summary**
Wired the Create Ticket idea textarea into the existing ticket-reference autocomplete flow. Typing `@` now opens project ticket suggestions, supports arrow navigation, Enter/Tab selection, Escape dismissal, and pointer selection, and inserts the same Markdown ticket reference format used elsewhere. The selected reference stays in `idea`, so `ticket:createDraft` receives it unchanged.

Added a focused draft-service test proving Markdown ticket references in the idea are preserved in the Codex draft prompt.

**Files Changed**
- [App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx)
- [styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css)
- [ticket-draft.test.ts](/Users/robertpitt/Projects/relay/tests/ticket-draft.test.ts)

Note: the worktree already had other dirty ticket-reference related files before I started; I left them intact.

**Commands Run**
- Inspection: `grep`, `find`, `sed`, `git diff`, `git status --short`
- Validation: `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`

**Tests Run**
- `npm run typecheck`: passed
- `npm test`: passed, 42 tests
- `npm run build`: passed
- `git diff --check`: passed

**Remaining Risks**
- I did not run an interactive Electron UI session, so keyboard/pointer behavior was not manually clicked through in the app. The pure helper tests, draft prompt test, typecheck, and production build are passing.


No Codex run has been started.
