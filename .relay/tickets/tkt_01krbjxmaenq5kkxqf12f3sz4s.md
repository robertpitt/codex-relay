---
schemaVersion: 1
id: tkt_01krbjxmaenq5kkxqf12f3sz4s
title: Update Backend Dependencies for Effect v4 / effect-smol
ticketType: task
status: todo
position: 12000
priority: high
labels:
  - backend
  - dependencies
  - effect-v4
parentEpicId: tkt_01krbjxm9ggwkt1053h8j2rdtw
subticketIds: []
createdAt: '2026-05-11T13:16:44.750Z'
updatedAt: '2026-05-11T13:16:44.750Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Update Backend Dependencies for Effect v4 / effect-smol

## Context

Prepare the project dependency graph for the backend migration by replacing the existing Effect dependency with the target Effect v4/effect-smol package and resolving TypeScript/package compatibility issues.

## Research Findings

- Bounded research did not inspect package manifests, so implementation must first identify the package manager and current dependency declarations.
- `tests/backend.test.ts` should remain runnable after the dependency update, even before all production migration work is complete if compatibility adapters are introduced.

## Requirements

- Update the relevant package manifest and lockfile to use the approved Effect v4/effect-smol dependency.
- Remove or replace superseded Effect packages only when no remaining code depends on them.
- Ensure TypeScript can resolve the new package and exported APIs.
- Keep dependency changes limited to what is required for the migration.

## Implementation Plan

- Inspect `package.json`, workspace manifests, and lockfiles to determine dependency ownership.
- Change the backend Effect dependency to the approved Effect v4/effect-smol package/version.
- Install/update dependencies using the repository's package manager.
- Run typecheck or the smallest available compile step to surface import/API breakage for follow-up subtickets.
- Record any unavoidable transitive or lockfile changes in the PR notes.

## Acceptance Criteria

- The target Effect v4/effect-smol package is declared in the correct manifest.
- Lockfile is updated consistently with the repository package manager.
- No obsolete backend Effect package remains unless explicitly needed during a temporary compatibility phase.
- Dependency update does not introduce unrelated package churn.

## Clarification Questions

- Should the migration use a temporary compatibility phase with both old and new packages, or remove the old package immediately?

## Implementation Notes

- If the repository uses a monorepo/workspace setup, update only the package that owns backend code unless shared tooling requires a root-level change.

## Research Metadata

- No research metadata recorded.

## Codex Handoff

No Codex run has been started.
