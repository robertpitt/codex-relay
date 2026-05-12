---
schemaVersion: 1
id: tkt_01krdtm7bz1j098hdxjvj2js8m
title: Frontend refinement and completion pass
ticketType: epic
status: todo
position: 13000
priority: medium
labels:
  - epic
  - frontend
  - ui-polish
  - accessibility
parentEpicId: null
subticketIds:
  - tkt_01krdw9ncgewg1grnajw7ave1y
  - tkt_01krdw9ndnjhvy6vzvykgfxc4r
  - tkt_01krdw9nek8849hvbf6mrjmzng
  - tkt_01krdw9nfgd71mt8kp8pyk1wb7
  - tkt_01krdw9ngjt2n2rzvynwvdvwd1
blockedByIds: []
createdAt: '2026-05-12T10:09:54.047Z'
updatedAt: '2026-05-12T10:39:05.235Z'
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krdtm7asd1admek8hz8fa0n2
lastRunStartedAt: null
---
# Frontend refinement and completion pass

## Context

Improve Relay's existing desktop kanban UI with a scoped set of frontend polish tasks: responsive shell/sidebar behavior, board/card clarity, modal completeness, ticket detail hierarchy, and toast/status feedback. This is a refinement pass on the current product surface, not a redesign or backend/schema change.

## Codebase Findings

- `src/renderer/src/App.tsx:353` defines `ProjectSidebar`; it renders project disclosure rows, swimlane counts, selected state, and bottom `Reveal`/`Remove` actions through line 490.
- `src/renderer/src/App.tsx:494`-`839` contains board rendering: `DroppableColumn`, `TicketCardContent`, `DraggableCard`, and `BoardView`. Empty columns currently use `emptyColumnMessage(column.name)` at lines 325-328 with the same generic detail for every status.
- `src/renderer/src/App.tsx:756`-`793` renders the board topbar, project path, Git metadata pill, search, `Generate Tickets`, and `Create Ticket` shortcut button.
- `src/renderer/src/App.tsx:842`-`1066` renders generated ticket suggestions. `TicketSuggestionsModalContent` is exported and already covered by static-render tests in `tests/ticket-draft-ui.test.tsx:102`-`164`.
- `src/renderer/src/App.tsx:1068`-`1723` renders `CreateTicketModal`. It already tracks unsaved input, ticket references, Codex draft state, generated subtickets, and editable draft fields; the idea textarea has a ref at lines 1098-1100 but no mount-time focus behavior.
- `src/renderer/src/App.tsx:1725`-`2904` renders `TicketDetail`, including run controls, compact blocker/subtask/tag controls, draft-in-progress states, blocker manager, parent epic/subticket panels, clarification panel, agent update panel, editor, preview, activity, and danger actions.
- `src/renderer/src/App.tsx:2395`-`2400` shows ticket-detail loading as a bare spinner in the detail panel, unlike the more complete `DraftingTicketDetailLoading` exported at lines 251-260.
- `src/renderer/src/App.tsx:3130`-`3219` composes the app shell, empty selected-project state, status rail, modals, detail panel, and toast. Toasts are click-to-dismiss only at lines 3209-3217.
- `src/renderer/src/styles.css:1`-`64` defines the dark theme tokens, radii, type scale, shadows, focus ring, and motion curves used throughout the renderer.
- `src/renderer/src/styles.css:257`-`620` styles the app shell, sidebar, topbar, project metadata, topbar actions, and search input. Responsive changes start at `styles.css:2875`.
- `src/renderer/src/styles.css:657`-`1047` styles board columns, empty columns, cards, metadata pills, labels, and drag handles.
- `src/renderer/src/styles.css:1121`-`1435` styles modal backdrops, generic modal layout, create fields, draft messages, suggestion rows, draft editors, and subticket draft blocks.
- `src/renderer/src/styles.css:1792`-`2318` styles ticket detail panels, epic/subticket/blocker panels, clarification sections, ticket update panels, warning/error rows, and the draft loading panel.
- `src/renderer/src/styles.css:2761`-`2794` styles the toast and empty selected-project state; `styles.css:2985`-`2993` makes the status rail full-width on narrow screens, which can compete with bottom toast placement.
- `src/renderer/src/components/AgentActivity.tsx:165` exports `AgentProgressSummary`, and `src/renderer/src/components/AgentActivity.tsx:218` exports `AgentActivityPanel`; these are examples of extracting large frontend sections out of `App.tsx` while preserving the shared CSS token system.
- `src/renderer/src/components/ClarificationPanel.tsx:14` exports a focused panel component with null rendering when there are no questions at line 21 and compact Markdown rendering for question/answer content at lines 40-63.
- `src/renderer/src/components/GitMetadata.tsx:56` exports `GitMetadataPill`; it uses `clsx`, lucide icons, title text, and `aria-label` at lines 63-71, which is the established pattern for compact status pills.
- `tests/project-sidebar.test.tsx:44`-`79` covers sidebar disclosure behavior, swimlane visibility/counts, and active run labels with `renderToStaticMarkup`.
- `tests/ticket-draft-ui.test.tsx:37`-`81` covers run status pills, elapsed runtime, and `TicketCardContent`; lines 83-92 cover `DraftingTicketDetailLoading`; lines 102-164 cover suggestion modal states.
- `tests/create-ticket-mention-layout.test.ts:5`-`34` covers `getTicketReferenceMenuLayout`, including footer-aware placement and viewport sizing for the create modal mention menu.
- `package.json:18` defines `npm test` as `node tests/run-tests.mjs`; `package.json:19` defines `npm run typecheck`; `package.json:11` defines `npm run build`. No Playwright/browser test script is configured.
- Inspected src/shared/types.ts (Matched terms: create, epic, task, complete; symbols: RELAY_SCHEMA_VERSION, RELAY_TODO_STATUS, RELAY_READY_STATUS, RELAY_IN_PROGRESS_STATUS).
- Inspected tests/ticket-draft.test.ts (Matched terms: create, epic, task, frontend, complete; symbols: TicketDraftCodexClient, TicketDraftDependencies, TicketDraftStartDependencies, TicketDraftThread).
- Inspected src/renderer/src/App.tsx (Matched terms: create, epic, task, complete; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast).
- Inspected tests/schemas.test.ts (Matched terms: create, epic, task, complete; symbols: expectSchemaError, rendered, validDraftBase, validProjectConfigInput).
- Inspected tests/backend.test.ts (Matched terms: create, epic, task, complete; symbols: CodexRunDependencies, CreateCodexDependencies, CodexCliCandidate, createProject).
- Inspected src/main/services/schemas.ts (Matched terms: create, epic, task, complete; symbols: RelaySchema, nonEmptyString, numberSchema, unknownRecordSchema).
- Research limitation: Code search stopped after scanning 160 candidate files.

