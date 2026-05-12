---
schemaVersion: 1
id: tkt_01krcvs0pe98a85ewxnsf7g6ys
title: Guard IPC filesystem access to registered projects and safe Relay IDs
ticketType: task
status: todo
position: 11000
priority: high
labels:
  - backend
  - ipc
  - security
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T01:10:45.198Z'
updatedAt: '2026-05-12T01:14:20.622Z'
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krcvs0n2891f825kqk6twna0
lastRunStartedAt: null
---
# Guard IPC filesystem access to registered projects and safe Relay IDs

## Context

Renderer IPC calls currently pass project paths and ticket identifiers into backend filesystem helpers. Add a shared main-process guard layer so IPC handlers only operate on exact project roots registered in Relay, and only use safe single-segment Relay identifiers for ticket/run path components.

## Codebase Findings

- `src/shared/ipc.ts:33-66` defines IPC channels that accept renderer-supplied `projectPath`, `ticketId`, and `runId` values for project, board, ticket, and Codex run log operations.
- `src/main/ipc/RelayIpc.ts:40-44` decodes payload shape with Effect schemas before invoking domain handlers, but those schemas only prove types, not registry membership or path-component safety.
- `src/main/services/registry/index.ts:36-55` normalizes project paths with `pathResolve` when upserting; `src/main/services/registry/index.ts:58-67` removes projects by normalized exact path. This provides the existing source of truth for registered project roots.
- `src/main/ipc/methods/projects.ts:75-98` accepts `projectPath` for remove/read/gitMetadata/reveal handlers and passes it directly to registry, storage, Git, or Electron shell helpers without checking that the path is registered.
- `src/main/ipc/methods/board.ts:8-12` passes renderer-supplied `projectPath` directly to `readBoard`.
- `src/main/ipc/methods/tickets.ts:66-214` exposes ticket IPC methods that pass renderer-supplied `projectPath` plus ticket identifiers into storage and Codex services; `ticket:read` only calls `pathResolve` at `src/main/ipc/methods/tickets.ts:129-133` and does not verify registry membership.
- `src/main/ipc/methods/codex.ts:24-66` exposes Codex preflight/start/resume and run-log reads from renderer-supplied objects/strings; `codex:readRunEvents` includes `runId`, which is also a filesystem path component.
- `src/main/services/storage/paths.ts:3-15` builds Relay paths under `pathResolve(projectPath)` and appends `${ticketId}.md` / `${ticketId}.json`; unsafe IDs containing separators or dot segments can change the target path.
- `src/main/services/storage/index.ts:479-490` reads tickets from `ticketPath(resolvedProjectPath, ticketId)`, and `src/main/services/storage/index.ts:544-558` writes tickets to `ticketPath(projectPath, ticket.frontMatter.id)`.
- `src/main/services/storage/index.ts:1181-1199` reads/writes clarification stores through `clarificationStorePath(projectPath, ticketId)`, so clarification IPC handlers also need ticket ID validation.
- `src/main/services/storage/index.ts:1328-1336` deletes tickets by renaming `ticketPath(projectPath, ticketId)` into trash using `${ticketId}.md`; this must not accept path traversal values.
- `src/main/services/run-events/index.ts:190-210` writes run logs to `pathJoin(runsPath(projectPath), ticketId, `${runId}.jsonl`)`, and `src/main/services/run-events/index.ts:261-292` reads run events/summaries from the same path shape.
- `src/main/services/storage/ids.ts:1-3` generates Relay IDs as `${prefix}_${ulid().toLowerCase()}`; existing tests also use a legacy-safe ID like `tkt_legacy` at `tests/backend.test.ts:378-383`.
- `tests/run-tests.mjs:11-30` has a fixed test entry point list; any new `tests/ipc-guards.test.ts` file must be added there. `npm test` runs this harness via `package.json:18`.
- Inspected src/main/ipc/methods/projects.ts (Matched terms: add, shared, ipc, project; symbols: AnyRelayIpcMethod, projectSummariesFromRegistry, registry, addProjectFolder).
- Inspected src/shared/ipc.ts (Matched terms: add, shared, ipc, project; symbols: RelayIpcContract, RelayIpcChannel, RelayIpcArgs, RelayIpcResult).
- Inspected docs/backend-effect-v4-upgrade-plan.md (Matched terms: shared, validation, ipc, filesystem, operations, target, project; symbols: rather).
- Inspected src/main/services/io/filesystem.ts (Matched terms: add, filesystem, target; symbols: RelayFileStat, systemErrorTag, code, platformError).
- Inspected docs/backend-effect-v4-audit.md (Matched terms: add, shared, validation, ipc, operations, target, project; symbols: should).
- Inspected src/main/ipc/methods/tickets.ts (Matched terms: shared, ipc, project; symbols: AnyRelayIpcMethod, ticketIpcMethods, parsed, resolvedProjectPath).
- Research limitation: Code search stopped after scanning 160 candidate files.

