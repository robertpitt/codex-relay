---
schemaVersion: 1
id: tkt_01kra432ftvqm6kp3xgk40f29y
title: Add Stalled Run Detection
status: todo
position: 5000
priority: medium
labels:
  - workflow
  - agent-readiness
  - relay
createdAt: '2026-05-10T23:38:20.023Z'
updatedAt: '2026-05-10T23:38:20.023Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Add Stalled Run Detection

## Context

Symphony's SPEC.md includes stall detection and timeout handling so an agent session that stops producing events does not occupy orchestration state indefinitely. Source: https://raw.githubusercontent.com/openai/symphony/refs/heads/main/SPEC.md

Relay should keep runs user-started and visible, but it still needs a practical way to detect a Codex stream that has stalled or stopped producing events. This improves reliability without adding daemon dispatch.

## Requirements

- Track the last event timestamp for each active Codex run in the main process.
- Add an implementation-defined stall timeout with a conservative default and a way to disable it for development if needed.
- When a run exceeds the stall timeout with no new events, abort the run, mark the ticket with an appropriate non-active `runStatus`, emit a `run.failed` event, and append a concise handoff note.
- Reset the stall timer on meaningful streamed events from Codex.
- Make the timeout visible in logs and in the UI error/handoff text.
- Do not treat normal long-running commands with continuing output as stalled.
- Avoid automatic retries in this ticket.

## Acceptance Criteria

- A stalled run is detected and moved out of active state without requiring an app restart.
- The user can see that the run stopped because of a stall timeout, including the effective timeout value.
- Runs that continue emitting output do not trip the stall detector.
- Cancelling a run manually and completing a run normally both clean up any stall timers.
- Focused tests or a deterministic manual test path cover timeout, reset, cancel, and complete cleanup behavior.
- The project's standard validation command succeeds.

## Clarification Questions

- None.

## Implementation Notes

- Symphony names this concept `codex.stall_timeout_ms`; Relay may use a Relay-native project setting name if that fits the existing config better.
- Keep timer ownership in the main process near `activeRuns` so renderer state cannot affect safety.
- If the current Codex SDK does not expose all low-level events, define "meaningful streamed event" using the normalized Relay events already emitted to the renderer.

## Codex Handoff

No Codex run has been started.
