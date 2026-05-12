---
schemaVersion: 1
id: tkt_01krcssxw7hvz4w8k9fqyrceca
title: Generate project ticket suggestions
ticketType: task
status: completed
position: 49000
priority: high
labels:
  - tickets
  - codex
  - frontend
  - ipc
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T00:36:17.927Z'
updatedAt: '2026-05-12T01:13:53.221Z'
codexThreadId: 019e19ac-aa91-7b62-a0bf-0d75d4b710d1
runStatus: completed
lastRunId: run_01krctsa1azz0n2gqskjqbygh7
lastRunStartedAt: '2026-05-12T00:53:26.340Z'
---
# Generate project ticket suggestions

## Context

Add a board-level Generate Tickets flow that asks Codex to review the local project and suggest up to 10 task-sized ticket ideas. The user can create a draft from any suggestion; that action should reuse the existing asynchronous ticket draft flow so the full implementation-ready ticket is produced by the draft agent.

## Codebase Findings

- src/renderer/src/App.tsx:621 defines BoardView props and currently accepts onCreate but no suggestion-generation action.
- src/renderer/src/App.tsx:732 renders the board topbar; src/renderer/src/App.tsx:742-761 currently shows search plus the Create Ticket button, which is the right place to add Generate Tickets.
- src/renderer/src/App.tsx:1055-1084 shows CreateTicketModal.draftTicket calling getRelayApi().ticket.createDraft({ projectPath, idea, preferredTicketType }) and closing after the async draft placeholder is created.
- src/renderer/src/App.tsx:2673 stores createOpen modal state; src/renderer/src/App.tsx:2857 gates the create-ticket shortcut on no modal/detail being open; src/renderer/src/App.tsx:2922-2924 renders CreateTicketModal.
- src/shared/types.ts:473-477 defines CreateDraftInput with projectPath, idea, preferredTicketType, and optional ticketId. Suggested ticket creation can feed suggestion.request into this existing shape.
- src/shared/ipc.ts:40 and src/shared/ipc.ts:79 define the existing ticket:createDraft contract/channel; src/preload/index.ts:38-40 exposes it as window.relay.ticket.createDraft.
- src/main/ipc/methods/tickets.ts:47-59 handles ticket:createDraft by parsing createDraftInputSchema and returning startTicketDraftRun as an ok/error result. A new suggestion-generation IPC method should follow this pattern.
- src/main/services/codex/index.ts:293-314 contains bounded/read-only thread option patterns: boundedThreadOptionsForProject disables network/web search, and ticketUpdateThreadOptionsForProject additionally forces approvalPolicy "never" and sandboxMode "read-only".
- src/main/services/codex/index.ts:316-385 contains local strict JSON schema objects and parseJsonResponse used for Codex structured outputs. Ticket suggestions should use the same outputSchema plus parseSchema validation pattern.
- src/main/services/codex/index.ts:866-917 creates a pending draft ticket and emits progress before the background draft run completes; src/main/services/codex/index.ts:950-957 applies the completed draft to that ticket. The suggestion Create button should call this existing flow instead of writing tickets directly.
- src/main/services/storage/index.ts:797-825 creates the visible pending draft placeholder with runStatus "drafting" and status "todo"; src/main/services/storage/index.ts:868-903 later applies a ready draft and creates epic subtickets when applicable.
- tests/ticket-draft.test.ts:259-313 already covers asynchronous draft placeholder creation and completion; tests/ticket-draft-ui.test.tsx:36-90 covers exported renderer status/loading components; tests/ipc-contract.test.ts:13-25 enforces every shared IPC channel has exactly one registered schema-backed method.
- package.json scripts include npm test and npm run typecheck for full validation.
- Inspected tests/ticket-draft.test.ts (Matched terms: project, tickets, then, draft, createdraft, createticketdraft, ticketdraft; symbols: TicketDraftCodexClient, TicketDraftDependencies, TicketDraftStartDependencies, TicketDraftThread).
- Inspected src/main/ipc/methods/tickets.ts (Matched terms: auto, project, tickets, draft, createdraft, ticketdraft; symbols: AnyRelayIpcMethod, ticketIpcMethods, parsed, resolvedProjectPath).
- Inspected src/main/services/codex/research.ts (Matched terms: project, draft, createdraft, createticketdraft, ticketdraft, ticketdraftschema, ticket:createdraft, markdownfromdraft; symbols: errorMessage, nowIso, DEFAULT_TICKET_DRAFT_RESEARCH_LIMITS, ResearchUrlExcerpt).
- Inspected tests/schemas.test.ts (Matched terms: project, tickets, draft, ticketdraft, ticketdraftschema; symbols: expectSchemaError, rendered, validDraftBase, validProjectConfigInput).
- Inspected src/shared/types.ts (Matched terms: project, tickets, then, draft, ticketdraft; symbols: RELAY_SCHEMA_VERSION, RELAY_TODO_STATUS, RELAY_READY_STATUS, RELAY_IN_PROGRESS_STATUS).
- Inspected src/main/services/codex/index.ts (Matched terms: take, project, tickets, draft, createdraft, ticketdraft, ticketdraftschema, markdownfromdraft; symbols: CodexOptions, Input, Thread, ThreadEvent).
- Research limitation: Code search stopped after scanning 160 candidate files.

