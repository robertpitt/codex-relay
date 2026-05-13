---
schemaVersion: 1
id: tkt_01krgex4z6eaqbh6zz8ntj463d
title: Improve ticket detail clarification Q&A layout and scrolling
ticketType: task
status: completed
position: 70000
priority: medium
effort: medium
labels:
  - frontend
  - ui
  - ticket-detail
  - clarification
  - polish
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-13T10:42:46.886Z'
updatedAt: '2026-05-13T11:29:45.334Z'
authoringState: ready
codexThreadId: 019e20f3-4d07-7480-9781-8d42c432edb4
runStatus: completed
lastRunId: run_01krgf6jqjcezfqthcx3072e61
lastRunStartedAt: '2026-05-13T10:47:56.260Z'
---
# Improve ticket detail clarification Q&A layout and scrolling

## Context

Refinement/regression-hardening for the ticket detail modal clarification Q&A area. Agent clarification questions are already loaded, rendered, and answerable, but the panel can become hard to see, consume too much modal space, and lacks its own scroll containment when there are multiple or long questions/answers.

## Goal

Constrain the clarification Q&A panel inside the ticket detail modal so multiple questions or long question/answer text do not expand the primary column or sidebar excessively.

## Decisions / Assumptions

- This is a renderer-only layout refinement; no main-process, storage, IPC, or agent clarification generation changes are needed.
- A CSS-bounded list with internal vertical scrolling is the desired containment model rather than collapsing questions into accordions by default.
- The primary pending clarification panel should stay expanded and prominent because unanswered questions block starting or resuming the agent.
- The sidebar panel should be denser than the primary pending panel because it is mainly metadata/history when pending questions exist.

## Requirements

- Constrain the clarification Q&A panel inside the ticket detail modal so multiple questions or long question/answer text do not expand the primary column or sidebar excessively.
- Make the question list independently scrollable when content exceeds its allotted height, while keeping the clarification panel header visible and the submit controls usable.
- Preserve existing clarification data contracts and behavior: same `ClarificationQuestion` data, draft handling, answer submission callback, pending/answered distinction, and markdown rendering.
- Improve visibility of pending questions in the primary ticket content area without duplicating pending questions in the sidebar when the existing `sidebarClarifications` rule excludes them.
- Ensure responsive behavior at normal and narrow desktop widths: no horizontal overflow, no clipped text, no inaccessible textarea/button controls.

## Acceptance Criteria

- Pending clarification questions are clearly visible in the ticket detail primary area when present.
- Multiple or long clarification questions/answers are contained within a bounded scrollable area and no longer force the modal/sidebar to grow excessively.
- Answered clarification history remains available in the sidebar according to the existing `sidebarClarifications` behavior.
- Question text, answer text, textarea input, and submit buttons remain usable and accessible at normal and narrow desktop widths.
- Existing clarification submission behavior and tests continue to pass.

## Test Plan

- Run `npm run typecheck`.
- Run `npm test`, with attention to `tests/clarification-panel.test.tsx`.
- Manual UI validation in `npm run dev`: open a ticket detail modal with zero clarification questions, one pending question, multiple pending questions, and answered clarification history.
- Manual viewport validation at normal and narrow desktop widths: verify the clarification panel scrolls internally, the ticket modal still scrolls normally, submit buttons remain reachable, and long markdown/text wraps without horizontal overflow.

## Implementation Notes

