---
schemaVersion: 1
id: tkt_01krcada5j3qb3cpgsfr88c0k0
title: Compact ticket detail actions and hide inline Blockers list
ticketType: task
status: completed
position: 37000
priority: medium
labels:
  - ui
  - ux
  - tickets
  - blockers
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-11T20:07:15.890Z'
updatedAt: '2026-05-11T20:15:35.611Z'
codexThreadId: 019e18a8-1b18-7980-948d-8a63ece1f72f
runStatus: completed
lastRunId: run_01krcag6npajecy6c1qv3qpzpk
---
# Compact ticket detail actions and hide inline Blockers list

## Context

When opening a task/ticket, the current detail view exposes the full Blockers ticket list inline, which makes the panel feel cluttered. Replace that always-visible section with a compact action area at the top of the ticket detail view, alongside small action buttons such as `+ Blocker`, `+ Subtask`, and `+ Tags`, so related features are discoverable without dominating the ticket view.

## Research Findings

- `src/renderer/src/App.tsx` is the primary renderer file inspected and contains ticket UI-related symbols such as `TicketMentionToken`, `ActiveTicketReferenceMention`, `Toast`, and drag/drop board handling. Search matches included `tickets`, `blockers`, `task`, `button`, and `top`, making this the likely place to update the ticket detail UX.
- `src/main/services/storage/index.ts` contains storage-layer ticket types such as `BoardSnapshot`, `CreateDraftInput`, `TicketSaveInput`, and `TicketSummary`, and imports `uniqueTicketIds` from `../../../shared/blockers`, indicating blocker relationships are already modeled outside the UI.
- No URL research was available because the idea did not include URLs.
- Research was bounded and stopped after scanning 160 candidate files, so the exact component/function rendering the Blockers section may require additional local inspection before implementation.

## Requirements

- Do not show the full Blockers ticket list by default when a task/ticket is opened.
- Add a compact action row near the top of the ticket detail view containing small buttons for blocker-related and adjacent actions.
- Include at minimum a `+ Blocker` control that exposes the existing blocker add/manage workflow without changing blocker data semantics.
- If `+ Subtask` and `+ Tags` workflows already exist, move or expose them in the same compact action row; if they do not exist, avoid implementing large new workflows unless required for layout consistency.
- Provide a way to access existing blockers from the compact UI, such as a count, dropdown, popover, or manage panel, without taking over the default detail view.
- Preserve existing blocker relationships and storage behavior.
- Keep the UI accessible with keyboard-focusable buttons, clear labels or tooltips, and usable empty states.
- Ensure the layout remains clean and usable at narrow panel/window widths.

## Implementation Plan

- Inspect `src/renderer/src/App.tsx` to locate the ticket detail/open-ticket rendering path and the current Blockers section.
- Identify existing handlers/state for adding blockers, subtasks, and tags so the new controls reuse current behavior rather than duplicating ticket relationship logic.
- Create or refactor a compact ticket action row near the top of the detail panel, using the app's existing button styles and spacing conventions.
- Replace the always-expanded Blockers list with a collapsed affordance, such as `+ Blocker` plus an existing-blocker count or manage trigger.
- Wire `+ Blocker` to the current blocker picker/add flow and ensure existing blocker data still renders when the compact control is opened.
- Add `+ Subtask` and `+ Tags` controls to the same row only where existing flows are available or can be safely invoked without expanding scope.
- Handle empty, loading, and populated blocker states inside the compact UI.
- Verify no storage schema changes are needed; if changes appear necessary, keep them narrowly scoped and document why.
- Run the relevant frontend typecheck/lint/test command for the project, or document if no suitable command is available.
- Manually verify opening tickets with zero blockers, one blocker, and multiple blockers to confirm the detail view is no longer cluttered and blocker management still works.

## Acceptance Criteria