## Requirements

- Keep the current Relay desktop app model: dense local-first kanban, dark theme, sidebar + board + detail panel, modal workflows, and Codex status rail.
- Do not change shared ticket schemas, board persistence, ticket draft contracts, or Electron IPC behavior as part of this epic.
- Use existing frontend dependencies and patterns: React, `clsx`, lucide-react icons, `MarkdownBlock`, CSS variables in `styles.css`, and node:test static-render tests.
- Improve UI completeness through targeted polish that reduces overflow, clarifies states, improves accessibility labels/roles, and makes empty/loading/status states feel intentional.
- Preserve keyboard shortcut behavior for create ticket, modal escape handling, ticket navigation, and text-entry exclusions.
- Keep all new UI copy concise and operational; avoid marketing-style feature descriptions.
- Add focused tests for exported pure helpers or renderable components where practical, and use `npm run typecheck` plus `npm test` for validation.

## Implementation Plan

- Complete the subtickets in this order to reduce conflicts: shell/sidebar responsiveness, board/card clarity, modal polish, ticket detail polish, then toast/status feedback.
- Keep code changes scoped to `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`, existing renderer component files, and focused tests unless a subticket explicitly calls for a new small renderer component file.
- Preserve existing user workflows and data contracts while improving presentation, accessibility metadata, and responsive layout.
- Run the focused tests named by each subticket, then run `npm run typecheck` and `npm test` before closing the epic.

## Test Plan

