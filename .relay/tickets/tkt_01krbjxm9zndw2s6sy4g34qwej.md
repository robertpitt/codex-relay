---
schemaVersion: 1
id: tkt_01krbjxm9zndw2s6sy4g34qwej
title: Audit Current Backend Effect Usage and Migration Surface
ticketType: task
status: todo
position: 11000
priority: high
labels:
  - backend
  - refactor
  - effect-v4
  - research
parentEpicId: tkt_01krbjxm9ggwkt1053h8j2rdtw
subticketIds: []
createdAt: '2026-05-11T13:16:44.735Z'
updatedAt: '2026-05-11T13:16:44.735Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Audit Current Backend Effect Usage and Migration Surface

## Context

Before changing dependencies, identify every backend module, import, runtime entry point, dependency layer, and test path affected by the move to Effect v4/effect-smol.

## Research Findings

- `tests/backend.test.ts` is the visible backend regression entry point from bounded research and references backend test helpers such as `CodexRunDependencies`, `createProject`, `auditEvents`, and `allowNonGitRuns`.
- `src/shared/types.ts` defines shared contracts such as `RunStatus`, `ProjectHealth`, and `backend_failure`, which should be included in the migration impact review.
- Renderer `effect` matches in inspected files appear to be React `useEffect`, so they should not drive the backend migration scope.

## Requirements

- Locate all backend files that import or depend on the existing Effect implementation or equivalent async runtime abstractions.
- Identify package manager files and lockfiles that will need dependency updates.
- Map old Effect APIs to Effect v4/effect-smol equivalents, including runtime creation, layers/services, errors, interruption/cancellation, and resource finalization.
- Document any backend APIs or shared contracts that may need compatibility adapters.

## Implementation Plan

- Search the repository for existing Effect imports, backend runtime setup, dependency injection helpers, and async orchestration code.
- Inspect package manifests and lockfiles to determine current Effect dependency names and versions.
- Trace backend-to-renderer/shared contracts that carry run status, progress, audit, or failure data.
- Produce a short migration checklist in the implementation notes or PR description for the remaining subtickets.

## Acceptance Criteria

- All backend files requiring migration are identified.
- Current and target Effect package names/versions are recorded.
- Potential shared contract risks are listed with affected files or symbols.
- No production code behavior is changed by this audit task.

## Clarification Questions

- Confirm the target package/version for Effect v4/effect-smol if it is not already pinned in project documentation.

## Implementation Notes

- Keep this audit bounded to backend and shared contract surfaces; do not include unrelated React `useEffect` usages in the migration list.

## Research Metadata

- No research metadata recorded.

## Codex Handoff

No Codex run has been started.