## Requirements

- Add one shared main-process IPC guard module instead of duplicating ad hoc checks in every handler.
- Project path guard must resolve the incoming path with the same `pathResolve` semantics used by the registry and allow only exact matches against `readRegistry().projects[].path` after normalization.
- Project path guard must return the normalized registered project path, and IPC handlers must pass that normalized value to downstream storage/Git/Codex/shell calls.
- Do not require registry membership for `projects:list` or `projects:addFolder`; `projects:addFolder` is the flow that lets the user choose and register a new root.
- Validate every IPC-supplied ticket ID path component before it reaches storage or Codex services, including `ticketId`, `epicId`, optional `parentEpicId`, `beforeTicketId`, `afterTicketId`, `blockedByIds`, `subticketIds`, and `ticket.frontMatter.id` when present in IPC input objects.
- Validate `runId` on `codex:readRunEvents` because it is used as a run-log filename.
- Safe Relay identifiers must be non-empty single path segments containing only ASCII letters, digits, `_`, or `-`, must not contain `.`, `/`, `\`, path separators, URL-like schemes, or whitespace, and should cap length at 128 characters.
- Invalid project paths or identifiers must throw before filesystem, Git, shell, or Codex service calls are made.
- Keep domain storage services usable in backend tests with temporary project paths; enforce registry membership at the IPC boundary, not deep inside storage helpers.
- Preserve existing IPC contract names and renderer API shapes.

## Implementation Plan

- Create `src/main/ipc/guards.ts` exporting shared helpers such as `assertRegisteredProjectPath(projectPath): Promise<string>`, `assertSafeRelayIdentifier(value, label): string`, `assertSafeTicketId(value, label): string`, and small object helpers for parsed inputs with `projectPath`. Use `readRegistry` plus `pathResolve` for exact registered-root checks.
- Update `src/main/ipc/methods/projects.ts` so `projects:removeFromSidebar`, `projects:read`, `projects:gitMetadata`, and `projects:revealInFinder` call `assertRegisteredProjectPath` first and use the returned path. Leave `projects:list` and `projects:addFolder` unchanged except for imports.
- Update `src/main/ipc/methods/board.ts` so `board:read` guards `projectPath` before calling `readBoard`.
- Update `src/main/ipc/methods/tickets.ts` so every handler that parses or receives a `projectPath` guards it before calling storage/Codex helpers. For object inputs, parse first, then create a shallow copy with the normalized `projectPath`.
- In `src/main/ipc/methods/tickets.ts`, validate all ticket ID fields that can flow to path-based storage calls: simple `ticketId` args; `epicId` and `ticketId` in subticket link/unlink/create inputs; `ticketId`, `beforeTicketId`, and `afterTicketId` in move input; `ticket.frontMatter.id`, `parentEpicId`, `subticketIds`, and `blockedByIds` in save input; optional `ticketId` in createDraft input; `ticketId` in agent update and clarification inputs.
- Update `src/main/ipc/methods/codex.ts` so preflight/start/resume parse `StartRunInput`, guard `projectPath`, validate `ticketId`, and pass the normalized object onward. Also guard `projectPath`, validate `ticketId`, and validate `runId` for run-event read handlers.
- Add `tests/ipc-guards.test.ts` covering the guard helpers and at least one representative IPC handler rejection before domain work: registered path resolves and passes, unregistered sibling path rejects, safe IDs like `tkt_legacy` pass, traversal/dot/separator IDs reject, and `codex:readRunEvents` rejects an unsafe `runId`.
- Add the new guard test file to the `entryPoints` array in `tests/run-tests.mjs`.
- Run the focused test harness with `npm test` and the type checker with `npm run typecheck`.

## Test Plan

- `npm test`
- `npm run typecheck`
- New guard tests should assert `assertRegisteredProjectPath` accepts a path written into the registry via `writeRegistry` and rejects an unregistered temp directory without creating `.relay` files.
- New safe ID tests should assert acceptance of `tkt_legacy` and generated-style IDs, and rejection of values like `../secret`, `foo/bar`, `foo\\bar`, `.hidden`, `ticket.md`, empty string, whitespace, and strings longer than 128 characters.
- New IPC-level test should call representative method handlers directly with unsafe input and assert rejection before the underlying service would read/write filesystem paths.

## Acceptance Criteria

- All renderer-supplied IPC project paths that can trigger filesystem, Git, Electron shell, or Codex project operations are checked against the Relay registry before use.
- IPC handlers pass normalized registered project roots downstream; equivalent relative or unregistered paths do not operate on arbitrary folders.
- Unsafe ticket IDs and run IDs are rejected before constructing ticket, clarification, trash, or run-log paths.
- Existing project add/list behavior still works, and adding a new folder still initializes/registers the selected directory.
- Existing IPC channel names, shared contract types, and renderer call signatures remain unchanged.
- The new tests fail on the current unguarded implementation and pass after the guard layer is wired into handlers.
- `npm test` and `npm run typecheck` pass.

## Assumptions / Open Questions

- Registry membership should be exact-root only. A registered project's subdirectory should not be accepted as a project root for IPC filesystem operations.
- Use normalized `pathResolve` comparisons rather than `realpath`; this matches the existing registry behavior and avoids changing symlink semantics.
- Safe identifier validation is intentionally format-safe rather than prefix-strict: allow ASCII alphanumeric, underscore, and hyphen IDs such as `tkt_legacy` for legacy compatibility, while rejecting all dot and separator characters.
- This ticket protects the IPC boundary. Storage services may continue to accept arbitrary temporary project paths for direct backend tests and internal service composition.

## Implementation Notes

- Initial bounded research scanned 160 candidate files and may not include every caller, but direct follow-up reads covered the relevant IPC method files, registry, storage path helpers, run events, and test harness.
- `rg` was unavailable in the local shell during drafting, so recursive grep and direct file reads were used.
- Be careful with `tests/run-tests.mjs`: new test files are not auto-discovered because the harness bundles a fixed `entryPoints` list.

## Research Metadata

- File inspected: src/main/ipc/methods/projects.ts - Matched terms: add, shared, ipc, project; characters read: 3922; symbols: AnyRelayIpcMethod, projectSummariesFromRegistry, registry, addProjectFolder, electronDialog, result
  Matched lines:
  - 2: import type { AddProjectResult } from "../../../shared/types";
  - 6: import { readRegistry, removeProjectPath, upsertProjectPath } from "../../services/registry";
  - 9: import { initializeProject, summarizeProject } from "../../services/storage";
- File inspected: src/shared/ipc.ts - Matched terms: add, shared, ipc, project; characters read: 5470; symbols: RelayIpcContract, RelayIpcChannel, RelayIpcArgs, RelayIpcResult, relayIpcChannels, satisfies
  Matched lines:
  - 2: AddProjectResult,
  - 17: ProjectSummary,
  - 33: export type RelayIpcContract = {
- File inspected: docs/backend-effect-v4-upgrade-plan.md - Matched terms: shared, validation, ipc, filesystem, operations, target, project; characters read: 12000; symbols: rather
  Matched lines:
  - 14: The existing Effect usage is an adapter-style first pass, not a complete Effect architecture. Most public backend functions remain Promise-based, which is correct for Electron I...
  - 18: ### Runtime and IPC Boundaries
  - 21: - Owns the Electron app lifecycle, window creation, global process error logging, and all `ipcMain.handle` registrations.
- File inspected: src/main/services/io/filesystem.ts - Matched terms: add, filesystem, target; characters read: 6323; symbols: RelayFileStat, systemErrorTag, code, platformError, tryFs, fileType
  Matched lines:
  - 1: import { Effect, FileSystem, Layer, Option, PlatformError } from "effect";
  - 2: import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
  - 6: readonly type: FileSystem.File.Type;
- File inspected: docs/backend-effect-v4-audit.md - Matched terms: add, shared, validation, ipc, operations, target, project; characters read: 7876; symbols: should
  Matched lines:
  - 3: Scope: backend and shared contract surfaces only. Renderer matches for `effect` are React `useEffect` calls in `src/renderer/src/App.tsx`, `src/renderer/src/components/AgentActi...
  - 9: - The current pinned target in this worktree is `effect@4.0.0-beta.65`, recorded in `package.json`, `package-lock.json`, and `docs/effect-v4-migration.md`.
  - 10: - No separate `effect-smol` npm package is declared; the target is the `effect` package published from the effect-smol line.
- File inspected: src/main/ipc/methods/tickets.ts - Matched terms: shared, ipc, project; characters read: 8237; symbols: AnyRelayIpcMethod, ticketIpcMethods, parsed, resolvedProjectPath, meta, saved
  Matched lines:
  - 1: import type { TicketDraftStartResult, TicketSuggestionsGenerateResult } from "../../../shared/types";
  - 44: import { defineRelayIpcMethod, type AnyRelayIpcMethod } from "../RelayIpc";
  - 45: import { relayIpcChannels } from "../channels";
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

No Codex run has been started.
