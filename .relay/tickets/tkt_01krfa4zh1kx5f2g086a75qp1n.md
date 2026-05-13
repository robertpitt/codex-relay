---
schemaVersion: 1
id: tkt_01krfa4zh1kx5f2g086a75qp1n
title: Refine ticket detail header title and sidebar metadata layout
ticketType: task
status: completed
position: 67000
priority: medium
effort: medium
labels:
  - frontend
  - ui
  - ticket-detail
  - accessibility
  - polish
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds:
  - tkt_01krf9fc4rxb5qx31pe8jgwf3j
createdAt: '2026-05-13T00:00:26.145Z'
updatedAt: '2026-05-13T00:08:06.466Z'
authoringState: ready
codexThreadId: 019e1ea5-0590-7de0-92d3-479c35fb093b
runStatus: completed
lastRunId: run_01krfaa0ysgyh6vkmcx4btgrzt
lastRunStartedAt: '2026-05-13T00:03:11.723Z'
---
# Refine ticket detail header title and sidebar metadata layout

## Context

Follow-up to completed ticket tkt_01krf9fc4rxb5qx31pe8jgwf3j. The ticket detail modal currently presents the ticket title as a labeled input in the header, with Status/Priority/Effort/Labels in a horizontal metadata strip under it. Update the layout so the title reads like a normal window title and the editable ticket metadata lives at the top of the right sidebar under a Ticket Details section.

## Goal

Replace the always-visible boxed Title input in the ticket detail header with a plain, top-left visible title that looks like a modal/window title and is the `aria-labelledby` target for the dialog.

## Decisions / Assumptions

- Inline title edits should not auto-save on blur; they should participate in the existing unsaved-changes/save flow.
- Single-clicking the title should not enter edit mode, preserving the user's requested double-click interaction; keyboard editing is added for accessibility.
- The existing Support panel and Tags shortcut should remain, but the Labels form control it focuses should move into Ticket Details.
- The typo `Effory` in the request means the existing `Effort` field.

## Requirements

- Replace the always-visible boxed Title input in the ticket detail header with a plain, top-left visible title that looks like a modal/window title and is the `aria-labelledby` target for the dialog.
- Support inline title editing from the header via double-click, with an accessible keyboard path such as Enter or F2 while the title display is focused; when editing, use the existing `title` state and keep editing disabled while `draftInProgress` is true.
- Move the editable Status, Priority, Effort, and Labels controls out of the header metadata strip into the top of the right sidebar inside a section headed `Ticket Details`.
- Keep existing persistence semantics: metadata edits remain local until the existing save flow runs, and `hasUnsavedChanges`, disabled states, `labelsInputRef`, and label parsing behavior continue to work.
- Update CSS so the header remains compact, the title wraps/truncates cleanly on narrow screens, and the new sidebar Ticket Details section matches existing sidebar section styling without nested card chrome.

## Acceptance Criteria

- The ticket detail header no longer shows a boxed Title field or visible `Title` form label in its default state.
- The visible header title is top-left aligned, readable as the dialog/window title, and can be edited inline by double-click plus an accessible keyboard interaction.
- Status, Priority, Effort, and Labels controls appear at the top of the right sidebar under `Ticket Details`, not in the header.
- Existing Save/dirty-state behavior for title and metadata changes is unchanged.
- The modal remains usable at narrow widths with no overlapping title, close button, or sidebar controls.

## Test Plan

- Run `npm run typecheck`.
- Run `npm test` to catch renderer and shared regressions.
- Run `npm run build` if UI/CSS changes are substantial or typecheck/test coverage remains indirect.
- Manual validation in the app: open a ticket detail modal, confirm the title is plain top-left header text, double-click edits it inline, keyboard editing works, and Save persists title changes.
- Manual validation in the app: confirm Ticket Details is the first right-sidebar section and Status/Priority/Effort/Labels edits still mark the ticket dirty and save correctly on desktop and narrow widths.

## Implementation Notes

