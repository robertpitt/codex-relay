---
schemaVersion: 1
id: tkt_01krecndf61bkjwmycgwnd4e65
title: Add Read-Only Repository Chat Pane to Project Board
ticketType: task
status: review
position: 1000
priority: medium
labels:
  - frontend
  - codex
  - ipc
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T15:25:07.430Z'
updatedAt: '2026-05-12T15:58:43.415Z'
codexThreadId: 019e1cd4-f46b-7d82-9e89-4f3a7fc21066
runStatus: completed
lastRunId: run_01kred9wqjvawgmgk503bbdt62
lastRunStartedAt: '2026-05-12T15:36:18.637Z'
---
# Add Read-Only Repository Chat Pane to Project Board

## Context

Add an on-board repository chat affordance for quick read-only Codex questions while working in Relay. The feature should add a chat icon button to the project board topbar. Clicking it opens a right-side slide-out pane where the user can ask short questions about the selected repository and receive concise Codex answers without creating tickets, moving cards, editing files, or emitting ticket run events.

## Codebase Findings

- src/renderer/src/App.tsx:744 defines BoardView props and topbar actions; the board header currently has search, Generate Tickets, and Create Ticket buttons at lines 871-898.
- src/renderer/src/App.tsx:857-945 renders the project board inside <main className="workspace">, with the board grid and DnD context below the topbar.
- src/renderer/src/App.tsx:3047-3060 RelayApp owns selected project, board, modal/detail state, Codex status, and live run events; this is the right place to own repositoryChatOpen/thread state.
- src/renderer/src/App.tsx:3145-3154 selectProject closes ticket/detail and modal state, clears query, and changes selectedPath; repository chat should close/reset here too to avoid cross-project context leakage.
- src/renderer/src/App.tsx:3310-3321 passes BoardView callbacks from RelayApp; add an onOpenRepositoryChat callback here rather than making BoardView call the API directly.
- src/renderer/src/App.tsx:3333-3344 renders the fixed Codex status rail; repository chat CSS should account for or hide/reposition this rail when the pane is open.
- src/renderer/src/styles.css:620-689 defines topbar, topbar-actions, and topbar-button layout; add the chat icon button using these existing sizing/flex conventions.
- src/renderer/src/styles.css:2035-2053 defines the existing right-side slide-in detail-panel animation and visual treatment; repository chat can reuse the same right-side panel language but should remain non-modal on desktop so the board stays usable alongside it.
- src/renderer/src/styles.css:3208-3255 contains responsive board/topbar/status-rail rules; add mobile rules so the chat pane becomes full-width or nearly full-width and does not crush topbar controls.
- src/shared/types.ts:530-572 defines RelayApi; codex currently exposes status, run start/resume/cancel, approval, readRunEvents, readLatestRunSummary, and onRunEvent only.
- src/shared/ipc.ts:33-67 defines the typed IPC contract and src/shared/ipc.ts:73-107 maps channel constants; any new chat method must be added in both places to satisfy tests/ipc-contract.test.ts.
- src/preload/index.ts:58-74 exposes the codex API through contextBridge; add the chat method here after adding it to shared RelayApi.
- src/main/ipc/methods/codex.ts:17-68 registers schema-backed Codex IPC methods with defineRelayIpcMethod and fromPromise; add the repository chat IPC method in this array.
- src/main/services/schemas.ts:437-454 has existing passthrough input schemas for createDraft, startRun, and agent ticket update; add a repository chat input schema here.
- src/main/services/codex/index.ts:275-319 defines project thread option helpers. ticketUpdateThreadOptionsForProject already forces approvalPolicy "never", sandboxMode "read-only", networkAccessEnabled false, and webSearchMode "disabled"; repository chat should use the same safety overrides.
- src/main/services/codex/index.ts:783-871 implements read-only ticket suggestion generation, including Codex availability/auth checks and a prompt rule forbidding file/ticket edits. This is the closest backend pattern for the new chat request-response flow.
- src/main/services/codex/index.ts:761-781 formatBoardTicketsForSuggestionPrompt summarizes current board tickets as id/title/status/priority/type/labels/excerpt. Reuse or generalize this for minimal chat context.
- tests/backend.test.ts:47-51 creates temporary initialized projects; tests/backend.test.ts:73-83 provides a fake run event sink pattern; backend chat tests can follow this file’s existing fake Codex client style.
- tests/ticket-draft-ui.test.tsx:1-14 renders exported App components with renderToStaticMarkup; export a small RepositoryChatPanel or content component and cover its static states there.
- tests/ipc-contract.test.ts:13-25 asserts every relayIpcChannels value has exactly one registered schema-backed method, so adding the channel plus codexIpcMethods entry is enough for IPC contract coverage.
- package.json scripts define npm test as node tests/run-tests.mjs and npm run typecheck as tsc --noEmit.
- Inspected tests/ticket-draft.test.ts (Matched terms: project, board, out, draft, createdraft, createticketdraft, ticketdraft; symbols: TicketDraftCodexClient, TicketDraftDependencies, TicketDraftStartDependencies, TicketDraftThread).
- Inspected src/renderer/src/App.tsx (Matched terms: project, board, top, icon, will, out, draft, createticketdraft; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast).
- Inspected src/main/services/codex/research.ts (Matched terms: project, top, out, draft, createdraft, createticketdraft, ticketdraft, ticketdraftschema; symbols: errorMessage, nowIso, DEFAULT_TICKET_DRAFT_RESEARCH_LIMITS, ResearchUrlExcerpt).
- Inspected tests/ticket-draft-ui.test.tsx (Matched terms: project, board, icon, will, out, draft, createticketdraft, ticketdraft; symbols: TicketSuggestion, TicketSummary, ticketSummary, standardTitles).
- Inspected docs/backend-effect-v4-upgrade-plan.md (Matched terms: like, project, board, top, icon, out, draft, createdraft; symbols: rather).
- Inspected tests/ticket-suggestions.test.ts (Matched terms: project, board, out, draft, ticketdraft; symbols: TicketDraftCodexClient, TicketDraftThread, TicketSuggestionDependencies, readyStatus).
- Research limitation: Code search stopped after scanning 160 candidate files.

