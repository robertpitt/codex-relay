---
schemaVersion: 1
id: tkt_01kra432frxhrp6fy46dvqdsj5
title: Add Codex Run Preflight Checks
status: todo
position: 2000
priority: medium
labels:
  - workflow
  - agent-readiness
  - developer-experience
createdAt: '2026-05-10T23:38:20.023Z'
updatedAt: '2026-05-10T23:38:20.023Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Add Codex Run Preflight Checks

## Context

Symphony's SPEC.md describes dispatch preflight validation before an agent run is launched: validate configuration, credentials, workflow inputs, and launch prerequisites, then surface operator-visible errors instead of failing deep inside the runner. Source: https://raw.githubusercontent.com/openai/symphony/refs/heads/main/SPEC.md

Relay is not a daemon and should keep explicit user-started runs, but the same preflight concept fits Relay's `Start Codex` and `Resume Codex` actions. A user should know exactly why a run cannot start before Relay mutates ticket state or opens a Codex thread.

## Requirements

- Inspect the current `startCodexRun` and `resumeCodexRun` flow in the Electron main process and renderer detail panel.
- Add a side-effect-free run preflight path that can be called before starting or resuming a Codex run.
- Validate at least these conditions: project path exists, `.relay/project.json` parses, ticket file parses, ticket status maps to a configured column, Codex execution is enabled, Codex CLI/auth status is acceptable, Git/non-Git policy is satisfied, and the same ticket does not already have an active in-memory run.
- Run the same validation immediately inside the main-process start path to prevent renderer-only checks from becoming stale.
- Show blocking preflight failures in the ticket detail UI with concise, actionable messages.
- Preserve Relay's explicit user approval model; this ticket must not add background dispatch or automatic remediation.
- Log preflight failures without printing secrets or auth token values.

## Acceptance Criteria

- `Start Codex` and `Resume Codex` do not mutate ticket run state when preflight validation fails.
- The user can see all blocking preflight reasons before starting a run.
- Main-process validation still protects the run path if the renderer skips or races the preflight call.
- Existing successful run behavior is unchanged when preflight passes.
- New or updated tests cover at least one passing preflight and representative failures for missing Codex auth, non-Git policy, invalid ticket status, and duplicate active run.
- The project's standard validation command succeeds.

## Clarification Questions

- None.

## Implementation Notes

- Prefer a shared typed result such as `{ ok: boolean, errors: string[], warnings: string[] }` rather than throwing for every expected validation failure.
- Keep filesystem and Codex status checks in the main process; the renderer should consume only the typed preflight result.
- This is inspired by Symphony's dispatch preflight but should remain scoped to manual Relay ticket execution.

## Codex Handoff

No Codex run has been started.
