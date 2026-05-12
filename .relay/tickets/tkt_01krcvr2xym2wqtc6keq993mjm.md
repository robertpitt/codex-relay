---
schemaVersion: 1
id: tkt_01krcvr2xym2wqtc6keq993mjm
title: Add Project Settings Dialog for Codex Run Options
ticketType: task
status: todo
position: 10000
priority: high
labels:
  - codex
  - settings
  - frontend
  - ipc
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T01:10:14.718Z'
updatedAt: '2026-05-12T01:15:32.061Z'
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krcvr2wny868ht3sb2mc1wpe
lastRunStartedAt: null
---
# Add Project Settings Dialog for Codex Run Options

## Context

Relay already stores per-project Codex settings in `.relay/project.json` and the Codex service consumes them, but the renderer has no project settings UI or IPC mutation path. Add a selected-project settings dialog that lets users edit Codex model defaults, reasoning effort, approval policy, sandbox mode, non-Git runs, network/web search, additional directories, and implementation-run concurrency.

## Codebase Findings

- `src/shared/types.ts:51-62` defines `ProjectSettings` with the exact stored fields needed for this dialog: `defaultModel`, `defaultModelReasoningEffort`, `defaultApprovalPolicy`, `defaultSandboxMode`, `allowNonGitCodexRuns`, `codexNetworkAccessEnabled`, `codexWebSearchMode`, `codexAdditionalDirectories`, and `agentConcurrency`.
- `src/shared/types.ts:161-164` shows `BoardSnapshot` already includes `config: ProjectConfig | null`, so the renderer can populate the dialog from `board.config.settings` after `board:read`.
- `src/shared/types.ts:530-538`, `src/shared/ipc.ts:33-39`, and `src/preload/index.ts:26-34` show the projects API currently supports list/add/read/git metadata/reveal only; there is no settings update method exposed to the renderer.
- `src/main/services/schemas.ts:179-194` validates project settings enums and defaults: reasoning effort is `null|minimal|low|medium|high|xhigh`, approval is `untrusted|on-request|on-failure|never`, sandbox is `read-only|workspace-write|danger-full-access`, web search is `disabled|cached|live`, and `agentConcurrency` uses the existing integer-minimum schema.
- `src/main/services/storage/index.ts:83-95` sets conservative defaults: model/reasoning unset, approval `on-request`, sandbox `workspace-write`, non-Git runs false, network false, web search disabled, no extra directories, concurrency 1.
- `src/main/services/storage/index.ts:192-200` provides `readProjectConfig`/`writeProjectConfig`; `writeProjectConfig` updates `updatedAt` and writes normalized config. `src/main/services/storage/index.ts:409-414` shows `readBoard` returns the full config after reading tickets.
- `src/main/services/codex/index.ts:279-291` maps project settings into SDK `ThreadOptions` for model, reasoning effort, approval policy, sandbox mode, `skipGitRepoCheck`, and `additionalDirectories`.
- `src/main/services/codex/index.ts:294-307` keeps draft/update-style bounded threads network-disabled, while implementation runs use `codexNetworkAccessEnabled` and `codexWebSearchMode`. The settings dialog should not change that runtime policy.
- `src/main/services/codex/index.ts:176-180` reads `config.settings.agentConcurrency` when draining queued implementation runs, so saved concurrency already affects scheduler behavior on subsequent drains.
- `src/main/services/codex/index.ts:1938-1945` blocks implementation preflight when Codex execution is disabled or the project is not a Git repo and `allowNonGitCodexRuns` is false; the existing error text already points users to project settings for non-Git runs.
- `src/main/services/codex/index.ts:2480-2481` documents that interactive approval submission is not exposed by the current SDK; this ticket should only edit the stored approval policy, not implement approval handling.
- `src/renderer/src/App.tsx:756-793` is the selected project topbar/action area where a Settings button can be added. Existing modal patterns are at `src/renderer/src/App.tsx:1038-1064` and `src/renderer/src/App.tsx:1440-1456`.
- `src/renderer/src/App.tsx:2923-3205` owns selected project, board, modal-open state, refresh functions, and modal rendering; add settings modal state there and refresh the board/project list after saving.
- `src/renderer/src/styles.css:1121-1177` defines shared modal styling; `src/renderer/src/styles.css:1343-1352` defines `.field`; `src/renderer/src/styles.css:2974-3020` contains responsive modal/action rules that the new dialog should fit into.
- `tests/ipc-contract.test.ts:13-24` asserts every `relayIpcChannels` entry has one registered schema-backed method, so adding a project settings IPC channel requires updating the channel map and `projectIpcMethods`.
- `tests/schemas.test.ts:98-135` already covers legacy defaults and enum validation for project settings, and `tests/schemas.test.ts:176-207` covers concurrency validation. Extend these tests for the new update input schema.
- `tests/backend.test.ts:908-970` verifies saved settings are passed into Codex implementation thread options, including model, reasoning effort, approval policy, network/web search, and additional directories.
- `tests/project-sidebar.test.tsx:1-42` demonstrates the current renderer static-markup test style for exported App components; add settings dialog render coverage there instead of creating a new test file that would require `tests/run-tests.mjs` changes.
- Inspected tests/schemas.test.ts (Matched terms: add, project, settings, codex, model, reasoning, effort, approval; symbols: expectSchemaError, rendered, validDraftBase, validProjectConfigInput).
- Inspected src/main/services/codex/index.ts (Matched terms: add, project, settings, codex, model, reasoning, effort, approval; symbols: CodexOptions, Input, Thread, ThreadEvent).
- Inspected src/main/services/schemas.ts (Matched terms: add, project, settings, codex, model, reasoning, effort, approval; symbols: RelaySchema, nonEmptyString, numberSchema, unknownRecordSchema).
- Inspected src/shared/types.ts (Matched terms: add, project, settings, codex, model, reasoning, effort, approval; symbols: RELAY_SCHEMA_VERSION, RELAY_TODO_STATUS, RELAY_READY_STATUS, RELAY_IN_PROGRESS_STATUS).
- Inspected src/main/services/codex/research.ts (Matched terms: add, project, codex, draft, createdraft, createticketdraft, ticketdraft, ticketdraftschema; symbols: errorMessage, nowIso, DEFAULT_TICKET_DRAFT_RESEARCH_LIMITS, ResearchUrlExcerpt).
- Inspected tests/ticket-draft.test.ts (Matched terms: project, settings, dialog, codex, mode, draft, createdraft, createticketdraft; symbols: TicketDraftCodexClient, TicketDraftDependencies, TicketDraftStartDependencies, TicketDraftThread).
- Research limitation: Code search stopped after scanning 160 candidate files.

