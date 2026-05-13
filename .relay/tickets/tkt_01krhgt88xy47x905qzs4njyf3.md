---
schemaVersion: 1
id: tkt_01krhgt88xy47x905qzs4njyf3
title: Plan Backend Effect Runtime Service Boundary Cleanup
ticketType: task
status: todo
position: 19000
priority: medium
effort: medium
labels:
  - backend
  - effect
  - architecture
  - refactor
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-13T20:35:23.549Z'
updatedAt: '2026-05-13T20:36:32.126Z'
authoringState: reviewing
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krhgt8754xwxrqa5993v4qgd
lastRunStartedAt: null
---
# Plan Backend Effect Runtime Service Boundary Cleanup

## Context

Produce a codebase-grounded improvement plan for one backend architecture area: the Effect runtime/service composition boundary. The deliverable is a planning artifact, not an implementation refactor, focused on how Relay should improve layer/service structure around runtime wiring and kernel service dependencies while preserving existing backend runtime behavior and IPC-facing semantics.

## Goal

Create a concise architecture plan document or ticket note that identifies the Effect runtime/service composition boundary as the target improvement area.

## Decisions / Assumptions

- The desired output for this ticket is an architecture plan artifact or ticket note, not immediate code changes.
- No IPC-facing API changes are intended.
- The conservative target area is the backend Effect runtime/service composition boundary named in intake context.
- If the repository has a preferred location for architecture notes, the implementation agent should use that existing convention; otherwise the plan can live directly in the ticket body.

## Requirements

- Create a concise architecture plan document or ticket note that identifies the Effect runtime/service composition boundary as the target improvement area.
- Describe the current layering problem using concrete references to `src/main/services/runtime/appLayer.ts`, `src/main/services/runtime/index.ts`, and `src/main/services/kernel/ledger.ts`.
- Propose a conservative target structure for separating runtime composition, service tag definitions, live layer wiring, and kernel-facing dependencies.
- Include migration steps, risks, validation boundaries, and non-goals; preserve current IPC-facing behavior and backend runtime semantics.
- Avoid implementing the refactor in this task unless the existing project convention for architecture tickets requires storing the plan in a specific docs/ticket artifact.

## Acceptance Criteria

- The delivered plan chooses exactly one backend architecture area and does not broaden into a general backend rewrite.
- The plan includes concrete source references to `src/main/services/runtime/appLayer.ts`, `src/main/services/runtime/index.ts`, and `src/main/services/kernel/ledger.ts`.
- The plan contains an actionable target structure, migration sequence, risks, non-goals, and validation boundaries.
- The plan avoids duplicating completed Effect v4 migration/config hygiene work and frames this as a focused follow-up.
- A coding agent could start a later implementation ticket from the plan without first discovering the affected runtime/kernel entry points.

## Test Plan

- Run `pnpm typecheck` or the repo's existing TypeScript validation command after any follow-up implementation based on the plan.
- Run focused backend tests covering runtime/service composition and kernel ledger behavior if present in the repo.
- For the planning task itself, verify the plan references the exact affected files and does not require implementation agents to rediscover entry points.
- Confirm the plan explicitly states that IPC contracts and backend runtime semantics must remain unchanged.

## Implementation Notes

- Codebase finding: `src/main/services/runtime/appLayer.ts` defines runtime composition entry points: `ElectronDesktopLive`, `AppLayerLive`, `installAppRuntime`, `runtimeDisposed`, and `disposeAppRuntime`. It currently composes live services such as logger and git into the app runtime layer.
- Codebase finding: `src/main/services/runtime/index.ts` defines shared runtime service tags and defaults, including `BackendClockService`, `BackendClock`, `BackendClockLive`, `BackendConfigService`, `BackendConfig`, and `BackendConfigDefaults`. It imports `Config`, `Context`, `Effect`, `FileSystem`, `Layer`, `ManagedRuntime`, and `Path` from `effect`, indicating runtime concerns and service tag definitions are colocated in this module.
- Codebase finding: `src/main/services/kernel/ledger.ts` imports `BackendClock`, `BackendIoServices`, and `BackendServicesBase` from `../runtime`, so kernel ledger behavior depends directly on runtime-exported service contracts.
- Codebase finding: `src/main/services/kernel/ledger.ts` defines backend domain symbols including `BackendIoServices`, `BackendServicesBase`, `JobExecutionSnapshot`, `JobLedgerEvent`, `JobSubmitInput`, and `JobTransitionInput`, making it a useful adjacent consumer for evaluating whether runtime services are too broad or too tightly coupled to kernel logic.
- Codebase finding: Recent completed tickets already covered Effect v4 migration, runtime config hygiene, workflow evaluation, and TypeScript boundary tightening; this task should produce a focused follow-up plan rather than redoing migration or config cleanup work.
- Implementation: Write a planning artifact that names the target area as the backend Effect runtime/service boundary and explains why it is the highest-value follow-up after the completed Effect v4/config hygiene work.
- Implementation: Document current state: `appLayer.ts` owns live app runtime composition, `runtime/index.ts` mixes exported service tags/defaults/runtime primitives, and `kernel/ledger.ts` consumes runtime service contracts directly via `../runtime`.
- Implementation: Define the proposed layer/service structure: keep app runtime installation/disposal in `runtime/appLayer.ts`, move or group pure service tags/contracts separately from live layer construction, expose a narrow kernel dependency surface for clock/config/io services, and keep kernel modules dependent on contracts rather than app composition.
- Implementation: Add an incremental migration plan with bounded steps: introduce contract-only exports, update kernel imports to the narrower boundary, preserve existing live layer assembly, then remove broad runtime barrel dependencies once consumers are migrated.
- Implementation: Add risk and validation guidance covering dependency cycles, Effect layer provisioning, runtime disposal/resource lifetime, and regression checks for existing backend tests or IPC flows that exercise job ledger behavior.
- Bounded research inspected only three files and code search stopped after 90 candidate files, so the plan should clearly label the three known entry points as the initial bounded scope rather than claiming a full backend audit.
- No external URLs were provided or fetched.
- Use the prior completed tickets as context to avoid recommending another broad Effect v4 migration.

## Codex Handoff

No Codex run has been started.
