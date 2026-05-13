---
schemaVersion: 1
id: tkt_01krh998j5j8w2cmbjm03pa7hx
title: Centralize renderer UI primitives and move IPC data state to TanStack Query
ticketType: task
status: todo
position: 20000
priority: high
effort: high
labels:
  - frontend
  - renderer
  - refactor
  - tanstack-query
  - components
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-13T18:23:46.757Z'
updatedAt: '2026-05-13T18:29:18.433Z'
authoringState: reviewing
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krh9ex6xqx3agv80nz4za0jz
lastRunStartedAt: null
---
# Centralize renderer UI primitives and move IPC data state to TanStack Query

## Context

Raise the Relay renderer to a production-grade structure by adding a typed TanStack Query layer between React and the preload IPC API, then migrating the main renderer surfaces to documented shared UI primitives for consistent controls and layout.

## Goal

Add `@tanstack/react-query` as an application dependency and wrap the renderer with a single `QueryClientProvider` configured for local IPC data, without changing the main/preload IPC contract.

## Decisions / Assumptions

- “Whole end to end task” means completing the renderer-wide foundation and migrating the main production surfaces in `App.tsx` plus existing renderer components, not changing backend storage, IPC channel contracts, or product workflows.
- Use TanStack Query v5 as the current stable React Query package line; do not add React Query Devtools unless a later ticket asks for it.
- Keep the current visual design language and CSS variables; this is a consistency/refactor task, not a redesign.
- Local form draft state, open/closed modal state, keyboard shortcut state, and drag/drop transient state should remain React local state rather than being forced into TanStack Query.

## Requirements

- Add `@tanstack/react-query` as an application dependency and wrap the renderer with a single `QueryClientProvider` configured for local IPC data, without changing the main/preload IPC contract.
- Create a typed renderer query/mutation layer that owns Relay API calls, query keys, invalidation rules, and common error handling for projects, board, ticket detail, clarifications, ticket references, Codex status, git metadata, run events, and run summaries.
- Migrate the board, ticket detail modal, floating ticket composer, repository chat/ticket suggestion modal paths, and existing renderer components to use the query layer for async data and mutations instead of ad hoc `useEffect` fetches and direct `getRelayApi()` calls.
- Add documented shared UI primitives under `src/renderer/src/components/ui/` for buttons, icon buttons, inputs, textareas, selects, fields, cards/panels, modal/dialog structure, and dropdown/select composition; migrate hand-styled native controls in the main renderer surfaces to those primitives while preserving current visual behavior.
- Preserve current keyboard shortcuts, drag/drop behavior, accessibility labels, loading/error states, toasts, and board refresh semantics after ticket/run events by using query invalidation/refetch rather than manual board reload state.

## Acceptance Criteria

- Renderer async data access is centralized: app components no longer call `getRelayApi()` directly for reads/mutations except through the new query layer or an explicit run-event subscription hook.
- The board, ticket detail modal, and floating ticket composer still load, mutate, and refresh correctly after create, save, move, delete, duplicate, subticket, clarification, and Codex run-event flows.
- A documented `components/ui` directory exists and the main renderer surfaces use shared primitives for buttons, icon buttons, inputs, textareas, selects, fields, cards/panels, and modal/dialog structure instead of repeated hand-styled native controls.
- Existing visual structure, CSS variable theme, accessibility labels, keyboard shortcuts, drag handles, ticket mention menu behavior, and toast/error states are preserved.
- `npm run typecheck`, `npm test`, and `npm run build` pass.

## Test Plan

