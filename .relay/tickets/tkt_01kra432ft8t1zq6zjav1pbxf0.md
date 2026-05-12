---
schemaVersion: 1
id: tkt_01kra432ft8t1zq6zjav1pbxf0
title: Add Project Run Concurrency Limits
ticketType: task
status: completed
position: 46000
priority: medium
labels:
  - workflow
  - agent-readiness
  - relay
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-10T23:38:20.023Z'
updatedAt: '2026-05-12T00:29:32.697Z'
codexThreadId: null
runStatus: idle
lastRunId: null
lastRunStartedAt: null
---
# Add Project Run Concurrency Limits

## Context

Symphony's SPEC.md uses bounded concurrency so an orchestrator never launches more coding-agent sessions than the configured capacity. Source: https://raw.githubusercontent.com/openai/symphony/refs/heads/main/SPEC.md

Relay should not become an automatic scheduler, but it can still protect a local project from too many manually-started Codex runs. A conservative per-project run cap fits Relay's board-first workflow and reduces accidental resource contention.

## Requirements

- Add a project-level concurrency setting to `.relay/project.json`, defaulting conservatively for existing projects.
- Count active runs for a project from the main-process in-memory run registry and ticket `runStatus` values where useful.
- Block starting a new run when the project is at its configured active-run limit.
- Show the current active-run count and limit in the project or ticket UI where run controls are shown.
- Disable or explain `Start Codex` when the limit is reached.
- Keep the limit focused on manually-started Relay runs; do not add polling, queueing, or automatic dispatch.
- Ensure older project configs without the new setting still parse and receive a default.

## Acceptance Criteria

- A project cannot start more active Codex runs than its configured limit.
- The main process enforces the limit even if multiple renderer actions happen close together.
- The renderer communicates why a run cannot start when the limit is reached.
- Existing `.relay/project.json` files continue to load without manual migration.
- The implementation includes focused tests or a documented manual verification path for the limit behavior.
- The project's standard validation command succeeds.

## Clarification Questions

- None.

## Implementation Notes

- Consider `maxConcurrentRuns` under `settings` with a default of `1` unless the surrounding product design already establishes a different default.
- If a settings editor does not yet exist, it is acceptable to support the setting in project config first and display the effective value read-only.
- Avoid queueing deferred runs in this ticket; a queue would be a separate scheduling feature.

## Codex Handoff

No Codex run has been started.