- Opening a task/ticket no longer displays the full Blockers ticket list inline by default.
- A compact top action area is visible in the ticket detail view with a working `+ Blocker` button.
- Existing blockers remain accessible through the compact UI and can still be reviewed or managed.
- Adding or removing blockers continues to persist correctly after closing and reopening the ticket.
- The ticket detail view remains visually stable and usable on narrower widths.
- No unrelated board, drag/drop, storage, or ticket creation behavior regresses.
- Relevant checks pass, or any skipped checks are documented with a reason.

## Clarification Questions

- Should existing blockers be shown as a simple count on the `+ Blocker` button, or opened through a separate manage/list popover?
- Are `+ Subtask` and `+ Tags` expected to be fully functional in this ticket, or only included if those workflows already exist?

## Implementation Notes

- Prefer reusing existing ticket/blocker state and handlers in `src/renderer/src/App.tsx` before introducing new components or storage changes.
- Keep the change focused on presentation and interaction flow; the storage model in `src/main/services/storage/index.ts` should not need changes unless the current UI is tightly coupled to inline rendering.
- Because research did not read the full renderer file, implementation should start by locating the exact Blockers rendering block and nearby ticket header/action controls.

## Research Metadata

- File inspected: src/renderer/src/App.tsx - Matched terms: all, tickets, blockers, open, task, button, top; characters read: 12000; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast, LocalAgentProgress, ActiveTicketReferenceMention
- File inspected: .effect/packages/ai/openai-compat/test/OpenAiEmbeddingModel.test.ts - Matched terms: all, open, small; characters read: 7576; symbols: HttpClientError, HttpClientRequest, dimensions, capturedRequest, clientLayer, response
- File inspected: .effect/packages/ai/openai/test/OpenAiEmbeddingModel.test.ts - Matched terms: all, open, small; characters read: 10268; symbols: HttpClientError, HttpClientRequest, dimensions, capturedRequest, clientLayer, response
- File inspected: .effect/packages/ai/openai-compat/test/OpenAiLanguageModel.test.ts - Matched terms: all, open, top; characters read: 12000; symbols: HttpClientError, HttpClientRequest, capturedRequest, layer, result, requestBody
- File inspected: src/main/services/storage/index.ts - Matched terms: all, tickets, under, blockers, open, top; characters read: 12000; symbols: BoardSnapshot, ClarificationQuestion, ClarificationQuestionStore, ClarificationQuestionCreateInput, CreateDraftInput, InvalidTicket
- File inspected: .effect/packages/ai/openai-compat/src/OpenAiLanguageModel.ts - Matched terms: like, all, open, top; characters read: 12000; symbols: Annotation, ChatCompletionContentPart, CreateResponse, CreateResponse200, CreateResponse200Sse, CreateResponseRequestJson
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

### 5/11/2026, 9:14:11 PM

**Summary Of Changes**
- Added a compact ticket detail action row near the top with `+ Blocker`, `+ Subtask` for epics, and `+ Tags`.
- Hid the full Blockers list by default. `+ Blocker` now opens the existing blocker manager with current blockers, missing/self warnings, remove actions, and the existing checkbox picker.
- `+ Tags` focuses the existing Labels field. `+ Subtask` reuses the existing epic subticket panel.
- Added responsive styles so the compact action row wraps cleanly on narrow widths.

**Files Changed**
- [src/renderer/src/App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx)
- [src/renderer/src/styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css)

**Commands Run**
- Attempted `rg`; unavailable in this environment, so used `grep`, `find`, and `sed` for inspection.
- `git status --short`
- `git diff -- src/renderer/src/App.tsx src/renderer/src/styles.css`
- `npm run typecheck`
- `npm test`

**Tests Run**
- `npm run typecheck`: passed.
- `npm test`: passed, 72 tests passing.

**Remaining Risks / Follow-Up**
- I did not run a live Electron UI session, so zero/one/multiple blocker visual verification was not manually performed in-app.
- The worktree contains unrelated existing/parallel changes and untracked Relay artifacts; I left them untouched.


No Codex run has been started.