- Add focused tests for query key stability and mutation invalidation behavior, e.g. `tests/renderer-query-hooks.test.tsx`, using a test `QueryClient` and mocked `window.relay`; add the test entry to `tests/run-tests.mjs:11-30`.
- Update existing static-render tests that assert markup/classes in `tests/ticket-draft-ui.test.tsx`, `tests/project-sidebar.test.tsx`, `tests/clarification-panel.test.tsx`, `tests/markdown-block.test.tsx`, and `tests/agent-progress.test.tsx` to expect the new primitive-generated markup without weakening accessibility assertions.
- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run build` to verify Electron/Vite bundling with TanStack Query.

## Implementation Notes

- Codebase finding: Root `package.json:21-33` has React/Electron renderer dependencies but no `@tanstack/react-query`; scripts at `package.json:17-19` provide `preview`, `test`, and `typecheck`. `package-lock.json` is present and must be updated with the dependency.
- Codebase finding: Renderer root `src/renderer/src/main.tsx:1-10` renders `<App />` directly inside `React.StrictMode`; there is no query provider or shared app provider beyond `KeyboardShortcutProvider` in `src/renderer/src/App.tsx:3440-3443`.
- Codebase finding: IPC is already typed at the preload boundary: `src/preload/index.ts:24-83` maps `RelayApi` methods to `ipcRenderer.invoke`, `src/shared/ipc.ts:39-75` defines the IPC contract, and `src/shared/types.ts:613-659` defines `RelayApi`. `src/renderer/src/lib/relayApi.ts:1-10` is currently only a thin `window.relay` accessor.
- Codebase finding: The renderer currently keeps server data in local component state and calls IPC directly: `RelayApp` owns projects/board/loading/git state at `src/renderer/src/App.tsx:3447-3463`, reads projects/board at `3524-3544`, listens to run events and reloads board at `3597-3610`, and mutates ticket moves at `3628-3636`.
- Codebase finding: The first production surfaces are concentrated in `src/renderer/src/App.tsx`: `BoardView` starts at `1050`, `FloatingTicketComposer` starts at `1690` and loads references/createDraft via direct IPC at `1729-1747` and `1839-1871`, and `TicketDetail` starts at `2054` with many local server-data states plus direct ticket/clarification/run-log reads at `2119-2225`. Shared component files are limited to `src/renderer/src/components/AgentActivity.tsx`, `ClarificationPanel.tsx`, `GitMetadata.tsx`, and `MarkdownBlock.tsx`; there is no `components/ui` primitive layer.
- Implementation: Add `@tanstack/react-query` to `package.json` and `package-lock.json`; create `src/renderer/src/lib/queryClient.ts` and wrap `<App />` in `QueryClientProvider` in `src/renderer/src/main.tsx`.
- Implementation: Create `src/renderer/src/lib/relayQueries.ts` exporting stable query keys plus hooks such as `useProjectsQuery`, `useBoardQuery(projectPath)`, `useTicketQuery(projectPath,ticketId)`, `useTicketClarificationsQuery`, `useTicketReferencesQuery`, `useCodexStatusQuery`, `useProjectGitMetadataQuery`, `useRunEventsQuery`, and mutation hooks for ticket/project actions with invalidation helpers.
- Implementation: Update `RelayApp` in `src/renderer/src/App.tsx` to derive projects, selected board, Codex status, and git metadata from query hooks; replace `loadProjects`, `loadBoard`, `boardRequestRef`, and git metadata request refs with query invalidation/refetch calls while keeping purely local UI state like selected project, search query, open modal IDs, and toast state local.
- Implementation: Update `FloatingTicketComposer` and `TicketDetail` in `src/renderer/src/App.tsx` to use the new reference/detail/clarification/run queries and create/save/move/delete/duplicate/subticket/Codex mutation hooks; route success paths through targeted invalidations for board, projects, ticket detail, clarifications, references, run logs, and status.
- Implementation: Create `src/renderer/src/components/ui/` primitives with concise JSDoc comments and a barrel export, then migrate direct controls in `App.tsx`, `ClarificationPanel.tsx`, `AgentActivity.tsx`, and `MarkdownBlock.tsx` to those primitives where they are interactive app controls; leave read-only markdown-rendered checkbox markup native if needed for semantic markdown output.
- `rg` was unavailable in the drafting environment, so codebase research used `find`, `grep`, `sed`, and `nl`. No URL research was needed.
- This is intentionally larger than a narrow refactor because the clarification answer requested both TanStack Query and component centralization as one end-to-end task; keep edits scoped to renderer data/UI architecture and avoid unrelated product changes.
- The query layer should preserve the existing preload `RelayApi` and shared IPC types rather than introducing new channels or bypassing `window.relay`.
- When replacing native elements with primitives, keep className passthroughs so existing CSS can be migrated incrementally instead of rewriting the full stylesheet in one pass.

## Codex Handoff

No Codex run has been started.
