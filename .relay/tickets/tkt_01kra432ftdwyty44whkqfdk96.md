---
schemaVersion: 1
id: tkt_01kra432ftdwyty44whkqfdk96
title: Recover Interrupted Runs on App Startup
status: todo
position: 4000
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
# Recover Interrupted Runs on App Startup

## Context

Symphony's SPEC.md calls out restart recovery from tracker and filesystem state without relying on a persistent database. Source: https://raw.githubusercontent.com/openai/symphony/refs/heads/main/SPEC.md

Relay already persists ticket run metadata and JSONL run logs in `.relay/`, but an app crash or restart can leave tickets marked `running` or `blocked` even though no Codex process is active. Relay should reconcile that state when it opens a project.

## Requirements

- Inspect how projects and boards are loaded during app startup and project selection.
- Detect stale tickets whose `runStatus` is `running` or `blocked` but whose `lastRunId` is not present in the current in-memory active run registry.
- On first project load after app startup, reconcile stale runs to a non-active state and append a concise Codex handoff note explaining that Relay was restarted before the run completed.
- Preserve the existing `codexThreadId` so the user can choose whether to resume the previous thread.
- Avoid changing tickets that correspond to active in-memory runs in the current app process.
- Surface a project health message or toast when stale runs were reconciled.
- Keep this behavior local to Relay project state; do not add background retry or automatic resume.

## Acceptance Criteria

- Relaunching Relay with a ticket left in `running` no longer leaves the board permanently showing an active run that cannot be stopped.
- The ticket records a clear handoff note with the interrupted run ID when available.
- Users can still resume an existing Codex thread after reconciliation.
- Reconciliation is idempotent and does not append duplicate interruption notes on every board refresh.
- Focused tests or manual verification cover at least one stale running ticket and one currently active run that must not be reconciled.
- The project's standard validation command succeeds.

## Clarification Questions

- None.

## Implementation Notes

- Prefer a helper in the storage or run service layer that returns a reconciliation summary for the UI.
- Use `failed` or `cancelled` consistently with existing run status semantics; document the selected status in code or README if it is not obvious.
- Include the run ID and timestamp in the handoff note, but do not duplicate full JSONL log contents in the ticket body.

## Codex Handoff

No Codex run has been started.
