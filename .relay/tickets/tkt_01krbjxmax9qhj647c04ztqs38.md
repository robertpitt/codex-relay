---
schemaVersion: 1
id: tkt_01krbjxmax9qhj647c04ztqs38
title: 'Migrate Backend Runtime, Services, and Dependency Layers'
ticketType: task
status: todo
position: 13000
priority: high
labels:
  - backend
  - effect-v4
  - runtime
  - refactor
parentEpicId: tkt_01krbjxm9ggwkt1053h8j2rdtw
subticketIds: []
createdAt: '2026-05-11T13:16:44.765Z'
updatedAt: '2026-05-11T13:16:44.765Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Migrate Backend Runtime, Services, and Dependency Layers

## Context

Convert backend execution infrastructure to Effect v4/effect-smol so backend services, dependency injection, runtime execution, and resource lifecycles use the new APIs consistently.

## Research Findings

- `tests/backend.test.ts` references `CodexRunDependencies`, suggesting backend dependency injection/test doubles are important and should continue to work after migration.
- Backend failure semantics connect to shared types in `src/shared/types.ts`, including `backend_failure`, so runtime-level error handling must preserve mapped outcomes.

## Requirements

- Migrate backend runtime creation/execution to Effect v4/effect-smol.
- Migrate service/layer/dependency injection code while preserving testability of backend dependencies.
- Preserve cancellation/interruption and cleanup behavior for backend runs.
- Keep compatibility boundaries explicit if adapters are needed to isolate Effect v4 churn.

## Implementation Plan

- Refactor backend runtime bootstrap code to the Effect v4/effect-smol execution model.
- Migrate service definitions and dependency layers used by backend run orchestration.
- Update test dependency construction around `CodexRunDependencies` or equivalent helpers to match the new service model.
- Verify resource acquisition/finalization and cancellation behavior still occurs in the correct order.
- Remove temporary shims once all migrated code uses the new runtime directly, unless a stable adapter is intentionally retained.

## Acceptance Criteria

- Backend runtime entry points execute through Effect v4/effect-smol.
- Backend dependency injection remains testable without relying on production services.
- Cancellation and cleanup behavior is covered by existing or new tests.
- No old Effect runtime/layer APIs remain in backend production code.

## Clarification Questions

- None.

## Implementation Notes

- Prefer small adapters at module boundaries over large mechanical rewrites spread through unrelated files.

## Research Metadata

- No research metadata recorded.

## Codex Handoff

No Codex run has been started.
