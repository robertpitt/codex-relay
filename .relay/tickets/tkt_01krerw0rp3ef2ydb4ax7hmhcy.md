---
schemaVersion: 1
id: tkt_01krerw0rp3ef2ydb4ax7hmhcy
title: Harden Backend Effect Runtime Config Hygiene
ticketType: task
status: completed
position: 58000
priority: high
labels:
  - backend
  - effect
  - code-quality
  - refactor
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T18:58:26.710Z'
updatedAt: '2026-05-12T20:00:32.815Z'
codexThreadId: 019e1dbb-6903-70c3-aaf0-5e6a510c0db4
runStatus: completed
lastRunId: run_01krevpsstwh1m5ka1yq3kgm4d
lastRunStartedAt: '2026-05-12T19:48:01.722Z'
---
# Harden Backend Effect Runtime Config Hygiene

## Context

Create a focused backend quality pass that aligns Relay's current Effect v4 runtime with the existing migration direction: centralize app/process config in Effect Config, remove timeout literals from backend service consumers, and document the resulting runtime knobs without changing IPC or renderer contracts.

## Goal

Replace hard-coded backend runtime config defaults with an Effect `Config`-backed layer while preserving the existing `BackendConfigService` field names and defaults.

## Decisions / Assumptions

- This task is the first bounded backend hygiene slice, not a broad backend rewrite or full Codex service migration.
- The approved Effect target remains `effect@4.0.0-beta.65`.
- Env key names use explicit `RELAY_*_MS` names for operational clarity instead of nested lowercase config paths.
- Existing Codex auth checks using `OPENAI_API_KEY`, `CODEX_API_KEY`, and `~/.codex/auth.json` remain unchanged in this task.

## Requirements

- Replace hard-coded backend runtime config defaults with an Effect `Config`-backed layer while preserving the existing `BackendConfigService` field names and defaults.
- Support env/config overrides for `RELAY_GIT_METADATA_CACHE_TTL_MS`, `RELAY_GIT_COMMAND_TIMEOUT_MS`, and `RELAY_CODEX_STATUS_TIMEOUT_MS`; missing values must keep the current defaults.
- Make Git metadata command execution and Codex CLI status checks consume `BackendConfig` timeout values instead of local numeric literals.
- Do not change `src/shared/ipc.ts`, `src/preload/index.ts`, public `RelayApi` Promise signatures, Codex SDK event shapes, run JSONL, audit JSONL, or ticket file formats.
- Update local docs to record the current config env names and the current runtime file paths; do not edit or vendor `.effect/` reference source.

## Acceptance Criteria

- Backend runtime config is sourced through Effect `Config` with the same default values as today.
- Git metadata command timeout and Codex CLI status timeout are controlled by `BackendConfig`, with no duplicated `5000` timeout literals in those consumers.
- Existing IPC/preload/shared contracts remain Promise-based and unchanged.
- Docs list the supported backend runtime env keys and current runtime module path.
- `npm run typecheck` and `npm test` pass.

## Test Plan

- Run `npm run typecheck`.
- Run `npm test`.
- Add/verify a unit test that parses backend config with no overrides and gets `3000`, `5000`, `5000`.
- Add/verify a unit test that provides `ConfigProvider.fromUnknown` values for the three env/config keys and observes the overridden numbers.
- Add/verify a command-runner test captures that Git metadata or Codex CLI status receives the configured timeout rather than the previous literal.

## Implementation Notes