## Requirements

- Add a chat icon button to the project board topbar using a lucide chat icon, with accessible label/title and an active state when the pane is open.
- Clicking the button opens a right-side slide-out repository chat pane for the currently selected project; the pane has a close icon and closes on Escape.
- The desktop pane must sit alongside the board rather than behave like a blocking modal; on narrow screens it may become a full-width slide-over.
- The chat UI must maintain an ephemeral transcript for the current open session, showing user questions, assistant answers, pending state, and errors.
- The input supports short questions with Enter-to-send and Shift+Enter for newline, plus a send icon button; submitting is disabled while a response is pending or the input is blank.
- The backend chat method must start a Codex thread for the first message and resume the returned threadId for subsequent messages in the pane.
- Codex chat must be read-only: force sandboxMode "read-only", approvalPolicy "never", networkAccessEnabled false, and webSearchMode "disabled" regardless of project defaults; keep model/reasoning/additional directory/git-skip behavior consistent with existing project thread options.
- The chat prompt must include minimal selected project context: project path, project name, workflow columns, and the current board ticket summary; it must instruct Codex to answer concisely and not create/edit/move/delete files or tickets.
- The feature must not create Relay tickets, mutate board state, write run logs, emit ticket run events, or interact with the implementation-run scheduler.
- Unavailable or unauthenticated Codex states must surface a clear inline error in the pane and should not append an assistant answer.
- Changing selected projects closes/resets the chat so a thread from one repository cannot be reused against another repository.

## Implementation Plan