## Requirements

- Add a visible Generate Tickets button in the board topbar for the selected project, next to Create Ticket.
- Opening Generate Tickets must show a modal immediately and start a Codex-backed suggestion request for the current project.
- The suggestion agent must run read-only with network/web search disabled and approval policy set to never; it must not create, edit, move, or delete tickets during suggestion generation.
- The backend must return at most 10 suggestions. Each suggestion must include a concise title, priority, labels, rationale/summary for display, and a short request string suitable for createDraft.
- Suggestion generation should include current board ticket titles/statuses/excerpts in the prompt so Codex avoids obvious duplicates.
- The modal must support loading, error, empty, and populated states without closing the board.
- Each populated suggestion must show a Create action. Clicking Create must call getRelayApi().ticket.createDraft with the suggestion request and preferredTicketType "task", then refresh the board so the pending draft ticket appears.
- Successful Create actions should disable or mark that suggestion as created while leaving the modal open so multiple suggestions can be drafted.
- Failed suggestion generation or failed Create actions must show an actionable error message and must not create partial tickets beyond the existing createDraft behavior.
- Add shared IPC, preload, schema, and RelayApi typings for the new suggestion-generation endpoint.

## Implementation Plan

- Add shared types in src/shared/types.ts for TicketSuggestion and TicketSuggestionsGenerateResult, and add ticket.generateSuggestions(projectPath) to RelayApi.ticket.
- Extend src/shared/ipc.ts with a ticket:generateSuggestions channel and relayIpcChannels entry returning the new result type.
- Expose the new method from src/preload/index.ts as window.relay.ticket.generateSuggestions(projectPath).
- Add strict schemas in src/main/services/schemas.ts for a TicketSuggestion item and the suggestions response; cap accepted suggestions to 10 either in the schema or in backend normalization after parsing.
- Implement generateTicketSuggestions in src/main/services/codex/index.ts using the existing createCodex, getCodexStatus, readProjectConfig, readBoard, parseJsonResponse, and parseSchema patterns. Use read-only/no-network/no-approval thread options, pass a strict outputSchema, include existing board tickets in the prompt, normalize whitespace, filter empty title/request rows, and return no more than 10 suggestions.
- Register a new handler in src/main/ipc/methods/tickets.ts for ticket:generateSuggestions that calls generateTicketSuggestions and returns { ok: true, suggestions } or { ok: false, error: ticketDraftErrorToPayload(error) }.
- Update src/renderer/src/App.tsx BoardView props and topbar markup to add a Generate Tickets button with a lucide icon and a new onGenerateTickets callback.
- Add TicketSuggestionsModal in src/renderer/src/App.tsx. It should start generation on mount, render loading/error/empty/list states, call getRelayApi().ticket.createDraft({ projectPath, idea: suggestion.request, preferredTicketType: "task" }) from each Create button, track created indices, call onCreated after successful starts, and keep the modal open until the user closes it.
- Add RelayApp state for ticketSuggestionsOpen, close it on project changes, include it in modal-open shell styling and createShortcutEnabled gating, and render TicketSuggestionsModal when board and selectedPath are present.
- Add focused CSS in src/renderer/src/styles.css for the suggestion list rows, metadata, rationale/request text, and per-row Create/Created states using existing modal, draft-message, labels, priority, and button visual patterns.
- Add backend tests for generateTicketSuggestions with a mocked Codex client, including output schema use, prompt inclusion of existing tickets, read-only thread options, result capping at 10, and invalid/empty suggestion normalization.
- Add schema and IPC coverage updates so tests/ipc-contract.test.ts continues passing with the new channel.
- Add renderer tests for the suggestion list/modal pure rendering states and Create/Created button labels.

