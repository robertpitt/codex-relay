---
schemaVersion: 1
id: tkt_01krckmja3f1vzm0mvcspgr6pv
title: Align Codex status with the SDK-bundled CLI
ticketType: task
status: completed
position: 41000
priority: high
labels:
  - codex
  - sdk
  - bugfix
parentEpicId: tkt_01krcka112x6zmxsz6416d6hrj
subticketIds: []
blockedByIds: []
createdAt: '2026-05-11T22:48:30.787Z'
updatedAt: '2026-05-11T23:02:43.220Z'
codexThreadId: 019e193b-5e0a-7a70-9610-89d13e722950
runStatus: completed
lastRunId: run_01krckpqcq0mmrk1xqk4efrbrx
---
# Align Codex status with the SDK-bundled CLI

## Parent Epic

Codex SDK integration improvement epic

## Context

Relay currently checks `codex --version` on PATH for availability, while the SDK resolves the `@openai/codex` package binary. This can block drafting/runs even when the installed SDK can launch Codex.

## Codebase Findings

- `node_modules/@openai/codex-sdk/README.md:5` states the SDK wraps the `codex` CLI from `@openai/codex`.
- `node_modules/@openai/codex-sdk/dist/index.js:153-159` initializes `CodexExec` with `executablePath || findCodexPath()`, so the default SDK path is package-based.
- `src/main/services/codex/status.ts:10-17` only runs `CommandExecutor.execFile("codex", ["--version"], ...)` and marks `cliAvailable` false on failure.
- `src/main/services/codex/index.ts:96` creates `new Codex({ env: codexEnv() })` and does not share any resolved CLI path with status.
- `tests/backend.test.ts:624-650` already covers preflight blocking behavior and is the right location for backend service tests.

## Requirements

- Resolve Codex CLI candidates in one backend helper used by both status checks and `createCodex()`.
- Prefer the SDK-bundled `@openai/codex` binary path when it can be resolved; fall back to `codex` on PATH only when the bundled path is unavailable.
- Pass the chosen executable to `new Codex({ codexPathOverride, env })` so status and runtime use the same launch path.
- Keep auth detection behavior from `src/main/services/codex/status.ts:19-26` unchanged.
- Do not add a new required field to `CodexStatus`; preserve renderer IPC compatibility.

## Implementation Plan

- Add a small helper module under `src/main/services/codex/` that resolves the bundled `@openai/codex` vendor binary for the current `process.platform` and `process.arch`, with a PATH fallback candidate of `codex`.
- Update `src/main/services/codex/status.ts` to iterate CLI candidates, run `--version` against the first candidate that works, and keep the existing auth/message shape.
- Update `src/main/services/codex/index.ts:createCodex` to pass the same resolved candidate as `codexPathOverride` when available.
- Add dependency seams or exported pure helper coverage so tests can simulate bundled success, PATH fallback, and total failure without spawning real Codex.
- Keep error messages user-facing and specific: unavailable only when neither bundled nor PATH candidate works.

## Test Plan

- Add focused backend tests in `tests/backend.test.ts` or a test file already listed by `tests/run-tests.mjs` for bundled candidate success, PATH fallback, and no candidate failure.
- Add a test that `createCodex` receives the resolved `codexPathOverride` through an injectable factory/helper path rather than drifting from status behavior.
- Run `npm test`.
- Run `npm run typecheck`.

## Acceptance Criteria

- `getCodexStatus()` can report `cliAvailable: true` when the SDK-bundled CLI candidate is available even if PATH `codex` is unavailable.
- When only PATH `codex` is available, status reports available and `createCodex()` uses that same candidate.
- When no candidate works, status preserves the current unavailable behavior and message semantics.
- Existing renderer status consumers continue to compile without changes to required `CodexStatus` fields.

## Assumptions / Open Questions

- Duplicating the SDK's platform-to-package mapping in Relay is acceptable because the SDK does not export `findCodexPath()`.
- A PATH fallback is useful for developer environments, but runtime and status must use the same selected candidate.

## Implementation Notes

- Avoid importing private SDK internals; use `createRequire(import.meta.url).resolve()` defensively inside a helper and return null on resolution failure.

## Codex Handoff

### 5/11/2026, 11:59:19 PM

Summary of changes made:
- Added a shared Codex CLI resolver that prefers the SDK-bundled `@openai/codex` binary and falls back to PATH `codex`.
- Updated `getCodexStatus()` and `createCodex()` to use the same resolved executable.
- Passed `codexPathOverride` into `new Codex({ codexPathOverride, env })`.
- Kept `CodexStatus` shape unchanged.
- Added backend tests for bundled success, PATH fallback, total failure, and runtime override behavior.

Files changed:
- `src/main/services/codex/cli.ts`
- `src/main/services/codex/status.ts`
- `src/main/services/codex/index.ts`
- `tests/backend.test.ts`

Commands run:
- `npm run typecheck`
- `npm test`
- Plus targeted inspection commands with `sed`, `grep`, `find`, `cat`, and `git diff/status`.

Tests run and results:
- `npm run typecheck`: passed.
- `npm test`: passed, 91/91 tests. It emits a non-fatal esbuild warning about `import.meta.url` in the CJS test bundle.

Remaining risks or follow-up:
- `git status` shows unrelated `.relay/*` working tree changes; I left them untouched.
- No required follow-up for this ticket.


No Codex run has been started.
