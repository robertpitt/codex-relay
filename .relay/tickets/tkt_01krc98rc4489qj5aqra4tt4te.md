---
schemaVersion: 1
id: tkt_01krc98rc4489qj5aqra4tt4te
title: >-
  Fix ticket draft research to inspect matching project files before prompting
  Codex
ticketType: task
status: completed
position: 38000
priority: high
labels:
  - bug
  - tests
  - ticket-draft
  - research
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-11T19:47:18.020Z'
updatedAt: '2026-05-11T20:34:06.091Z'
codexThreadId: 019e18a3-15c3-74c2-bd20-0741fd766065
runStatus: completed
lastRunId: run_01krcb70h3sj4gvckydvy6wxqc
---
# Fix ticket draft research to inspect matching project files before prompting Codex

## Context

A test failure shows that ticket draft codebase research can complete without inspecting an expected matching project file before prompting Codex. In the failing case, the draft completed successfully, but `draft.research.inspectedFiles` did not include `src/main/services/codex.ts`.

This ticket supersedes the earlier release-packaging task content. Keep the existing Codex handoff below as historical context only; do not treat the release workflow implementation as the active scope for this ticket.

## Failure Evidence

```text
# Subtest: ticket draft codebase research inspects matching project files before prompting Codex
not ok 61 - ticket draft codebase research inspects matching project files before prompting Codex
  ---
  duration_ms: 65.2319
  type: 'test'
  location: 'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\relay-tests-3468\\ticket-draft.test.js:17389:30'
  failureType: 'testCodeFailure'
  error: |-
    The expression evaluated to a falsy value:

      ok(draft.research.inspectedFiles.some((file) => file.path === "src/main/services/codex.ts"))

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: true
  actual: false
  operator: '=='
```

Observed draft completion log:

```text
2026-05-11T20:17:29.084Z INFO [codex:draft] ticket draft completed {"requestId":"tdr_code_research","projectPath":"C:\\\\Users\\\\RUNNER~1\\\\AppData\\\\Local\\\\Temp\\\\relay-draft-alkc2Q","ideaLength":70,"timeoutMs":90000,"durationMs":11,"title":"Inspect draft code","reason":"success"}
```

## Requirements

- Fix the ticket draft codebase research path so matching project files are inspected before Codex is prompted.
- Ensure `draft.research.inspectedFiles` records inspected matching files using repository-relative paths.
- Preserve or restore the expected inspection of `src/main/services/codex.ts` for the failing test scenario.
- Do not mask the assertion by changing the test expectation unless the implementation contract is intentionally changed and documented.
- Keep the research completion behavior deterministic across platforms, including Windows temp project paths.
- Do not modify run history or Codex execution metadata as part of the ticket content update.

## Implementation Plan

- Inspect the failing `ticket-draft.test.js` case around the reported subtest to understand the fixture setup, query terms, and expected research contract.
- Trace the draft research implementation that selects candidate files, reads matching files, and records `inspectedFiles`.
- Identify why `src/main/services/codex.ts` is skipped or omitted from `inspectedFiles` despite matching the research scenario.
- Fix the selection, path normalization, filtering, or result-recording logic while keeping bounded research limits intact.
- Add or adjust focused coverage only if needed to lock the intended behavior without weakening the existing failing test.
- Run the relevant ticket draft test file and any nearby draft research tests.

## Acceptance Criteria

- The subtest `ticket draft codebase research inspects matching project files before prompting Codex` passes.
- `draft.research.inspectedFiles` includes an entry whose `path` is exactly `src/main/services/codex.ts` for the failing scenario.
- The fix works on Windows-style temp paths and does not depend on absolute path formatting.
- Research still respects bounded scanning limits and does not inspect unrelated files unnecessarily.
- No release packaging behavior is changed unless tests reveal a direct dependency.

## Implementation Notes

- Start with the failing test at `ticket-draft.test.js:17389` and the assertion near `ticket-draft.test.js:17417`.
- Pay close attention to path normalization. The failing run used Windows paths under `C:\\Users\\RUNNER~1\\AppData\\Local\\Temp` while the expected inspected file path is repository-relative with forward slashes.
- The prior release-workflow work below is historical handoff content from the earlier ticket scope and should not guide this implementation.

## Historical Codex Handoff

### 5/11/2026, 9:12:52 PM

**Summary**
Added local binary distribution support for the root app package, without touching `.effect`. The new `npm run dist` path builds the Electron app, packages the current OS/arch runtime, names artifacts as `relay-<version/tag>-<platform>-<arch>`, and writes a `.sha256` checksum.

Added GitHub Actions workflows for CI binary builds and tag-based GitHub Releases. The release workflow triggers on `v*` tags, builds Linux/macOS/Windows artifacts, and scopes `contents: write` only to the publish job.

**Files Changed**
- [package.json](/Users/robertpitt/Projects/relay/package.json)
- [scripts/package-electron.mjs](/Users/robertpitt/Projects/relay/scripts/package-electron.mjs)
- [.github/workflows/build-binary.yml](/Users/robertpitt/Projects/relay/.github/workflows/build-binary.yml)
- [.github/workflows/release-binary.yml](/Users/robertpitt/Projects/relay/.github/workflows/release-binary.yml)
- [README.md](/Users/robertpitt/Projects/relay/README.md)

Note: the worktree also contains unrelated `.relay`, `assets`, README showcase, and `src/renderer/src/App.tsx` changes. I left those intact.

**Commands Run**
- Repo inspection via `find`, `sed`, `git status`, `git diff`
- `node --check scripts/package-electron.mjs`
- YAML parse validation for both workflow files with `node -e ... YAML.parse(...)`
- `npm test`
- `npm run dist`
- `cd dist && shasum -a 256 -c relay-v0.1.0-darwin-arm64.tar.gz.sha256`
- `plutil` checks on the generated macOS bundle metadata

**Tests Run**
- `npm test`: passed, 72/72 tests.
- `npm run dist`: passed, produced `dist/relay-v0.1.0-darwin-arm64.tar.gz` and checksum.
- Checksum verification from `dist/`: passed.
- Workflow YAML parse validation: passed.

**Remaining Risks**
- GitHub release publishing was not executed locally; it will need validation on the first `v*` tag run.
- Only macOS arm64 was built locally. Linux and Windows builds are covered by the workflow matrix.
- The generated app is a portable Electron archive, not a signed/notarized installer.

## Codex Handoff

### 5/11/2026, 9:22:56 PM

**Summary of Changes**
Fixed ticket draft research path recording by normalizing repository-relative paths to forward slashes before storing them in `inspectedFiles` or research limitations. This preserves the expected `src/main/services/codex.ts` path on Windows and keeps scoring/prompt rendering platform-stable.

No release packaging behavior was changed.

**Files Changed**
- [src/main/services/codex/research.ts](/Users/robertpitt/Projects/relay/src/main/services/codex/research.ts:69)

**Commands Run**
- `git status --short --untracked-files=all`
- `grep`/`sed` inspection of the failing test and research implementation
- `node --check src/main/services/codex/research.ts`
- `npm run typecheck`
- `npm test`
- `git diff -- src/main/services/codex/research.ts`

**Tests Run and Results**
- `npm run typecheck`: passed
- `npm test`: passed, 72/72 tests
- The subtest `ticket draft codebase research inspects matching project files before prompting Codex` passed.

**Remaining Risks or Follow-Up**
- I could not run the suite on Windows locally, but the fix targets the Windows-specific backslash path behavior shown in the failure.
- `.relay` run/ticket metadata changes are present in the worktree from Relay activity; I did not edit them as part of the implementation.