- Codebase finding: `package.json:27` pins Relay to `effect@4.0.0-beta.65`; keep this version unless a separate dependency decision changes it.
- Codebase finding: `docs/effect-layered-architecture.md:3-18` says the main process boots one Effect runtime from `AppLayerLive`, with runtime services in `src/main/services/runtime/`, IO behind `src/main/services/io/`, Electron behind `src/main/electron/`, and Codex under `src/main/services/codex/`.
- Codebase finding: `docs/backend-effect-v4-upgrade-plan.md:161-173` explicitly calls for process/app settings to use Effect `Config`/`ConfigProvider`, including Codex status timeout, Git command timeout, and Git metadata cache TTL; tests should use `ConfigProvider.fromUnknown`.
- Codebase finding: `src/main/services/runtime/index.ts:17-29` defines `BackendConfigService` but currently wires `BackendConfigLive` with hard-coded `Layer.succeed` values: `gitMetadataCacheTtlMs: 3000`, `gitCommandTimeoutMs: 5000`, and `codexStatusTimeoutMs: 5000`.
- Codebase finding: `src/main/services/git/index.ts:18-24` hard-codes the Git command timeout to `5000`, while `src/main/services/git/index.ts:221-227` already reads `BackendConfig.gitMetadataCacheTtlMs` for cache expiry; `src/main/services/codex/cli.ts:117-120` separately hard-codes the Codex CLI `--version` timeout to `5000`.
- Implementation: In `src/main/services/runtime/index.ts`, import Effect v4 `Config` and change `BackendConfigLive` from `Layer.succeed` to a `Layer.effect` built from a `Config.all` spec using `Config.int(...).pipe(Config.withDefault(...))` for the three existing settings.
- Implementation: Export the config spec or a small `loadBackendConfig` helper from `src/main/services/runtime/index.ts` so tests can parse defaults and `ConfigProvider.fromUnknown` overrides without rebuilding the full Electron app layer.
- Implementation: In `src/main/services/git/index.ts`, update `defaultGitRunner` to yield `BackendConfig` inside the existing `runBackendEffect` program and pass `config.gitCommandTimeoutMs` to `CommandExecutor.execFile`; keep the optional `execGit` dependency behavior unchanged.
- Implementation: In `src/main/services/codex/cli.ts`, update `runCodexVersion` to read `BackendConfig.codexStatusTimeoutMs` before invoking `CommandExecutor.execFile`; keep bundled/path candidate fallback behavior unchanged.
- Implementation: Add focused regression coverage in `tests/backend.test.ts` and/or `tests/git-metadata.test.tsx` for config defaults, `ConfigProvider.fromUnknown` overrides, and at least one command timeout consumer, then update `docs/effect-layered-architecture.md` or `docs/effect-v4-migration.md` with the env keys.
- The pre-draft research docs mention older paths like `src/main/services/effectRuntime.ts`; the current codebase uses `src/main/services/runtime/index.ts` and `src/main/services/runtime/appLayer.ts`.
- `.effect/packages/effect/src/ConfigProvider.ts:324-360` documents that the default provider is `fromEnv()` and can be overridden with `ConfigProvider.fromUnknown`; `.effect/packages/effect/test/Config.test.ts:311-312` shows `Config.withDefault` behavior.
- `tests/import-boundaries.test.ts:27-56` already enforces backend IO/Electron/workflow import boundaries and should remain green.
- Local code search used `find`/`grep` because `rg` is not installed in this environment.

## Codex Handoff

### 5/12/2026, 8:56:02 PM

**Summary**
Implemented the backend runtime config hygiene slice. `BackendConfig` is now sourced from an Effect `Config` spec with the same defaults, Git command execution and Codex CLI status checks read timeouts from `BackendConfig`, and docs now list the supported runtime env keys and module paths.

**Files Changed**
- `src/main/services/runtime/index.ts`
- `src/main/services/git/index.ts`
- `src/main/services/codex/cli.ts`
- `tests/backend.test.ts`
- `docs/effect-layered-architecture.md`

**Commands Run**
- `git status --short`
- `rg ...` checks, which failed because `rg` is not installed here
- `grep`/`sed` inspections and final timeout-literal checks
- `git diff --stat`
- `npm run typecheck`
- `npm test`

**Tests**
- `npm run typecheck`: passed
- `npm test`: passed, 141 tests passing
- Test output still includes the existing esbuild `import.meta` CJS warning from the test bundler.

**Subagent Usage**
none used

**Remaining Risks / Follow-up**
No known remaining implementation risk. The worktree had pre-existing unrelated changes, including files this ticket forbids changing; I left those untouched.


No Codex run has been started.