- Codebase finding: `src/renderer/src/App.tsx:2033-2035` stores `clarifications`, `answerDrafts`, and `submittingAnswerId` in `TicketDetail`; `src/renderer/src/App.tsx:2070-2086` loads questions via `getRelayApi().ticket.clarifications(projectPath, ticketId)` and preserves drafts for unanswered questions.
- Codebase finding: `src/renderer/src/App.tsx:2252-2255` derives `pendingClarifications`, `answeredClarifications`, and `sidebarClarifications`; when pending questions exist, pending questions render in the primary column and answered history remains in the sidebar.
- Codebase finding: `src/renderer/src/App.tsx:2881-2887` renders pending questions through `TicketDetailPrimaryClarifications`; `src/renderer/src/App.tsx:3314-3320` renders `ClarificationPanel` again in the ticket detail sidebar for answered/all clarification history.
- Codebase finding: `src/renderer/src/components/ClarificationPanel.tsx:30-76` renders the shared clarification panel: header summary, `.clarification-list`, one `.clarification-card` per question, markdown question/answer text, textarea for unanswered questions, and submit button. The component currently has no variant, compact mode, or list accessibility attributes beyond the section markup.
- Codebase finding: `src/renderer/src/styles.css:3113-3218` styles `.clarification-panel` with `overflow: hidden`, `.clarification-list` as an unconstrained grid, cards with full padding, and textarea `min-height: 84px`; there is no `max-height`, `overflow-y: auto`, sidebar-specific compact layout, or primary-panel scroll containment. Existing spacing overrides for ticket detail placement are at `src/renderer/src/styles.css:2462-2470`.
- Implementation: Update `src/renderer/src/components/ClarificationPanel.tsx` to support layout metadata needed by CSS, such as an optional `ariaLabel` and/or density/placement class, and add semantic attributes to the scrollable list container (`role="list"` with card `role="listitem"`, or an equivalent accessible structure).
- Implementation: Update `TicketDetailPrimaryClarifications` in `src/renderer/src/App.tsx:501-529` to pass a primary/pending-specific class or prop and a clear accessible label for pending clarification questions.
- Implementation: Update the sidebar `ClarificationPanel` call in `src/renderer/src/App.tsx:3314-3320` to pass a sidebar/history-specific class or prop and accessible label, without changing which questions are supplied by `sidebarClarifications`.
- Implementation: Revise clarification CSS in `src/renderer/src/styles.css:3113-3218` so `.clarification-panel` uses a column layout with `min-height: 0`, `.clarification-list` has bounded `max-height` and `overflow-y: auto`, cards/textareas are more compact in sidebar/history usage, and primary pending usage remains prominent but scroll-contained.
- Implementation: Add or update `tests/clarification-panel.test.tsx` to cover the new semantic attributes/classes and to guard that answered and unanswered rendering still works with long text and multiple questions.
- `rg` was unavailable in the local shell during research, so fallback `grep`/`find` commands were used.
- No browser or screenshot validation was performed during ticket drafting; the implementation agent should perform manual UI validation after changes.
- Related completed tickets indicate this is a follow-up to the near-full-screen ticket detail modal and restored clarification answer UI, not a new workflow.

## Codex Handoff

### 5/13/2026, 11:51:37 AM

**Summary**
Implemented bounded, scroll-contained clarification panels for the ticket detail modal. The shared panel now supports primary/sidebar variants, accessible list semantics, explicit labels, and per-question descriptions for answer controls. Primary pending questions stay prominent; sidebar/history uses denser spacing.

**Files Changed**
- `src/renderer/src/components/ClarificationPanel.tsx`
- `src/renderer/src/App.tsx`
- `src/renderer/src/styles.css`
- `tests/clarification-panel.test.tsx`

**Commands Run**
- Read/inspect commands: `sed`, `grep`, `nl`, `git diff`, `git status`
- `npm run typecheck`
- `npm test`
- `npm test -- tests/clarification-panel.test.tsx`
- `npm run dev`
- `HOST=127.0.0.1 npm run dev -- --host 127.0.0.1`

**Tests Run**
- `npm run typecheck`: passed.
- `npm test`: clarification tests passed, but suite failed on 5 existing backend workflow/status tests involving missing `not_doing` lane expectations.
- `npm test -- tests/clarification-panel.test.tsx`: custom runner ignored the file argument and reran the suite; same 5 unrelated backend failures, clarification tests passed.

**Manual UI Validation**
- Attempted `npm run dev`; Electron main/preload built, but dev server failed to bind `::1:5173` with `EPERM` in this sandbox.
- Retried with host override; `electron-vite` rejected `--host`.
- Browser validation was not possible because the required browser automation runtime is not exposed in this session.

**Subagent Usage**
- none used

**Remaining Risks / Follow-Up**
- Manual viewport validation still needs to be done in a local Electron dev environment outside this sandbox.
- Worktree contains unrelated `.relay/...` runtime/audit changes that I did not edit for this ticket.


No Codex run has been started.
