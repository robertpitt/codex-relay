---
schemaVersion: 1
id: tkt_01kra432ftcjckyf9v3xkz5dgv
title: Improve Run Console Filtering and Log Access
ticketType: task
status: not_doing
position: 1000
priority: medium
labels:
  - developer-experience
  - agent-readiness
  - relay
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-10T23:38:20.023Z'
updatedAt: '2026-05-12T12:06:15.312Z'
codexThreadId: null
runStatus: idle
lastRunId: null
lastRunStartedAt: null
---
# Improve Run Console Filtering and Log Access

## Context

Symphony's SPEC.md treats structured logs and an operator-visible status surface as core observability needs for agent operations. Source: https://raw.githubusercontent.com/openai/symphony/refs/heads/main/SPEC.md

Relay has a ticket run console, but users need better tools to inspect command output, agent messages, file changes, failures, and persisted run logs from inside the ticket detail view.

## Requirements

- Review the current run event rendering in the ticket detail panel.
- Add event-type filters for at least agent messages, commands, file changes, approvals, and failures.
- Show timestamps for rendered run events in a compact, readable form.
- Make command events easier to scan by grouping command start, output, and completion where practical.
- Add a `Reveal Run Log` or equivalent action for the selected ticket's latest run JSONL file.
- Add a copy action for the visible console text or latest run log path.
- Preserve real-time streaming behavior while filters are active.
- Keep historical log loading read-only; this ticket should not mutate old run logs.

## Acceptance Criteria

- Users can filter a run console to isolate command output, file changes, failures, or agent messages.
- The latest run log can be revealed from the ticket detail UI after a run has started.
- Console timestamps and grouped command output improve scanability without hiding raw details entirely.
- Filtering does not drop incoming events or require restarting a run.
- Existing run event types still render with sensible fallback text.
- The project's standard validation command succeeds.

## Clarification Questions

- None.

## Implementation Notes

- Use Relay's existing normalized event types before adding new event classes.
- If historical log loading is needed to support reveal/copy UX, implement it through the preload IPC boundary rather than renderer filesystem access.
- Keep visual changes consistent with the existing quiet desktop app style.

## Codex Handoff

No Codex run has been started.