## Test Plan

- Run npm run typecheck.
- Run npm test.
- Add or update tests/ticket-draft.test.ts (or a new ticket-suggestions test included in tests/run-tests.mjs) for mocked suggestion generation, output schema validation, prompt contents, read-only thread options, and max-10 result capping.
- Update tests/ipc-contract.test.ts expectations implicitly by adding the channel and handler; the existing contract test should pass without special casing.
- Add renderer coverage in tests/ticket-draft-ui.test.tsx or a new test for generated suggestion rows, loading/error/empty state markup, and Created disabled state.

## Acceptance Criteria

- Generate Tickets appears in the board topbar only when a board is loaded.
- Clicking Generate Tickets opens a modal and starts exactly one suggestion request for the current project.
- While generating, the modal shows a clear in-progress state and no ticket files are created.
- A successful generation displays 0-10 suggestions; no more than 10 suggestions are rendered even if Codex returns more.
- Each suggestion has a title, short rationale/summary, priority, labels, and a request that can be passed directly to createDraft.
- Clicking Create on a suggestion starts the existing asynchronous draft flow, creates a Todo draft placeholder with runStatus "drafting", refreshes the board, and marks that suggestion as created in the modal.
- Suggestion generation uses read-only sandbox mode, approval policy never, network disabled, and web search disabled.
- Errors from suggestion generation and createDraft are visible in the modal/toast and do not crash the renderer.
- All shared types, IPC contracts, preload API, main handler registration, and renderer calls compile under npm run typecheck.
- The full test suite passes with npm test.

## Assumptions / Open Questions

- Suggestions are task drafts only; the full draft agent can still decide if a user-created request genuinely needs an epic later, but the Generate Tickets flow will pass preferredTicketType "task".
- Suggestions are ephemeral UI state and do not need persisted run logs, cancellation, or cross-window resume in this iteration.
- The Create button should create a draft placeholder immediately through the existing createDraft endpoint rather than creating a complete manual ticket.
- The suggestion agent should avoid network access and should base suggestions on local repository context plus the existing Relay board.
- Duplicate prevention is prompt-based for this iteration; no persistent deduplication registry is required.

## Implementation Notes

- Initial bounded research stopped after scanning 160 candidate files, but targeted follow-up inspection covered the renderer entry points, shared IPC/types, main IPC handler, Codex service patterns, storage draft flow, styles, and relevant tests.
- Do not modify the existing createDraft behavior except where needed to share error/result types; this feature should layer on top of it.
- Keep suggestion requests concise, because they become the rough idea input for the existing ticket drafting agent.
- If Codex is unavailable or unauthenticated, reuse the existing TicketDraftServiceError/ticketDraftErrorToPayload style so renderer error handling stays consistent.

## Research Metadata

- File inspected: tests/ticket-draft.test.ts - Matched terms: project, tickets, then, draft, createdraft, createticketdraft, ticketdraft; characters read: 12000; symbols: TicketDraftCodexClient, TicketDraftDependencies, TicketDraftStartDependencies, TicketDraftThread, readyStatus, createProject
  Matched lines:
  - 8: createTicketDraft,
  - 9: draftToCreateInput,
  - 10: extractTicketDraftUrls,
