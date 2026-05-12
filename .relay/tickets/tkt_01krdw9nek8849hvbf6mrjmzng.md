---
schemaVersion: 1
id: tkt_01krdw9nek8849hvbf6mrjmzng
title: Polish create-ticket and ticket-suggestion modals
ticketType: task
status: completed
position: 51000
priority: medium
labels:
  - frontend
  - modals
  - accessibility
  - ui-polish
parentEpicId: tkt_01krdtm7bz1j098hdxjvj2js8m
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T10:39:05.171Z'
updatedAt: '2026-05-12T12:07:21.858Z'
codexThreadId: 019e1c08-3e6d-71a1-8830-ec54ef0aa71e
runStatus: completed
lastRunId: run_01kre0eyqgt8nmq9h2s1xrezmz
lastRunStartedAt: '2026-05-12T11:52:04.319Z'
---
# Polish create-ticket and ticket-suggestion modals

## Parent Epic

Frontend refinement and completion pass

## Context

Make the create-ticket and generated-suggestions workflows feel complete by improving focus behavior, busy/error/status semantics, row affordances, and modal responsiveness while preserving draft creation contracts.

## Codebase Findings

- `src/renderer/src/App.tsx:842`-`940` exports `TicketSuggestionsModalContent`, which renders loading, error, empty, and suggestion row states.
- `src/renderer/src/App.tsx:942`-`1066` implements `TicketSuggestionsModal`, including Escape handling, generation retry, per-row create states, and calls to `ticket.createDraft` with `preferredTicketType: "task"` at lines 1010-1014.
- `src/renderer/src/App.tsx:1068`-`1723` implements `CreateTicketModal`; it tracks idea text, manual metadata, Codex draft state, generated subtickets, ticket reference menu state, and save behavior.
- `src/renderer/src/App.tsx:1098`-`1100` declares refs for the modal, footer, and idea textarea, but the modal does not currently focus the idea textarea on open.
- `src/renderer/src/App.tsx:1539`-`1544` renders draft status/error messaging without an explicit role.
- `src/renderer/src/styles.css:1121`-`1435` styles modal layout, create fields, draft messages, suggestion rows, and draft editor/subticket sections.
- `tests/ticket-draft-ui.test.tsx:102`-`164` already covers suggestion loading, error, empty, create, created, disabled, and create-error render states.
- `tests/create-ticket-mention-layout.test.ts:5`-`34` covers the create-modal ticket reference menu's viewport/footer-aware layout.

## Requirements

- Opening Create Ticket must focus the Details/Original Idea textarea after the modal mounts, without breaking ticket reference selection or Escape handling.
- Draft status messages must expose `role="status"` for info/loading states and `role="alert"` for errors.
- Suggestion rows must expose busy/created states clearly through disabled buttons, `aria-busy` where appropriate, and no overflow for long titles, rationale, labels, or request text.
- The create modal and suggestion modal must remain usable at narrow widths using existing responsive breakpoints.
- Do not change `ticket.createDraft`, `ticket.createManual`, generated markdown, subticket save payloads, ticket reference replacement, or modal close behavior.

## Implementation Plan

- Add a mount effect in `CreateTicketModal` near `src/renderer/src/App.tsx:1123`-`1134` that focuses `ideaEditorRef.current` with `requestAnimationFrame` when the modal opens.
- Update the draft message block at `src/renderer/src/App.tsx:1539`-`1544` to set `role` based on `draftMessageKind` and preserve the spinner/text rendering.
- Update `TicketSuggestionsModalContent` at `src/renderer/src/App.tsx:859`-`939` so loading/create buttons expose `aria-busy` and long text has title/overflow-safe affordances where useful.
- Refine modal CSS in `src/renderer/src/styles.css:1121`-`1435` so create fields, modal grids, suggestion rows, draft plan editor, and generated subticket blocks keep stable spacing and do not overlap at narrow widths.
- Extend `tests/ticket-draft-ui.test.tsx` for suggestion-row `aria-busy`/created semantics and draft-message role coverage through any newly exported helper/component needed for static rendering.
- Keep `tests/create-ticket-mention-layout.test.ts` passing without changing existing menu placement expectations.
- Run `npm run typecheck` and `npm test`.

## Test Plan

- Run `npm test -- tests/ticket-draft-ui.test.tsx tests/create-ticket-mention-layout.test.ts` if supported; otherwise run `npm test`.
- Run `npm run typecheck`.
- Manual check with `npm run dev`: open Create Ticket, verify initial focus, type `#` or a ticket mention if supported, trigger Draft with Codex, resize the modal below 700px, and open Generate Tickets with long generated suggestions.

## Acceptance Criteria

- Create Ticket opens with the main textarea focused and existing Escape unsaved-input guard still works.
- Draft info/error messages announce with appropriate status/alert roles.
- Suggestion rows clearly show idle, creating, created, and create-error states without text collision.
- Ticket reference mention menu placement tests continue to pass.
- No draft payload, manual-create payload, or subticket-create payload behavior changes.

## Assumptions / Open Questions

- Focusing the idea textarea is the least surprising default because it is the primary input for both manual and Codex-assisted ticket creation.
- Generated suggestion creation should remain task-only as currently implemented at `src/renderer/src/App.tsx:1010`-`1014`.

## Implementation Notes

- If testing `CreateTicketModal` directly is awkward because it calls the Electron bridge, prefer extracting a small renderable status/message helper instead of adding brittle bridge mocks.

## Codex Handoff

### 5/12/2026, 1:05:06 PM

Summary of changes made:
- Focuses the Create Ticket details textarea on modal mount via `requestAnimationFrame`.
- Added `role="status"` / `role="alert"` draft message semantics through a small exported renderable helper.
- Added suggestion modal `aria-busy`, clearer created/create labels, disabled busy/created buttons, and long-text `title` affordances.
- Tightened modal/suggestion/create CSS for narrow widths and overflow-safe layout.

Files changed:
- [src/renderer/src/App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx)
- [src/renderer/src/styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css)
- [tests/ticket-draft-ui.test.tsx](/Users/robertpitt/Projects/relay/tests/ticket-draft-ui.test.tsx)

Commands run:
- `git status --short`, `git diff`, `git diff --stat`, `git diff --check`
- `grep`, `sed`, `nl`, `find` inspection commands
- `npm run typecheck`
- `npm test`
- `rg` was attempted but is not installed in this environment.

Tests run and results:
- `npm run typecheck`: passed
- `npm test`: passed, 120/120 tests
- `git diff --check`: passed

Subagent usage: none used.

Remaining risks or follow-up:
- I did not run the Electron manual `npm run dev` check.
- There were pre-existing local changes in `.relay/*` and `tests/project-sidebar.test.tsx`; I left those untouched.


No Codex run has been started.
