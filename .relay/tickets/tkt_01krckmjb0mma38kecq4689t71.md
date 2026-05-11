---
schemaVersion: 1
id: tkt_01krckmjb0mma38kecq4689t71
title: Add project-config support for SDK thread options
ticketType: task
status: todo
position: 12000
priority: medium
labels:
  - codex
  - sdk
  - configuration
parentEpicId: tkt_01krcka112x6zmxsz6416d6hrj
subticketIds: []
blockedByIds: []
createdAt: '2026-05-11T22:48:30.816Z'
updatedAt: '2026-05-11T22:48:30.816Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Add project-config support for SDK thread options

## Parent Epic

Codex SDK integration improvement epic

## Context

The SDK exposes thread options that Relay does not currently model. Add config support with conservative defaults so advanced users can opt in without changing existing run behavior.

## Codebase Findings

- `node_modules/@openai/codex-sdk/dist/index.d.ts:234-249` defines `ApprovalMode`, `ModelReasoningEffort`, `WebSearchMode`, and `ThreadOptions` fields including `modelReasoningEffort`, `networkAccessEnabled`, `webSearchMode`, and `additionalDirectories`.
- `src/shared/types.ts:48-55` currently defines `ProjectSettings` with `defaultModel`, `defaultApprovalPolicy`, `defaultSandboxMode`, `allowNonGitCodexRuns`, `ticketDraftingEnabled`, and `codexExecutionEnabled` only.
- `src/main/services/schemas.ts:165-172` validates the same limited settings shape and currently excludes SDK approval policy `on-failure`.
- `src/main/services/storage/index.ts:76-83` defines default settings; `:112-115` normalizes columns only, so new required settings must have schema defaults to avoid breaking old project configs.
- `src/main/services/codex/index.ts:134-145` maps project settings into `ThreadOptions` but hard-codes network and web search disabled and omits reasoning effort/additional directories.
- `src/main/services/codex/index.ts:148-154` makes ticket-update runs read-only, `approvalPolicy: "never"`, network disabled, and web search disabled.

## Requirements

- Extend `ProjectSettings` with `defaultModelReasoningEffort: null | "minimal" | "low" | "medium" | "high" | "xhigh"`, `codexNetworkAccessEnabled: boolean`, `codexWebSearchMode: "disabled" | "cached" | "live"`, and `codexAdditionalDirectories: string[]`.
- Allow `defaultApprovalPolicy: "on-failure"` in shared types and schema.
- Default new settings to behavior-preserving values: reasoning effort null, network false, web search disabled, additional directories empty.
- Use schema decoding defaults so existing `.relay/project.json` files continue to parse without manual migration.
- Apply network/web-search settings only to implementation runs; ticket drafting and ticket update runs must remain bounded/offline unless a later product decision changes that.

## Implementation Plan

- Update `src/shared/types.ts:48-55` with the new settings fields and the expanded approval policy union.
- Update `src/main/services/schemas.ts:165-172` to validate the new fields using local default helpers so legacy project configs decode successfully.
- Update `src/main/services/storage/index.ts:76-83` defaults with conservative values.
- Split Codex thread option creation in `src/main/services/codex/index.ts` so shared model/sandbox/approval/reasoning/additional-directory options are built once, and implementation-run options add `networkAccessEnabled` and `webSearchMode` from project settings.
- Keep `ticketUpdateThreadOptionsForProject` overriding approval to `never`, sandbox to `read-only`, network to `false`, and web search to `disabled`.
- Update tests that construct project config settings in `tests/schemas.test.ts` and `tests/backend.test.ts` with new defaults or rely on schema defaults where appropriate.

## Test Plan

- Add a schema test in `tests/schemas.test.ts` proving legacy settings without new fields parse with conservative defaults.
- Add a schema test proving `defaultApprovalPolicy: "on-failure"` and each reasoning/web-search enum value are accepted or rejected appropriately.
- Add a backend test in `tests/backend.test.ts` that writes project config with reasoning effort, additional directories, network, and web search, then asserts a mocked `startThread` receives those options for `startCodexRun`.
- Add a backend test that ticket update/draft-safe options keep network and web search disabled if the existing tests cover that path; otherwise assert via a mocked ticket update run.
- Run `npm test` and `npm run typecheck`.

## Acceptance Criteria

- Existing project configs without new fields still load successfully.
- Implementation runs pass configured `modelReasoningEffort`, `additionalDirectories`, `networkAccessEnabled`, and `webSearchMode` into SDK `ThreadOptions`.
- Ticket update runs remain read-only/offline regardless of the new execution settings.
- `on-failure` is a valid approval policy value in Relay config and schemas.
- No default behavior changes for newly initialized projects.

## Assumptions / Open Questions

- These are config-file options only; a dedicated settings UI is outside this subticket.
- Network and live web search are power-user features and remain opt-in.

## Implementation Notes

- Use existing `withDefault` in `src/main/services/schemas.ts:50-51` to avoid making new fields mandatory on disk.

## Codex Handoff

No Codex run has been started.