- File inspected: src/main/ipc/methods/tickets.ts - Matched terms: auto, project, tickets, draft, createdraft, ticketdraft; characters read: 7685; symbols: AnyRelayIpcMethod, ticketIpcMethods, parsed, resolvedProjectPath, meta, saved
  Matched lines:
  - 1: import type { TicketDraftStartResult } from "../../../shared/types";
  - 4: maybeResumeTicketDraftAfterClarification,
  - 6: startTicketDraftRun,
- File inspected: src/main/services/codex/research.ts - Matched terms: project, draft, createdraft, createticketdraft, ticketdraft, ticketdraftschema, ticket:createdraft, markdownfromdraft; characters read: 12000; symbols: errorMessage, nowIso, DEFAULT_TICKET_DRAFT_RESEARCH_LIMITS, ResearchUrlExcerpt, TicketDraftResearchContext, CandidateResearchFile
  Matched lines:
  - 2: CreateDraftInput,
  - 3: TicketDraftResearch,
  - 4: TicketDraftResearchFile,
- File inspected: tests/schemas.test.ts - Matched terms: project, tickets, draft, ticketdraft, ticketdraftschema; characters read: 11171; symbols: expectSchemaError, rendered, validDraftBase, validProjectConfigInput, createdAt, parsed
  Matched lines:
  - 7: projectConfigSchema,
  - 10: ticketDraftSchema,
  - 13: import type { TicketDraftSubticket } from "../src/shared/types";
- File inspected: src/shared/types.ts - Matched terms: project, tickets, then, draft, ticketdraft; characters read: 12000; symbols: RELAY_SCHEMA_VERSION, RELAY_TODO_STATUS, RELAY_READY_STATUS, RELAY_IN_PROGRESS_STATUS, RELAY_NEEDS_CLARIFICATION_STATUS, RELAY_REVIEW_STATUS
  Matched lines:
  - 25: | "drafting"
  - 26: | "draft_failed"
  - 27: | "draft_complete"
- File inspected: src/main/services/codex/index.ts - Matched terms: take, project, tickets, draft, createdraft, ticketdraft, ticketdraftschema, markdownfromdraft; characters read: 12000; symbols: CodexOptions, Input, Thread, ThreadEvent, ThreadItem, ThreadOptions
  Matched lines:
  - 11: type CreateDraftInput,
  - 25: type TicketDraft,
  - 26: type TicketDraftSubticket,
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

### 5/12/2026, 2:03:15 AM

Summary of changes made:
- Added `ticket.generateSuggestions(projectPath)` through shared types, IPC, preload, schemas, and main handler.
- Implemented read-only/no-network Codex ticket suggestion generation with strict structured output, board ticket context, normalization, filtering, and max-10 capping.
- Added board topbar “Generate Tickets” button and modal with loading/error/empty/list states.
- Each suggestion can start the existing async `createDraft` flow with `preferredTicketType: "task"` and marks created rows while keeping the modal open.
- Added focused CSS and backend/schema/renderer tests.

Files changed:
- `src/shared/types.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/services/schemas.ts`
- `src/main/services/codex/index.ts`
- `src/main/ipc/methods/tickets.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/styles.css`
- `tests/run-tests.mjs`
- `tests/schemas.test.ts`
- `tests/ticket-draft-ui.test.tsx`
- `tests/ticket-suggestions.test.ts`

Commands run:
- `git status --short`
- `git ls-files src tests package.json`
- `grep`/`sed` inspection commands
- `npm run typecheck`
- `npm test`
- `git diff --check -- ...`

Tests run and results:
- `npm run typecheck`: passed
- `npm test`: passed, 115 tests
- `git diff --check`: passed

Remaining risks or follow-up:
- No known implementation risks. The existing worktree still has unrelated `.relay` changes that I left untouched.


No Codex run has been started.
