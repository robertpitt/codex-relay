---
schemaVersion: 1
id: tkt_01krejavnr3q5jm9pve1c9hjyv
title: Redesign ticket detail as near-full-screen two-column modal
ticketType: task
status: todo
position: 20000
priority: high
labels:
  - frontend
  - ui
  - ticket-detail
  - modal
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T17:04:12.984Z'
updatedAt: '2026-05-12T17:11:38.829Z'
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krejavm8n64cjhp2sb1q8x1j
lastRunStartedAt: null
---
# Redesign ticket detail as near-full-screen two-column modal

## Context

Opening a ticket currently renders a constrained right-side detail panel. Redesign the ticket detail UI into a near-full-screen modal so the ticket body, edit controls, metadata, blockers, and agent activity have enough space without changing the backend ticket model or board opening flow.

## Codebase Findings

- `src/renderer/src/App.tsx:2058` defines `TicketDetail`; it owns the existing editable ticket state: `title`, `priority`, `status`, `labels`, `blockedByIds`, `markdown`, agent update state, blocker panel state, and refs for markdown/labels/subtickets.
- `src/renderer/src/App.tsx:2118-2133` loads `ticket.read` and clarifications, then copies `frontMatter` fields and `record.markdown` into local state for editing.
- `src/renderer/src/App.tsx:2327-2345` already computes `hasUnsavedChanges` across title, priority, status, labels, blockers, markdown, answers, subticket inputs, and active agent/update work; preserve this behavior for the modal close/Escape path.
- `src/renderer/src/App.tsx:2441-2470` saves through `getRelayApi().ticket.save`, persisting the existing local markdown and frontmatter fields, including `labelsFromInput(labels)` and `blockedByIds`. No API change is needed for the redesign.
- `src/renderer/src/App.tsx:2698-2738` returns `<aside className="detail-panel">` for error, loading, and successful ticket states; this is the entry point to convert from a slide-out panel to a modal/backdrop surface.
- `src/renderer/src/App.tsx:2739-2799` renders the current ticket detail header and primary actions: run status pill, title, close, Start/Resume Codex, Start Fresh Thread, Stop, Mark Accepted, Request Changes, Reopen, and Save.
- `src/renderer/src/App.tsx:2801-2841`, `2892-2968`, and `2970-3069` contain the current compact blocker/tag/subtask actions, blocker manager, parent epic, and subticket controls that should move into the modal layout rather than be removed.
- `src/renderer/src/App.tsx:3080-3134` renders the Agent Ticket Update panel; `src/renderer/src/App.tsx:3189-3198` renders `AgentActivityPanel`, which is the existing agent metrics/details surface.
- `src/renderer/src/App.tsx:3136-3185` currently shows title/status/priority/labels, a markdown source textarea, and `MarkdownBlock` preview all at once. This is the main section to replace with a Preview/Edit tabbed markdown area.
- `src/renderer/src/App.tsx:3266`, `3481-3489`, and `3584-3594` show that `openTicketId` drives the `detail-open` app class and renders `TicketDetail` directly; the board flow can stay the same while the rendered detail surface changes.
- `src/renderer/src/styles.css:2212-2229` styles `.detail-panel` as a fixed right slide-out with `width: min(560px, 50vw)`, `min-width: 460px`, right inset, and `panel-in` animation; this is the CSS to replace for the modal surface.
- `src/renderer/src/styles.css:1336-1364` defines the existing modal backdrop/surface pattern (`.modal-backdrop`, `.modal`) with centered placement, dimmed blurred backdrop, rounded surface, and `surface-in` animation that should be reused or mirrored for the ticket modal.
- `src/renderer/src/styles.css:3414-3419` currently makes `.detail-panel` full-screen on smaller screens. The redesigned modal needs a responsive override that collapses the two columns while keeping usable margins.
- `src/renderer/src/components/MarkdownBlock.tsx:427-472` exports `MarkdownBlock`, which renders markdown with optional title/copy controls and should remain the Preview tab renderer.
- `src/renderer/src/components/AgentActivity.tsx:113-161` renders run summary and token usage; `src/renderer/src/components/AgentActivity.tsx:218-296` renders `AgentActivityPanel` with progress metrics, recent activity, Open Logs, and File actions.
- `src/shared/types.ts:116-140` defines `TicketFrontMatter` and `TicketRecord` fields used by the modal; `src/shared/types.ts:553-582` confirms existing `RelayApi.ticket` and `RelayApi.codex` methods cover save, read, move, blockers via ticket save, attachments, run events, and run summary.
- `tests/run-tests.mjs:11-29` bundles all test entry points; existing renderer static tests live in `tests/ticket-draft-ui.test.tsx`, and agent activity rendering tests live in `tests/agent-progress.test.tsx`.
- `package.json:18-19` provides `npm test` and `npm run typecheck` as the focused validation commands.
- Inspected src/renderer/src/App.tsx (Matched terms: panel, out, right; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast).
- Inspected tests/create-ticket-mention-layout.test.ts (Matched terms: out; symbols: layout).
- Inspected .effect/packages/ai/openrouter/src/Generated.ts (Matched terms: out; symbols: OpenAIResponsesResponseStatus, FileCitation, URLCitation, FilePath).
- Inspected .effect/packages/ai/openrouter/src/index.ts (Matched terms: out).
- Inspected .effect/packages/ai/openrouter/src/internal/errors.ts (Matched terms: out; symbols: OpenRouterErrorBody, OpenRouterClientErrorBody, mapSchemaError, mapClientError).
- Inspected .effect/packages/ai/openrouter/src/OpenRouterClient.ts (Matched terms: out; symbols: Service, ChatStreamingResponseChunkData, OpenRouterClient, Options).
- Research limitation: Code search stopped after scanning 160 candidate files.

