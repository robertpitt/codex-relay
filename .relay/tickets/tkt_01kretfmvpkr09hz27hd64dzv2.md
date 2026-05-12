---
schemaVersion: 1
id: tkt_01kretfmvpkr09hz27hd64dzv2
title: >-
  Polish ticket detail modal header, scrolling, update composer, and preview
  collapse
ticketType: task
status: completed
position: 57000
priority: high
labels:
  - frontend
  - ui
  - ticket-detail
  - modal
  - polish
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T19:26:38.454Z'
updatedAt: '2026-05-12T19:46:22.553Z'
codexThreadId: 019e1daf-6e88-7312-b078-1dc97287cf2f
runStatus: completed
lastRunId: run_01kretyv7pvs3c1wr1mrkxv59x
lastRunStartedAt: '2026-05-12T19:34:56.741Z'
---
# Polish ticket detail modal header, scrolling, update composer, and preview collapse

## Context

Follow-up cleanup for the completed near-full-screen ticket detail modal. Keep the existing ticket storage, IPC, and agent update backend intact while fixing the modal header, flat right-pane layout, clipped activity content, update composer placement, and collapsed markdown preview behavior.

## Goal

Add a non-scrolling modal header that contains the editable ticket title, status indicators, and close icon at the top right; preserve dialog accessibility with `role="dialog"`, `aria-modal`, and a stable title label.

## Decisions / Assumptions

- “Add the update to the thread” means use the existing ticket update agent run/log flow, not introduce a new persistent chat/comment schema.
- The title should remain editable, just moved into the modal header.
- On narrow screens, a single scrollable modal body is acceptable as long as no content is clipped.
- Collapsed markdown preview height can be tuned by CSS; the key behavior is default collapsed state plus an explicit expand/collapse control.

## Requirements

- Add a non-scrolling modal header that contains the editable ticket title, status indicators, and close icon at the top right; preserve dialog accessibility with `role="dialog"`, `aria-modal`, and a stable title label.
- Keep the modal body as a two-column layout on desktop, but make the right pane independently scrollable so Details, Token Usage, and Recent Activity are reachable; collapse to a usable single-column scroll layout on narrow screens.
- Move the Agent Ticket Update composer under the markdown preview/source area, with the existing update/send, stop, logs, error, and progress behavior wired to `startTicketUpdate`; remove the top-level `Request Changes` button and focus-only helper.
- Render the markdown preview collapsed by default with an expand/collapse icon button at the bottom of the preview; expanded mode should fill the available primary-column height while edit/source mode keeps existing textarea, drag/drop, and save behavior.
- Replace boxed right-pane containers for Details and Agent Activity with a flat section style: subheader followed by fields/actions/content. Use subtle styling only for individual controls, rows, and states where needed.

## Acceptance Criteria

- The ticket detail modal header remains visible while scrolling and contains the editable ticket title plus close icon at the top right.
- The right pane uses flat sections rather than boxed panels for Details and Agent Activity, and all right-pane content including Token Usage and Recent Activity is reachable by scrolling.
- The top-level `Request Changes` button is gone; the update composer sits under the markdown preview/source area and can start, stop, show logs/progress, clear on success, and reload the ticket using the existing agent update flow.
- Markdown preview opens collapsed by default with a bottom expand icon; expanded mode fills the available primary-column height, and edit/source mode still supports markdown editing, image drop insertion, and saving.
- Existing Start/Resume Codex, Start Fresh Thread, Stop, Mark Accepted, Reopen, Save, blockers, tags, relationships, clarifications, duplicate/delete, log modals, and unsaved Escape guard continue to work.

## Test Plan

- Update `tests/ticket-draft-ui.test.tsx` so default `TicketMarkdownTabs` rendering asserts preview mode is collapsed, has an expand control, renders markdown, and does not render the source textarea.
- Add or update a static test for expanded preview mode and keep the edit/source-mode test asserting the textarea renders without simultaneous preview content.
- Run `npm test`.
- Run `npm run typecheck`.
- Manual validation with `npm run dev`: open a long ticket, scroll each pane, confirm the header title/close stay visible, right pane reaches Token Usage and Recent Activity, the update composer submits from under the markdown preview, and mobile width has no clipped controls.

## Implementation Notes