- Add shared chat types in src/shared/types.ts: a RepositoryChatInput with projectPath, message, and optional threadId; a RepositoryChatResponse with threadId and message; optionally a renderer-only RepositoryChatMessage type for the transcript; extend RelayApi.codex with sendRepositoryChatMessage(input).
- Add the IPC contract entry and channel constant in src/shared/ipc.ts, for example codex:sendRepositoryChatMessage mapped as relayIpcChannels.codexSendRepositoryChatMessage.
- Add repositoryChatInputSchema in src/main/services/schemas.ts using passthroughStruct with projectPath, message, and optional nullable threadId.
- Implement sendRepositoryChatMessage in src/main/services/codex/index.ts with injectable dependencies for tests. Reuse getCodexStatus/createCodex, readProjectConfig/readBoard, and a generalized board-ticket formatter derived from formatBoardTicketsForSuggestionPrompt. Start a new thread when threadId is absent, resume when present, call thread.run(prompt), and return { threadId, message: turn.finalResponse }.
- Add repositoryChatThreadOptionsForProject in src/main/services/codex/index.ts based on boundedThreadOptionsForProject but overriding approvalPolicy to "never", sandboxMode to "read-only", networkAccessEnabled to false, and webSearchMode to "disabled". Use this helper only for repository chat.
- Register the IPC method in src/main/ipc/methods/codex.ts by parsing repositoryChatInputSchema and calling sendRepositoryChatMessage.
- Expose the method in src/preload/index.ts under api.codex.sendRepositoryChatMessage.
- Update src/renderer/src/App.tsx imports to include MessageCircle. Add repositoryChatOpen state in RelayApp, close it in selectProject and selectedPath reset effects, and include chat-open in app-shell className when active.
- Extend BoardView props with onToggleRepositoryChat/repositoryChatOpen, add an icon-only topbar button before Generate Tickets or after search, and wire it from RelayApp.
- Add a RepositoryChatPanel component in src/renderer/src/App.tsx or a new renderer component file. It should accept projectPath, projectName, open state, onClose, and setToast; manage threadId, messages, draft text, pending/error state, and call getRelayApi().codex.sendRepositoryChatMessage on submit.
- Use MarkdownBlock for assistant answers if formatting is returned; render user messages as plain text. Keep empty/loading/error states compact and avoid explanatory marketing copy.
- Add CSS in src/renderer/src/styles.css for .repository-chat-panel, transcript rows, composer, active chat topbar button, chat-open shell layout, and mobile behavior. Reuse existing radius, color, shadow, focus, and panel animation variables.
- Add focused backend tests in tests/backend.test.ts for first-message thread creation and resumed thread usage, asserting read-only thread options and prompt rules.
- Add focused renderer static tests in tests/ticket-draft-ui.test.tsx for the chat panel/content rendering transcript, pending state, and composer controls. If a new test file is created, add it to tests/run-tests.mjs.
- Run typecheck and the full test suite, then fix any IPC contract or bundling failures introduced by the new shared types/methods.

## Test Plan

- npm run typecheck
- npm test
- Add/verify backend test: sendRepositoryChatMessage starts a thread, passes read-only/no-network/no-web/no-approval thread options, includes board context in the prompt, and returns the SDK final response with the new thread id.
- Add/verify backend test: sendRepositoryChatMessage resumes the provided threadId for a second message and does not touch run-event persistence or ticket state.
- Add/verify renderer test: RepositoryChatPanel/content renders user and assistant messages, shows pending state, disables send while pending/blank, and exposes close/send buttons with accessible labels.
- Rely on existing tests/ipc-contract.test.ts to confirm the new IPC channel has exactly one registered schema-backed method.

## Acceptance Criteria

- A chat icon button is visible in the project board topbar and opens/closes the repository chat pane for the selected project.
- The pane slides in from the right, remains usable alongside the board on desktop, and is usable without horizontal text/control overflow on mobile widths.
- Submitting a question appends a user message, shows a pending assistant state, calls the new Codex chat API, and appends the assistant response when it returns.
- Follow-up questions in the same pane reuse the returned Codex threadId.
- Codex chat runs with read-only sandbox, never approval, no network access, and disabled web search, regardless of project defaults.
- No tickets, board columns, run logs, run events, or implementation run states are modified by chat interactions.
- Codex unavailable/unauthenticated/backend errors are shown inline and via existing toast style where appropriate without losing the user’s draft question.
- Project switching closes/resets the chat thread and transcript.
- Typecheck and npm test pass.

## Assumptions / Open Questions

- “Read only conversation chat” means an interactive chat that cannot mutate the repository, tickets, or board; it does not mean the transcript itself is non-interactive.
- Chat history can be ephemeral for the current open pane/session and does not need to persist across app restarts or project switches.
- A request-response implementation is acceptable for the first version; streaming token-by-token responses can be added later if needed.
- The chat should use the selected project’s configured model and reasoning effort, but safety settings for sandbox, approvals, network, and web search must be hard overridden to read-only.
- The pane is scoped to the project board, not an individual ticket detail view.

## Implementation Notes

- Local search tooling did not have rg available; additional research used grep/find. The provided bounded research also stopped after scanning 160 candidate files, but the affected app/API/Codex/test entry points were identified.
- The current worktree already contains unrelated .relay draft/run file changes; implementation should ignore those and not revert them.
- Keep the first pass out of the existing ticket run event system. Repository chat is not an implementation run and should not appear in ticket logs or affect scheduler concurrency.
- If future product direction requires persisted chat history or streaming, add that as a separate follow-up after this read-only pane is working.

## Research Metadata