## Requirements

- Opening a ticket must render a modal-style detail surface instead of a right-side slide-out panel.
- On desktop/tablet widths, the ticket modal should occupy roughly 80% of viewport width and height, leaving about 10% margin on each edge; on narrow screens, use smaller fixed margins so the UI remains usable.
- The modal content must be split into two columns on wider screens: a primary content column and a right metadata/details column. Collapse to a single column on small screens.
- The primary column must contain the ticket run/blocker status indicators, editable ticket title, close control, primary actions, warning/preflight messages, and the markdown content area.
- The markdown content area must default to a rendered Preview tab using `MarkdownBlock`; the raw markdown textarea must move behind an Edit/source tab. Preview and edit should share the existing `markdown` state so switching tabs preserves unsaved edits.
- The Edit/source tab must retain the current markdown textarea behavior, including image drag-and-drop attachment insertion, disabled state while drafting/saving attachments, and save persistence through the existing `save` function.
- The right column must contain status, priority, labels/tags, blocker state and blocker management, parent epic/subticket controls, clarification questions, agent ticket update controls, agent activity/metrics/details, and duplicate/delete actions.
- Preserve existing actions, disabled states, toasts, log modals, run event refresh behavior, and unsaved-change Escape handling.
- Do not change the ticket storage schema, IPC contracts, or backend APIs for this redesign.
- Add focused renderer tests for the new markdown tab behavior and run the existing test/typecheck commands.

## Implementation Plan

- In `src/renderer/src/App.tsx`, wrap all `TicketDetail` render states in a modal/backdrop structure instead of returning a fixed right `<aside>` directly. Keep `openTicketId` and `detail-open` flow unchanged, but render the successful state with `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` tied to the ticket title.
- In `TicketDetail`, add local markdown tab state such as `markdownMode: "preview" | "edit"`, default it to `"preview"`, and reset it when `projectPath` or `ticketId` changes.
- Move the successful ticket JSX into a two-column layout: primary column for status/title/actions/warnings/markdown tabs, right column for metadata, blockers, relationships, clarification, agent update, agent activity, and danger actions. Use the existing state variables and handlers rather than introducing new persistence logic.
- Replace the current `editor-stack` section with a tabbed markdown pane. Preview mode renders `MarkdownBlock` with the current `markdown` state and copy handlers. Edit mode renders the existing textarea with `markdownEditorRef`, `detail-markdown`, drag/drop handlers, and disabled logic.
- Move the title edit control into the primary header, bound to the existing `title` state and disabled while drafting. Move status, priority, and labels fields into the right details column; keep `labelsInputRef` so existing tag focus behavior still works if the compact action is retained.
- Keep blocker management backed by `blockedByIds`, `blockerResolution`, `toggleBlocker`, and `removeBlocker`. Ensure the right column always shows the current blocker state and exposes a Manage/Edit control for the picker.
- Update `src/renderer/src/styles.css` so the ticket detail surface uses modal dimensions instead of the slide-out rules: approximately `80vw` by `80dvh` or `inset: 10dvh 10vw`, rounded modal surface, dimmed/blurred backdrop, no right-slide animation, and internal two-column grid with independent overflow where needed.
- Add responsive CSS so the modal uses smaller margins and a single-column scroll layout on narrow screens, with metadata sections remaining accessible below the primary content.
- Add or export a small presentational markdown tab component from `src/renderer/src/App.tsx` if needed for static renderer tests, keeping it scoped to the ticket detail UI.
- Run the validation commands and fix any type, test, or layout regressions introduced by the refactor.

## Test Plan

- Add renderer static tests in `tests/ticket-draft-ui.test.tsx` for the markdown tabs: Preview mode is selected by default, renders markdown through the preview surface, and does not render the source textarea.
- Add a renderer static test for Edit/source mode: the edit tab is selected, the `detail-markdown` textarea is rendered with the markdown source, and the preview surface is not simultaneously shown.
- Run `npm test`.
- Run `npm run typecheck`.
- Manual validation with `npm run dev`: open a ticket, confirm the modal has near-full-screen margins, desktop two-column layout, mobile single-column layout, default rendered preview, source edit tab, Save persistence, blocker/tag/status controls, and agent/log actions still work.