## Requirements

- Add a selected-project settings entry point in the board topbar using a lucide settings icon and clear accessible label.
- Create an accessible modal dialog for the selected project, populated from `board.config.settings`, with controlled fields for default model, reasoning effort, approval policy, sandbox mode, allow non-Git Codex runs, network access, web search mode, additional directories, and agent concurrency.
- Use a free-form model text input; trim whitespace and persist an empty value as `null` so Codex uses the SDK default model.
- Use select controls for reasoning effort, approval policy, sandbox mode, and web search mode, with option values matching the existing schema enums exactly.
- Use checkbox/toggle-style controls for binary settings (`allowNonGitCodexRuns` and `codexNetworkAccessEnabled`).
- Use a number input for `agentConcurrency` with integer validation and a minimum of 1 before saving.
- Represent `codexAdditionalDirectories` as one path per line in the dialog; trim entries, drop blank lines, and deduplicate while preserving order before saving.
- Add a typed renderer-to-main update path for project settings. The update must merge only the dialog-managed fields into existing `config.settings` and preserve unexposed settings such as `ticketDraftingEnabled` and `codexExecutionEnabled`.
- After saving, update `.relay/project.json`, refresh the selected board/config in renderer state, update the project summary in the sidebar, close the modal, and show a success toast.
- On save failure or validation failure, keep the dialog open and show an error message/toast without mutating local UI state as if the save succeeded.
- Cancel/close must discard unsaved changes and leave the project config unchanged.
- Do not alter Codex runtime semantics beyond exposing the existing settings. In particular, drafting and ticket-update bounded threads must remain network/web-search disabled as they are today.

## Implementation Plan

