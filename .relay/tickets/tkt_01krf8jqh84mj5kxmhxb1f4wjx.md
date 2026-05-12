---
schemaVersion: 1
id: tkt_01krf8jqh84mj5kxmhxb1f4wjx
title: Fix expanded ticket Markdown preview being obscured by update composer
ticketType: task
status: todo
position: 19000
priority: medium
effort: medium
labels:
  - frontend
  - ui
  - ticket-detail
  - modal
  - bug
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-12T23:32:59.560Z'
updatedAt: '2026-05-12T23:33:48.084Z'
authoringState: reviewing
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krf8jqf5hvy6mv0qhj6v82t3
lastRunStartedAt: null
---
# Fix expanded ticket Markdown preview being obscured by update composer

## Context

Ticket detail modal has a layout regression: when a user opens a ticket, expands the Markdown preview, and scrolls to the bottom, the bottom of the preview text is hidden behind the update composer/input area. This should be a focused UI fix that preserves the near-full-screen modal and existing ticket/update behavior.

## Goal

Expanded ticket Markdown preview content must scroll to the true bottom without any text being covered by the update composer/input area.

## Decisions / Assumptions

- The desired fix is layout-only; no product behavior change is needed for preview expansion/collapse or update submission.
- The composer should remain visible in the detail modal while reading/scrolling preview content.
- If no existing automated UI test harness covers this modal, a concise manual validation note is acceptable, but automated coverage is preferred if nearby tests already exist.

## Requirements

- Expanded ticket Markdown preview content must scroll to the true bottom without any text being covered by the update composer/input area.
- Keep the update composer visible and usable in the ticket detail modal while preventing it from overlapping scrollable preview content.
- Limit changes to ticket detail modal layout/scroll containment and any focused test coverage; do not change ticket storage, IPC, agent update backend, or Markdown rendering semantics.

## Acceptance Criteria

- In the ticket detail modal, expanded Markdown preview can be scrolled to its bottom and the last visible text is not cut off by the update composer.
- The update composer remains accessible and does not cover preview/body content in the expanded state.
- A focused regression test or documented manual verification covers the expanded preview bottom-scroll case.

## Test Plan

- Run the renderer test suite or the narrow matching tests for ticket detail modal/App UI, e.g. `npm test -- --runInBand` or the repo-specific equivalent if package scripts differ.
- Run any existing type/lint check used for renderer changes, e.g. `npm run typecheck` and/or `npm run lint` if available.
- Manual validation: open a ticket, expand the Markdown preview, scroll to the bottom, and confirm the final line remains fully visible above the update composer.

## Implementation Notes

- Codebase finding: Intake identifies the likely affected renderer area as `src/renderer/src/App.tsx` and related ticket detail modal/components/styles; bounded research confirmed `src/renderer/src/App.tsx` imports ticket-detail-related UI modules and markdown helpers, including `markdownFromDraft`, `markdownFromSubticketDraft`, and `ticketDraftDialogSubtext` near line 94.
- Codebase finding: Related completed ticket `tkt_01krejavnr3q5jm9pve1c9hjyv` redesigned ticket detail as a near-full-screen two-column modal; this bug should keep that modal structure intact.
- Codebase finding: Related completed ticket `tkt_01kretfmvpkr09hz27hd64dzv2` already touched modal header, scrolling, update composer, and preview collapse behavior; the regression is specifically the expanded preview scroll area overlapping the composer.
- Implementation: Update the ticket detail modal layout in `src/renderer/src/App.tsx` and/or extracted ticket-detail UI/styles so the preview scroll container and composer are separate flex/grid regions with bounded height (`min-height: 0` where needed) instead of overlapping absolute/sticky content.
- Implementation: Add bottom padding or layout spacing only inside the relevant scrollable preview/body region if the composer remains fixed/sticky, sized so the final Markdown line remains readable above the composer.
- Implementation: Add or update focused renderer regression coverage for the expanded Markdown preview state: open/select a ticket with long Markdown, expand the preview, scroll the preview to the bottom, and assert the final content is visible and not hidden behind the update input/composer.
- Bounded research only read the first 5000 characters of `src/renderer/src/App.tsx` and stopped after scanning 60 candidate files, so exact local component names deeper in the file were not fully captured. The likely edit target remains the ticket detail modal implementation/styles in `src/renderer/src/App.tsx` and any adjacent extracted ticket-detail component files.
- Related placeholder draft to replace/update: `tkt_01krf8jqh84mj5kxmhxb1f4wjx`.

## Codex Handoff

No Codex run has been started.