- File inspected: tests/ticket-draft.test.ts - Matched terms: project, board, out, draft, createdraft, createticketdraft, ticketdraft; characters read: 12000; symbols: TicketDraftCodexClient, TicketDraftDependencies, TicketDraftStartDependencies, TicketDraftThread, readyStatus, createProject
  Matched lines:
  - 8: createTicketDraft,
  - 9: draftToCreateInput,
  - 10: extractTicketDraftUrls,
- File inspected: src/renderer/src/App.tsx - Matched terms: project, board, top, icon, will, out, draft, createticketdraft; characters read: 12000; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast, LocalAgentProgress, TicketSuggestionCreateState
  Matched lines:
  - 19: PanelLeftOpen,
  - 31: import type { CSSProperties, DragEvent, KeyboardEvent, ReactElement } from "react";
  - 34: BoardSnapshot,
- File inspected: src/main/services/codex/research.ts - Matched terms: project, top, out, draft, createdraft, createticketdraft, ticketdraft, ticketdraftschema; characters read: 12000; symbols: errorMessage, nowIso, DEFAULT_TICKET_DRAFT_RESEARCH_LIMITS, ResearchUrlExcerpt, TicketDraftResearchContext, CandidateResearchFile
  Matched lines:
  - 2: CreateDraftInput,
  - 3: TicketDraftResearch,
  - 4: TicketDraftResearchFile,
- File inspected: tests/ticket-draft-ui.test.tsx - Matched terms: project, board, icon, will, out, draft, createticketdraft, ticketdraft; characters read: 9798; symbols: TicketSuggestion, TicketSummary, ticketSummary, standardTitles, markup, ticket
  Matched lines:
  - 6: CreateTicketDraftMessage,
  - 7: DraftingTicketDetailLoading,
  - 46: detail: "Prioritized tickets will wait here before implementation starts."
- File inspected: docs/backend-effect-v4-upgrade-plan.md - Matched terms: like, project, board, top, icon, out, draft, createdraft; characters read: 12000; symbols: rather
  Matched lines:
  - 22: - Main Promise-facing boundary for renderer calls. Important channels include project registry, board reads, manual ticket operations, ticket draft creation, ticket update runs,...
  - 23: - Should remain the outer runtime adapter. Renderer-visible values must continue to match `src/shared/types.ts`.
  - 28: - Defines shared data contracts for project summaries, board snapshots, ticket front matter, draft research metadata, audit events, run JSONL lines, Codex events, IPC input type...
- File inspected: tests/ticket-suggestions.test.ts - Matched terms: project, board, out, draft, ticketdraft; characters read: 8298; symbols: TicketDraftCodexClient, TicketDraftThread, TicketSuggestionDependencies, readyStatus, createProject, projectPath
  Matched lines:
  - 8: TicketDraftServiceError,
  - 9: type TicketDraftCodexClient,
  - 10: type TicketDraftThread,
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

### 5/12/2026, 4:58:43 PM

Implemented the read-only repository chat pane.

**Summary**
- Added shared `RepositoryChatInput/Response` types, IPC channel, schema, main IPC method, and preload API.
- Added backend `sendRepositoryChatMessage` with start/resume thread behavior, read-only/no-network/no-web/no-approval overrides, Codex status/auth checks, and prompt context from project config + board tickets.
- Added board topbar chat icon, right-side chat pane, ephemeral transcript, pending/error states, Enter/Shift+Enter behavior, and project-switch reset.
- Added responsive CSS and status rail hiding while chat is open.
- Added backend and renderer tests.

**Files changed**
- `src/shared/types.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/methods/codex.ts`
- `src/main/services/schemas.ts`
- `src/main/services/codex/index.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/styles.css`
- `tests/backend.test.ts`
- `tests/ticket-draft-ui.test.tsx`

**Commands run**
- `npm run typecheck`
- `npm test`
- Supporting inspection commands: `sed`, `grep`, `ls`, `git status --short`, `git diff --stat`, `git diff --name-only`

**Tests**
- `npm run typecheck`: passed.
- `npm test`: passed, 129/129 tests. Existing esbuild warning about `import.meta` in CJS test bundling appeared.

**Subagent usage**
- `Raman` explored renderer/App/CSS anchors only; no files changed.
- `Linnaeus` explored backend Codex/test patterns only; no files changed.
- I integrated their findings into the local implementation.

**Remaining risks**
- I did not run a manual Electron UI smoke test. The behavior is covered by typecheck plus backend/static renderer tests. Existing unrelated `.relay` worktree changes were left untouched.


No Codex run has been started.
