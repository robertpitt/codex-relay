---
schemaVersion: 1
id: tkt_01krc98rc4489qj5aqra4tt4te
title: Add distribution scripts and GitHub release workflow for application binary
ticketType: task
status: completed
position: 38000
priority: medium
labels:
  - ci
  - release
  - packaging
  - github-actions
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-11T19:47:18.020Z'
updatedAt: '2026-05-11T20:15:39.831Z'
codexThreadId: 019e18a3-15c3-74c2-bd20-0741fd766065
runStatus: completed
lastRunId: run_01krca64wk2erc30vra5t393mn
---
# Add distribution scripts and GitHub release workflow for application binary

## Context

Add the missing local package distribution steps and GitHub Actions automation needed to build the application's distributable binary and publish it to GitHub Releases. The request specifically calls out updates to the app-level package.json and .github CI workflows for build and release.

The .effect directory is explicitly out of scope for implementation. It is only a developer reference area and must not be treated as the app package surface, release source, or workflow target.

## Research Findings

- Bounded code search found package manifests under .effect/packages/*, for example .effect/packages/ai/openai/package.json and .effect/packages/ai/anthropic/package.json, but these are developer reference files and are not the app-level package.json to edit.
- The searched .effect package manifests reference Effect-TS package metadata and GitHub URLs, for example .effect/packages/ai/openai/package.json has repository.directory set to packages/ai/openai. These references should not drive the release implementation.
- No URLs were provided in the idea, so no external release/build documentation was reviewed.
- Research did not confirm the root package manager, existing package.json scripts, existing .github workflows, binary entrypoint, or current build system. Code search stopped after scanning 160 candidate files.

## Requirements

- Exclude .effect from implementation scope. Do not edit files under .effect and do not use .effect package manifests as the package.json source for this ticket.
- Identify the correct app-level package.json outside .effect and add distribution scripts for building the production app and generating the release binary artifact.
- Add or update GitHub Actions workflow files under .github/workflows to build the binary in CI.
- Add a release workflow that publishes built binary artifacts to GitHub Releases, preferably triggered by version tags such as v* unless the repo uses a different release convention.
- Generated artifacts must include clear names with app name, version or tag, operating system, and architecture where applicable.
- Workflow permissions must be scoped appropriately, including contents: write only for the release publishing job.
- The implementation must use the repository's existing package manager, build tooling, lockfile, and conventions where possible.
- Document the local commands for building and packaging the binary in package.json scripts or repository documentation if no existing release docs exist.

## Implementation Plan

- Inspect the repository root, excluding .effect, for package.json, lockfiles, existing .github/workflows files, and any current CLI or binary build entrypoint.
- Determine the existing runtime/build stack and choose the packaging approach that best fits the project, such as an existing bundler/compiler configuration or the repository's current binary packaging tool if one already exists.
- Add package.json scripts for the full distribution path, for example build, dist, clean:dist, and any package/binary command names that match the repo's naming conventions.
- Ensure the dist script emits release-ready artifacts into a predictable directory such as dist/ or release/ and does not require local-only environment variables.
- Create or update a CI workflow that installs dependencies with the correct package manager, runs tests or type checks if already present, and executes the distribution build.
- Create or update a release workflow that runs on the agreed trigger, builds artifacts for the supported target platforms, uploads workflow artifacts, and attaches final binaries to a GitHub Release.
- Add artifact naming and checksum generation if compatible with existing release practices.
- Run the new package scripts locally where possible, then validate the GitHub workflow YAML syntax and job dependency graph.

## Acceptance Criteria

- No files under .effect are modified, and .effect package manifests are not used as the release/package implementation target.
- package.json outside .effect contains working distribution-related scripts for building the production binary artifact.
- A GitHub Actions workflow exists under .github/workflows that builds the binary successfully from a clean checkout.
- A GitHub Actions release workflow can publish generated binary artifacts to GitHub Releases on the configured trigger.
- Release artifacts are named clearly and are not committed to the repository unless that is already an established convention.
- CI uses the repository's detected package manager and lockfile consistently.
- The implementation includes verification notes showing the local dist command and any workflow validation command that was run.

## Clarification Questions

- What is the intended binary name and executable entrypoint?
- Which platforms should be released: Linux, macOS, Windows, and which CPU architectures?
- Should releases be triggered from version tags, GitHub release creation, manual workflow dispatch, or another existing release process?

## Implementation Notes

- Start by inspecting root package.json and .github/workflows because bounded research did not reach or confirm those files.
- Treat .effect/packages/* package.json files as developer reference metadata only. They are explicitly excluded from implementation scope.
- If the project does not currently have a binary packaging tool, choose the smallest compatible option and document why it fits the runtime and deployment target.

## Research Metadata

- File inspected: .effect/packages/ai/anthropic/package.json - Matched terms: dist, package, json, github; characters read: 1584
- File inspected: .effect/packages/ai/openai-compat/package.json - Matched terms: dist, package, json, github; characters read: 1602
- File inspected: .effect/packages/ai/openai/package.json - Matched terms: dist, package, json, github; characters read: 1569
- File inspected: .effect/packages/ai/openrouter/package.json - Matched terms: dist, package, json, github; characters read: 1589
- File inspected: .effect/packages/atom/react/package.json - Matched terms: dist, package, json, github; characters read: 1947
- File inspected: .effect/packages/ai/openai/src/Generated.ts - Matched terms: add, package, json, binary, orm; characters read: 12000; symbols: AddUploadPartRequest, AdminApiKey, AssignedRoleDetails, the, AssistantSupportedModels, AssistantToolsCode
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

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


No Codex run has been started.