- Run `npm run typecheck`.
- Run `npm test`.
- During implementation, use `npm run dev` for manual desktop verification of the board, create modal, ticket detail panel, status rail, and responsive breakpoints at approximately 1200px, 900px, 700px, and 520px widths.

## Acceptance Criteria

- The app shell, sidebar, board, modals, ticket detail panel, toast, and status rail all handle long titles/paths/labels without text overlap or incoherent clipping at configured responsive breakpoints.
- Empty, loading, error, warning, active, success, and disabled states are visually distinct and accessible with appropriate roles, labels, titles, or status text.
- Existing keyboard shortcuts, ticket creation, ticket movement, ticket detail editing, subticket linking, blocker management, and Codex status behavior remain intact.
- Relevant node:test coverage is added or updated for newly exported helpers/components and existing affected static-render tests continue to pass.
- No backend schema, IPC contract, or persistence behavior is changed by this frontend refinement epic.

## Assumptions / Open Questions

- The requested cleanup is a targeted refinement pass rather than a full visual redesign.
- The current dark, dense, utilitarian desktop UI direction should remain intact.
- Manual viewport verification is acceptable for responsive polish because the repository does not currently define a Playwright/browser visual test script.
- Subtickets may touch adjacent regions of `App.tsx` and `styles.css`; implement sequentially or coordinate carefully to avoid merge conflicts.

## Implementation Notes

- `rg` was unavailable in the local environment, so research used `find`, `grep`, `sed`, and `nl` instead.
- The bounded pre-draft search noted scanning stopped after 160 candidate files; additional local reads focused on renderer entry points, styles, and existing frontend tests.
- No external URLs were part of the user's idea.

## Research Metadata

- File inspected: src/shared/types.ts - Matched terms: create, epic, task, complete; characters read: 12000; symbols: RELAY_SCHEMA_VERSION, RELAY_TODO_STATUS, RELAY_READY_STATUS, RELAY_IN_PROGRESS_STATUS, RELAY_NEEDS_CLARIFICATION_STATUS, RELAY_REVIEW_STATUS
  Matched lines:
  - 8: export const RELAY_COMPLETED_STATUS = "completed";
  - 17: { id: RELAY_COMPLETED_STATUS, name: "Completed", position: 7000, terminal: true }
  - 21: export type TicketType = "task" | "epic";
- File inspected: tests/ticket-draft.test.ts - Matched terms: create, epic, task, frontend, complete; characters read: 12000; symbols: TicketDraftCodexClient, TicketDraftDependencies, TicketDraftStartDependencies, TicketDraftThread, readyStatus, createProject
  Matched lines:
  - 8: createTicketDraft,
  - 9: draftToCreateInput,
  - 39: const createProject = async (): Promise<string> => {
- File inspected: src/renderer/src/App.tsx - Matched terms: create, epic, task, complete; characters read: 12000; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast, LocalAgentProgress, TicketSuggestionCreateState
  Matched lines:
  - 5: import { createPortal } from "react-dom";
  - 72: createTicketShortcutLabel,
  - 73: isCreateTicketShortcut,
- File inspected: tests/schemas.test.ts - Matched terms: create, epic, task, complete; characters read: 12000; symbols: expectSchemaError, rendered, validDraftBase, validProjectConfigInput, createdAt, parsed
  Matched lines:
  - 45: createdAt: "2026-05-11T09:00:00.000Z",
  - 60: const createdAt = new Date("2026-05-11T09:00:00.000Z");
  - 68: createdAt,
- File inspected: tests/backend.test.ts - Matched terms: create, epic, task, complete; characters read: 12000; symbols: CodexRunDependencies, CreateCodexDependencies, CodexCliCandidate, createProject, projectPath, auditEvents
  Matched lines:
  - 10: createCodex,
  - 17: type CreateCodexDependencies
  - 23: createClarificationQuestions,
- File inspected: src/main/services/schemas.ts - Matched terms: create, epic, task, complete; characters read: 12000; symbols: RelaySchema, nonEmptyString, numberSchema, unknownRecordSchema, mutableArray, withDefault
  Matched lines:
  - 11: CreateDraftInput,
  - 12: EpicSubticketCreateInput,
  - 13: EpicSubticketLinkInput,
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

No Codex run has been started.