## Acceptance Criteria

- Opening any ticket shows a modal-style ticket detail UI, not a narrow right slide-out panel.
- On desktop-sized viewports, the modal has about 10% margin on all edges and uses two columns with markdown/title/actions on the left and metadata/blockers/agent details on the right.
- On narrow screens, the modal remains usable without clipped controls or horizontal scrolling, and all right-column content is reachable in a single-column layout.
- The markdown preview is shown by default; the raw markdown source is hidden until the user selects the edit/source tab.
- Editing markdown in the source tab, switching back to preview, and saving preserves the existing ticket save behavior and updates the rendered preview from the same unsaved state.
- Status, priority, labels/tags, blockers, parent/subtickets, clarification panel, agent update, agent activity metrics, duplicate, and delete remain available in the redesigned modal.
- Existing Escape behavior still warns on unsaved input and closes only when there are no unsaved changes.
- Existing agent log modals continue to open above the ticket modal.
- `npm test` and `npm run typecheck` pass.

## Assumptions / Open Questions

- The user's word "model" means modal dialog.
- The requested 10% margin is a desktop/tablet target; small screens may use tighter fixed margins for usability.
- Tags map to the existing `labels` frontmatter field and UI input.
- Agent metrics/details map to the existing `AgentActivityPanel`, `AgentProgressSummary`, run summary, token usage, recent events, and log/file actions.
- The markdown edit tab is for the ticket body markdown only; frontmatter fields remain edited through title/status/priority/labels/blocker controls.
- Saving remains explicit through the existing Save button; no autosave is introduced.
- Backdrop click-to-close is not required and should not be added unless it preserves the existing unsaved-change guard.

## Implementation Notes

- Research used `grep`/`find` because `rg` is not installed in the environment.
- No backend or IPC changes are expected; keep the redesign in `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`, and focused renderer tests.
- The existing ticket detail component is not currently exported, so testing the new tabbed markdown UI will likely require extracting/exporting a small presentational child component rather than trying to render the full API-backed `TicketDetail`.

## Research Metadata

- File inspected: src/renderer/src/App.tsx - Matched terms: panel, out, right; characters read: 12000; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast, LocalAgentProgress, TicketSuggestionCreateState
  Matched lines:
  - 19: PanelLeftClose,
  - 20: PanelLeftOpen,
  - 63: import { AgentActivityPanel, AgentLogViewer, AgentProgressSummary } from "./components/AgentActivity";
- File inspected: tests/create-ticket-mention-layout.test.ts - Matched terms: out; characters read: 1194; symbols: layout
  Matched lines:
  - 3: import { getTicketReferenceMenuLayout } from "../src/renderer/src/App";
  - 6: const layout = getTicketReferenceMenuLayout({
  - 13: assert.equal(layout.placement, "above");
- File inspected: .effect/packages/ai/openrouter/src/Generated.ts - Matched terms: out; characters read: 12000; symbols: OpenAIResponsesResponseStatus, FileCitation, URLCitation, FilePath, OpenAIResponsesRefusalContent, ReasoningTextContent
  Matched lines:
  - 72: export type OutputItemFunctionCall = {
  - 80: export const OutputItemFunctionCall = Schema.Struct({
  - 88: export type ResponsesOutputItemFunctionCall = {
- File inspected: .effect/packages/ai/openrouter/src/index.ts - Matched terms: out; characters read: 695
  Matched lines:
  - 15: export * as OpenRouterClient from "./OpenRouterClient.ts"
  - 20: export * as OpenRouterConfig from "./OpenRouterConfig.ts"
  - 23: * OpenRouter error metadata augmentation.
- File inspected: .effect/packages/ai/openrouter/src/internal/errors.ts - Matched terms: out; characters read: 12000; symbols: OpenRouterErrorBody, OpenRouterClientErrorBody, mapSchemaError, mapClientError, status, headers
  Matched lines:
  - 15: import type { OpenRouterErrorMetadata } from "../OpenRouterError.ts"
  - 18: // OpenRouter Error Body Schema
  - 22: export const OpenRouterErrorBody = Schema.Struct({
- File inspected: .effect/packages/ai/openrouter/src/OpenRouterClient.ts - Matched terms: out; characters read: 10180; symbols: Service, ChatStreamingResponseChunkData, OpenRouterClient, Options, make, baseClient
  Matched lines:
  - 21: import { OpenRouterConfig } from "./OpenRouterConfig.ts"
  - 28: * The OpenRouter client service interface.
  - 30: * Provides methods for interacting with OpenRouter's Chat Completions API,
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

No Codex run has been started.
