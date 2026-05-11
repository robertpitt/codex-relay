---
schemaVersion: 1
id: tkt_01krbjxmbbh5xb750bd24gpqcj
title: 'Migrate Backend Run Orchestration, Audit Events, and Error Mapping'
ticketType: task
status: todo
position: 14000
priority: high
labels:
  - backend
  - effect-v4
  - runs
  - errors
parentEpicId: tkt_01krbjxm9ggwkt1053h8j2rdtw
subticketIds: []
createdAt: '2026-05-11T13:16:44.779Z'
updatedAt: '2026-05-11T13:16:44.779Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Migrate Backend Run Orchestration, Audit Events, and Error Mapping

## Context

Convert backend run workflows to Effect v4/effect-smol while preserving externally observable run status, audit event, progress, and error behavior.

## Research Findings

- `tests/backend.test.ts` includes `auditEvents`, `allowNonGitRuns`, and project creation helpers, indicating backend run behavior and audit output are already tested and should be preserved.
- `src/shared/types.ts` includes `RunStatus` and `backend_failure`, which are likely consumed across process boundaries.
- `src/renderer/src/lib/agentProgress.ts` derives progress display from event timestamps and terminal/active state, so backend event shape and timestamp semantics must remain stable.

## Requirements

- Migrate run orchestration control flow to Effect v4/effect-smol APIs.
- Preserve audit event emission order and payload shape unless an intentional change is documented.
- Preserve error-to-status mapping, especially backend failures.
- Preserve progress event timestamps and terminal state semantics consumed by renderer code.

## Implementation Plan

- Trace backend run lifecycle from project/run creation through completion, cancellation, and failure.
- Replace old Effect constructs in run orchestration with Effect v4/effect-smol equivalents.
- Update error handling so typed/domain failures still map to existing shared statuses and failure categories.
- Add or update tests for successful runs, backend failures, non-git run allowance, audit events, and cancellation if supported.
- Manually inspect any renderer-facing event payload changes against `agentProgress.ts` expectations.

## Acceptance Criteria

- Run lifecycle behavior remains compatible with existing tests and shared types.
- Audit events are emitted with expected order and content.
- Backend failures still surface as the expected shared status/category.
- Progress calculations in renderer code do not require changes for ordinary migrated backend runs.

## Clarification Questions

- None.

## Implementation Notes

- If the migration exposes previously untyped failures, normalize them at the backend boundary rather than leaking Effect internals through shared types.

## Research Metadata

- No research metadata recorded.

## Codex Handoff

No Codex run has been started.