- Codebase finding: `src/renderer/src/App.tsx:2833` defines `TicketDetail`; title/priority/effort/status/labels state is initialized from `ticket.frontMatter` in `load()` at `src/renderer/src/App.tsx:2896-2910`.
- Codebase finding: `src/renderer/src/App.tsx:3118-3137` computes `hasUnsavedChanges` by comparing title, priority, effort, status, labels, blockers, and markdown against the loaded ticket; moving controls should preserve these state variables and save behavior.
- Codebase finding: `src/renderer/src/App.tsx:3567-3622` renders the active ticket detail modal header: hidden `h2`, visible labeled title input (`detail-title-field`), then `ticket-detail-metadata-strip` containing Status, Priority, Effort, and Labels controls.
- Codebase finding: `src/renderer/src/App.tsx:3811-3865` starts the right sidebar with a Support details panel and includes a Tags action that calls `focusLabelsInput`; after moving Labels to the sidebar, this action can continue focusing the same `labelsInputRef`.
- Codebase finding: `src/renderer/src/styles.css:2690-2743` styles `ticket-detail-modal-header`, `detail-title-field input`, `ticket-detail-metadata-strip`, and `compact-metadata-field`; responsive overrides for the metadata strip are at `src/renderer/src/styles.css:4066-4072` and `src/renderer/src/styles.css:4293-4303`.
- Implementation: In `src/renderer/src/App.tsx`, add local title-edit UI state inside `TicketDetail` such as `titleEditing`, plus a ref for the inline title input if needed; reset editing state when `projectPath` or `ticketId` changes alongside the existing reset effect at `src/renderer/src/App.tsx:2933-2956`.
- Implementation: Replace the header block at `src/renderer/src/App.tsx:3568-3623`: keep the run/status pills, render a visible title display using `detailDialogTitleId`, and conditionally render an inline title input only while editing. Remove the `Title` label and remove the `ticket-detail-metadata-strip` from the header.
- Implementation: Add a new first child in `<aside className="ticket-detail-sidebar">` at `src/renderer/src/App.tsx:3811`, before Support: a `section` with heading `Ticket Details` containing the existing Status, Priority, Effort, and Labels form controls wired to the same state setters, options arrays, disabled conditions, and `labelsInputRef`.
- Implementation: Preserve the Support panel and Tags shortcut behavior at `src/renderer/src/App.tsx:3854-3864`; verify `focusLabelsInput` still scrolls/focuses the moved Labels input in the new Ticket Details sidebar section.
- Implementation: Update `src/renderer/src/styles.css` by replacing/removing header-specific title input and metadata-strip styles (`detail-title-field`, `ticket-detail-metadata-strip`) with styles for the plain header title, inline edit input, and sidebar metadata fields; remove or neutralize obsolete responsive metadata-strip overrides at `src/renderer/src/styles.css:4066-4072` and `src/renderer/src/styles.css:4293-4303`.
- Research used shell `grep`/`find` because `rg` is not installed in this environment.
- No URLs were included in the idea, and no related ticket source body was available beyond the intake excerpt.
- Avoid broad extraction of `TicketDetail` solely for tests unless the implementation naturally benefits from it; the UI is currently a local component in `App.tsx`.

## Codex Handoff

### 5/13/2026, 1:06:10 AM

**Summary**
Implemented the ticket detail layout change: the header now uses a plain visible `h2` as the dialog `aria-labelledby` target, with inline title editing via double-click, `Enter`, or `F2`. Status, Priority, Effort, and Labels now live in a new top-of-sidebar `Ticket Details` section using the existing state, disabled conditions, label ref, and save/dirty semantics.

**Files Changed**
- [src/renderer/src/App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx:2884)
- [src/renderer/src/styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css:2708)

**Commands Run**
- `sed` / `nl` inspections of `App.tsx` and `styles.css`
- `grep` for existing labels/title/sidebar selectors
- `git status --short`
- `git diff -- src/renderer/src/App.tsx src/renderer/src/styles.css`
- `npm run typecheck`
- `npm test`
- `npm run build`

**Tests**
- `npm run typecheck`: passed
- `npm test`: passed, 153/153 tests
- `npm run build`: passed
- Manual Electron UI validation was not run in this session.

**Subagent Usage**
None used.

**Remaining Risks / Follow-Up**
Manual app validation is still needed for the exact desktop and narrow-width visual behavior, especially title wrapping/edit focus and sidebar control ergonomics.


No Codex run has been started.
