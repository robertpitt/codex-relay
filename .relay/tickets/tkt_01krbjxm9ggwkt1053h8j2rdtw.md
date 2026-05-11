---
schemaVersion: 1
id: tkt_01krbjxm9ggwkt1053h8j2rdtw
title: Refactor Relay Backend to Effect v4 / effect-smol
ticketType: epic
status: todo
position: 10000
priority: high
labels:
  - epic
  - backend
  - refactor
  - effect-v4
  - effect-smol
parentEpicId: null
subticketIds:
  - tkt_01krbjxm9zndw2s6sy4g34qwej
  - tkt_01krbjxmaenq5kkxqf12f3sz4s
  - tkt_01krbjxmax9qhj647c04ztqs38
  - tkt_01krbjxmbbh5xb750bd24gpqcj
  - tkt_01krbjxmbsy591trhf6pkrr55r
  - tkt_01krbjxmc61erxz5mv0179hxmh
createdAt: '2026-05-11T13:16:44.720Z'
updatedAt: '2026-05-11T13:16:44.807Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Refactor Relay Backend to Effect v4 / effect-smol

## Context

Migrate Relay's backend implementation to Effect v4, also referred to as effect-smol, while preserving existing backend behavior, IPC-facing contracts, audit events, run status handling, and renderer expectations. The outcome should be a backend that uses the new Effect runtime and APIs consistently, with regression coverage proving existing project/run workflows still work.

## Research Findings

- Bounded repository research found backend-focused coverage in `tests/backend.test.ts`, including symbols such as `CodexRunDependencies`, `createProject`, `projectPath`, `auditEvents`, and `allowNonGitRuns`; this should be the primary regression suite to extend during migration.
- `src/shared/types.ts` defines cross-process contracts including `RunStatus`, `ProjectHealth`, `TicketType`, `TicketPriority`, `DEFAULT_COLUMNS`, and the `backend_failure` status/error category; these shared types should remain stable unless explicitly migrated with compatibility handling.
- Renderer matches for `effect` in `src/renderer/src/App.tsx`, `src/renderer/src/lib/keyboardShortcuts.tsx`, and `src/renderer/src/components/AgentActivity.tsx` appear to be React `useEffect` usage, not Effect/effect-smol backend usage.
- `src/renderer/src/lib/agentProgress.ts` contains progress timing/status logic such as `AgentProgressStatus`, `AgentProgressMetrics`, `timestampMs`, and effective start/end timestamp handling; backend migration must not regress the event data consumed by this code.
- No URLs were provided or fetched. Research was bounded to the supplied search terms and inspected files, so the exact current backend Effect imports and package definitions still need to be located during implementation.

## Requirements

- Adopt Effect v4 / effect-smol for backend runtime, dependency injection, async control flow, and error handling where the current backend uses the older Effect APIs or ad hoc equivalents.
- Preserve existing backend behavior and shared contracts unless a change is explicitly documented and covered by tests.
- Keep renderer-facing progress, audit, status, and failure semantics compatible with existing consumers.
- Update backend tests and any type-level checks needed to prove the migration is complete.
- Avoid broad unrelated refactors outside the backend migration path.

## Implementation Plan

- Inventory current backend modules, package dependencies, and any existing Effect imports/usages; create a migration map from old APIs to Effect v4/effect-smol equivalents.
- Update package dependencies and TypeScript configuration as needed for Effect v4/effect-smol, keeping lockfile changes limited to the migration.
- Introduce any small backend compatibility adapters needed to reduce churn and keep IPC/shared contracts stable.
- Migrate backend services, dependency layers, run orchestration, cancellation, logging/audit, and error mapping to Effect v4/effect-smol APIs.
- Update tests in and around `tests/backend.test.ts` to cover migrated behavior, including success paths, backend failures, audit events, and non-git run handling.
- Run formatting, typecheck, and backend test suites; fix regressions before closing the epic.

## Acceptance Criteria

- Backend code compiles cleanly against Effect v4/effect-smol with no remaining dependency on the superseded backend Effect API.
- Existing backend workflows covered by `tests/backend.test.ts` still pass.
- Shared status/error semantics such as `backend_failure` remain compatible with renderer consumers.
- Migration notes document any intentional behavior changes, package changes, or compatibility adapters introduced.
- No unrelated renderer React `useEffect` code is changed as part of the backend migration unless required by a verified contract change.

## Clarification Questions

- What exact npm package name and version should be treated as the target for “Effect v4 / effect-smol”?
- Should this migration preserve all public/internal backend APIs exactly, or are small breaking changes acceptable if they simplify the Effect v4 model?

## Implementation Notes

- The research context did not include package files or backend source modules beyond tests, so the first subticket should confirm actual dependency names, import paths, and runtime entry points before code changes.
- Treat the renderer `effect` matches as unrelated React hooks unless implementation discovers backend contract changes that require renderer updates.

## Research Metadata

- File inspected: src/renderer/src/lib/agentProgress.ts - Matched terms: effect; characters read: 8005; symbols: AgentProgressStatus, AgentProgressMetrics, AgentProgressInput, pad2, timestampMs, parsed
- File inspected: tests/backend.test.ts - Matched terms: backend; characters read: 12000; symbols: CodexRunDependencies, createProject, projectPath, auditEvents, raw, allowNonGitRuns
- File inspected: src/renderer/src/lib/keyboardShortcuts.tsx - Matched terms: effect; characters read: 8468; symbols: ShortcutDirection, KeyboardShortcutEvent, ShortcutHandlerResult, KeyboardShortcutRegistration, OverlayShortcutRegistration, RuntimeRegistration
- File inspected: src/renderer/src/components/AgentActivity.tsx - Matched terms: effect; characters read: 8279; symbols: CopyHandlers, AgentProgressSummaryProps, useProgressNow, interval, formatTimestamp, metricValue
- File inspected: src/renderer/src/App.tsx - Matched terms: effect; characters read: 12000; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast, LocalAgentProgress, ActiveTicketReferenceMention
- File inspected: src/shared/types.ts - Matched terms: backend; characters read: 12000; symbols: RELAY_SCHEMA_VERSION, DEFAULT_COLUMNS, TicketPriority, TicketType, RunStatus, ProjectHealth

## Codex Handoff

No Codex run has been started.