- Extend `src/shared/types.ts` with a `ProjectSettingsUpdateInput` type containing only the dialog-managed fields, then add `projects.updateSettings(projectPath, settings)` to `RelayApi`.
- Extend `src/shared/ipc.ts` with a `projects:updateSettings` contract entry and `relayIpcChannels.projectsUpdateSettings`.
- Add `projectSettingsUpdateInputSchema` in `src/main/services/schemas.ts` using the existing enum literals and `agentConcurrencySchema`; include `defaultModel: Schema.NullOr(Schema.String)` and `codexAdditionalDirectories` as a string array.
- Add an exported storage helper in `src/main/services/storage/index.ts`, for example `updateProjectSettings(projectPath, input)`, that reads the current config, trims `defaultModel`, converts blank model to `null`, normalizes/deduplicates `codexAdditionalDirectories`, merges the patch over `config.settings`, and writes via `writeProjectConfig`.
- Wire `src/main/ipc/methods/projects.ts` so `projects:updateSettings` parses the update schema, calls the storage helper, then returns `readBoard(projectPath)` so the renderer receives the refreshed `BoardSnapshot`.
- Expose the new API in `src/preload/index.ts` by invoking the new IPC channel from `api.projects.updateSettings`.
- In `src/renderer/src/App.tsx`, add settings modal state to `RelayApp`, include that state in the `modal-open` class condition, reset/close it on project switches, and render the modal when `board`, `selectedPath`, and `board.config` are available.
- Add a Settings button to `BoardView` topbar actions and thread an `onOpenSettings` prop from `RelayApp`; use the lucide `Settings` icon and an accessible title/label.
- Implement and export a `ProjectSettingsModal` component in `src/renderer/src/App.tsx` following existing modal structure and `useShortcutOverlay` Escape behavior. It should initialize local form state from props, validate locally, call `getRelayApi().projects.updateSettings`, and delegate the returned board to a parent `onSaved(nextBoard)` callback.
- In `RelayApp`, handle `onSaved(nextBoard)` by setting `board`, calling `updateProjectFromBoard(nextBoard)`, refreshing project git metadata only if needed by existing flows, closing the modal, and showing a success toast.
- Add CSS in `src/renderer/src/styles.css` for a compact settings modal layout, setting sections/rows, checkbox/toggle rows that do not inherit `input { width: 100%; }` behavior, additional-directory textarea sizing, inline validation errors, and mobile stacking consistent with existing modal breakpoints.
- Add schema tests in `tests/schemas.test.ts` for valid update input values, invalid approval/reasoning/web-search/concurrency values, and preservation of accepted array fields.
- Add backend tests in `tests/backend.test.ts` for `updateProjectSettings`: verify `.relay/project.json` is updated, `updatedAt` changes, blank model becomes `null`, directory entries are trimmed/deduped, and unexposed settings are preserved.
- Add renderer static-markup coverage in `tests/project-sidebar.test.tsx` for `ProjectSettingsModal` showing the expected fields, current selected enum values, current additional directories, and accessible dialog labelling.
- Rely on `tests/ipc-contract.test.ts` to verify the new IPC channel is registered exactly once with payload/result schemas after updating the channel map.

## Test Plan

- Run `npm test` to execute schema, backend, IPC contract, and renderer static-markup tests.
- Run `npm run typecheck` to verify shared IPC/API type changes compile through main, preload, and renderer.
- Manual validation with `npm run dev`: open a project, open Settings from the board topbar, change each field, save, reopen the dialog, and confirm persisted values match `.relay/project.json`.
- Manual validation with a non-Git test folder: confirm preflight still blocks by default and stops blocking after enabling Allow non-Git Codex runs in the dialog.
- Manual validation for responsive layout: narrow the app below the existing mobile breakpoint and confirm the settings modal fields and footer controls do not overlap or overflow.

## Acceptance Criteria

- A selected project has a visible Settings action in the topbar that opens an accessible project settings dialog.
- The dialog displays the current stored Codex settings for model, reasoning effort, approval policy, sandbox mode, non-Git runs, network access, web search mode, additional directories, and concurrency.
- Saving valid changes persists them to `.relay/project.json`, updates `updatedAt`, refreshes the current board/config in the UI, and closes the dialog with a success toast.
- Blank model input persists as `null`; reasoning default persists as `null`; additional directory lines are trimmed, blank lines are removed, and duplicates are removed while preserving first occurrence order.
- Invalid concurrency values such as empty, zero, negative, or decimal values are rejected before save with a visible error and no persisted config change.
- The settings update preserves existing unexposed settings including `ticketDraftingEnabled` and `codexExecutionEnabled`.
- Existing Codex implementation runs continue to receive saved settings through `implementationThreadOptionsForProject`; bounded ticket drafting/update network and web-search restrictions remain unchanged.
- The new IPC channel is present in the typed contract, registered in main IPC methods, exposed through preload, and covered by the existing IPC contract test.
- The modal can be cancelled/closed without saving and leaves the project config unchanged.
- `npm test` and `npm run typecheck` pass.