- Codebase finding: `src/renderer/src/App.tsx:2346` defines `TicketDetail`; it owns the editable `title`, `markdown`, `markdownMode`, ticket update state, blocker state, and refs used by the detail UI.
- Codebase finding: `src/renderer/src/App.tsx:3035-3059` renders the successful detail dialog with the title field and close icon inside `ticket-detail-primary`; `src/renderer/src/styles.css:2351-2357` makes both primary and sidebar panes scroll containers, so the current title/close area can scroll away.
- Codebase finding: `src/renderer/src/App.tsx:2854-2863` shows `requestChanges()` only prefixes/focuses the ticket update textarea; the `Request Changes` button is rendered at `src/renderer/src/App.tsx:3088-3092`.
- Codebase finding: `src/renderer/src/App.tsx:3155-3168` renders `TicketMarkdownTabs`; the exported component at `src/renderer/src/App.tsx:364-452` defaults to preview/edit tabs but has no collapsed-preview or expand control state.
- Codebase finding: `src/renderer/src/App.tsx:3447-3501` renders the Agent Ticket Update panel in the right sidebar; `startTicketUpdate()` at `src/renderer/src/App.tsx:2766-2791` already calls `getRelayApi().ticket.startAgentUpdate`. The backend flow at `src/main/services/codex/index.ts:2170-2318` validates agent output, writes updated title/priority/labels/markdown, and emits run events.
- Implementation: In `src/renderer/src/App.tsx`, restructure the successful `TicketDetail` JSX so `.detail-panel` contains a modal-level header before `.ticket-detail-layout`; move the run/blocker status row, editable title field, hidden/visible dialog title label, and close button into that header.
- Implementation: Remove the `requestChanges` helper and the `Request Changes` button from the primary action row. Move the existing `<section className="ticket-update-panel">` JSX from the sidebar to the primary column immediately after `TicketMarkdownTabs`, keeping `ticketUpdateInputRef`, `startTicketUpdate`, `cancelTicketUpdate`, log modal opening, progress, disabled states, and completion reload behavior.
- Implementation: Extend `TicketMarkdownTabs` with controlled `previewExpanded` and `onPreviewExpandedChange` props, plus a bottom icon button with `aria-expanded`; add `markdownPreviewExpanded` state in `TicketDetail`, default it to `false`, and reset it when `projectPath` or `ticketId` changes.
- Implementation: Update Details markup from `ticket-detail-card` to a flat section class, and adjust Agent Activity styling in the ticket sidebar so the panel itself has no card background/shadow while retaining its header, actions, progress summary, usage grid, and recent rows.
- Implementation: Update `src/renderer/src/styles.css`: make `.detail-panel` a grid with `auto minmax(0, 1fr)` rows, keep the header outside scrolling content, keep desktop primary/sidebar panes `min-height: 0` with independent `overflow-y: auto`, add bottom padding to the sidebar, and preserve the existing mobile single-column override with all content reachable.
- Research used `grep`/`find` because `rg` is not installed in this environment.
- Expected scope is renderer-focused: `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`, and `tests/ticket-draft-ui.test.tsx`; `src/renderer/src/components/AgentActivity.tsx` should only need changes if a className/flat variant prop is preferred over scoped CSS.
- The clipped Token Usage/Recent Activity issue appears to be layout/CSS reachability, not missing AgentActivity data or backend behavior.

## Codex Handoff

### 5/12/2026, 8:45:11 PM

Summary of changes made:
- Moved the ticket detail title/status/close controls into a non-scrolling modal header with dialog labelling preserved.
- Kept desktop two-pane layout, made the modal body scroll beneath the header, and flattened Details/Agent Activity styling.
- Moved Agent Ticket Update composer under the markdown area and removed the top-level `Request Changes` helper/button.
- Added collapsed-by-default markdown preview with expand/collapse icon control and expanded preview state reset per ticket.
- Updated markdown tab UI tests for collapsed and expanded preview modes.

Files changed:
- `src/renderer/src/App.tsx`
- `src/renderer/src/styles.css`
- `tests/ticket-draft-ui.test.tsx`

Commands run:
- Inspection: `sed`, `grep`, `cat package.json`, `git status --short`, `git diff`
- `npm test -- tests/ticket-draft-ui.test.tsx`
- `npm test`
- `npm run typecheck`
- `git diff --check -- src/renderer/src/App.tsx src/renderer/src/styles.css tests/ticket-draft-ui.test.tsx`
- `npm run dev`
- `npm run dev -- --host 127.0.0.1`
- `HOST=127.0.0.1 npm run dev`

Tests run and results:
- `npm test -- tests/ticket-draft-ui.test.tsx`: passed, 138 tests.
- `npm test`: passed, 138 tests.
- `npm run typecheck`: passed.
- `git diff --check`: passed.

Subagent usage: none used.

Remaining risks/follow-up:
- Manual `npm run dev` validation was blocked by the sandbox: Electron/Vite failed to bind `::1:5173` with `EPERM`. Main and preload builds completed before the dev server bind failure. Forcing `--host` is unsupported by `electron-vite`, and `HOST=127.0.0.1` still attempted `::1`.
- Worktree had unrelated pre-existing modifications before this task; I left them untouched.


No Codex run has been started.
