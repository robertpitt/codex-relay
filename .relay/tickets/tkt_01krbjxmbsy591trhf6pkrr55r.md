---
schemaVersion: 1
id: tkt_01krbjxmbsy591trhf6pkrr55r
title: Update Backend Test Coverage for Effect v4 Migration
ticketType: task
status: todo
position: 15000
priority: medium
labels:
  - backend
  - tests
  - effect-v4
parentEpicId: tkt_01krbjxm9ggwkt1053h8j2rdtw
subticketIds: []
createdAt: '2026-05-11T13:16:44.793Z'
updatedAt: '2026-05-11T13:16:44.793Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Update Backend Test Coverage for Effect v4 Migration

## Context

Strengthen regression coverage so the Effect v4/effect-smol migration can be reviewed safely and future backend changes catch runtime, dependency, and error-handling regressions.

## Research Findings

- `tests/backend.test.ts` is the main inspected backend test file and should be extended around existing helpers and assertions instead of creating a disconnected test suite.
- `src/shared/types.ts` shared statuses such as `backend_failure` should be asserted where backend errors cross the boundary.

## Requirements

- Ensure backend tests cover migrated runtime execution paths, dependency injection, audit events, backend failures, and non-git run handling.
- Add tests for any compatibility adapters or new typed error mappings introduced during migration.
- Keep tests deterministic and avoid relying on external network services.
- Preserve existing test naming and helper patterns.

## Implementation Plan

- Run the existing backend test suite to identify baseline failures after migration.
- Extend `tests/backend.test.ts` or nearby backend test files using existing helpers such as project creation and dependency injection.
- Add focused assertions for Effect v4-specific migration risks, including service provisioning, handled failures, and cleanup/cancellation if applicable.
- Run the full relevant test suite and typecheck before marking the task complete.

## Acceptance Criteria

- Relevant backend tests pass under Effect v4/effect-smol.
- New or updated tests fail meaningfully if backend failure mapping, audit emission, or dependency provisioning regresses.
- Test coverage documents the intended compatibility behavior after migration.
- No flaky timing-dependent tests are introduced.

## Clarification Questions

- None.

## Implementation Notes

- Prefer extending existing backend test helpers over introducing a parallel testing harness.

## Research Metadata

- No research metadata recorded.

## Codex Handoff

No Codex run has been started.