## Assumptions / Open Questions

- This is a task, not an epic.
- The dialog is scoped to the currently selected project and is opened from the board topbar.
- The first implementation exposes only the settings named in the idea; existing `ticketDraftingEnabled` and `codexExecutionEnabled` are preserved but not surfaced in this dialog.
- Model names are intentionally free-form because Relay does not currently have a local model catalog API.
- Additional directories are edited as newline-separated paths in this iteration; the implementation does not need to add an Electron folder picker.
- Additional directory existence is not validated on save so users can configure directories that will be created later or are temporarily unavailable.
- Saved network and web-search values follow the existing Codex service behavior: they affect implementation runs, while draft and ticket-update flows remain bounded.
- Changing concurrency does not need to immediately wake already queued runs; it must persist and be honored by the existing scheduler on subsequent drains.

## Implementation Notes

- Bounded research found no existing renderer settings dialog or project settings mutation IPC. The work is primarily adding a UI and update path around settings that already exist and are already consumed by Codex services.
- Current local code search in the provided research stopped after scanning 160 candidate files, but the core affected files and tests were identified from the inspected source.
- The repository worktree had unrelated modified and untracked files during drafting; implementation should avoid reverting unrelated changes.
- Do not attempt to implement interactive approval submission in this ticket; `approveCodexAction` currently throws because the SDK does not expose that capability.

## Research Metadata

- File inspected: tests/schemas.test.ts - Matched terms: add, project, settings, codex, model, reasoning, effort, approval; characters read: 12000; symbols: expectSchemaError, rendered, validDraftBase, validProjectConfigInput, createdAt, parsed
  Matched lines:
  - 7: projectConfigSchema,
  - 8: relayCodexEventSchema,
  - 10: ticketDraftSchema,
- File inspected: src/main/services/codex/index.ts - Matched terms: add, project, settings, codex, model, reasoning, effort, approval; characters read: 12000; symbols: CodexOptions, Input, Thread, ThreadEvent, ThreadItem, ThreadOptions
  Matched lines:
  - 2: import { Codex, type CodexOptions, type Input, type Thread, type ThreadEvent, type ThreadItem, type ThreadOptions } from "@openai/codex-sdk";
  - 8: type CodexRunStartResult,
  - 9: type CodexRunPreflightResult,
- File inspected: src/main/services/schemas.ts - Matched terms: add, project, settings, codex, model, reasoning, effort, approval; characters read: 12000; symbols: RelaySchema, nonEmptyString, numberSchema, unknownRecordSchema, mutableArray, withDefault
  Matched lines:
  - 11: CreateDraftInput,
  - 15: ProjectConfig,
  - 16: ProjectSettings,
- File inspected: src/shared/types.ts - Matched terms: add, project, settings, codex, model, reasoning, effort, approval; characters read: 12000; symbols: RELAY_SCHEMA_VERSION, RELAY_TODO_STATUS, RELAY_READY_STATUS, RELAY_IN_PROGRESS_STATUS, RELAY_NEEDS_CLARIFICATION_STATUS, RELAY_REVIEW_STATUS
  Matched lines:
  - 25: | "drafting"
  - 26: | "draft_failed"
  - 27: | "draft_complete"
- File inspected: src/main/services/codex/research.ts - Matched terms: add, project, codex, draft, createdraft, createticketdraft, ticketdraft, ticketdraftschema; characters read: 12000; symbols: errorMessage, nowIso, DEFAULT_TICKET_DRAFT_RESEARCH_LIMITS, ResearchUrlExcerpt, TicketDraftResearchContext, CandidateResearchFile
  Matched lines:
  - 2: CreateDraftInput,
  - 3: TicketDraftResearch,
  - 4: TicketDraftResearchFile,
- File inspected: tests/ticket-draft.test.ts - Matched terms: project, settings, dialog, codex, mode, draft, createdraft, createticketdraft; characters read: 12000; symbols: TicketDraftCodexClient, TicketDraftDependencies, TicketDraftStartDependencies, TicketDraftThread, readyStatus, createProject
  Matched lines:
  - 7: cancelCodexRun,
  - 8: createTicketDraft,
  - 9: draftToCreateInput,
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

No Codex run has been started.
