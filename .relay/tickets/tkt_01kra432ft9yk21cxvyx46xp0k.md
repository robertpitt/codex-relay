---
schemaVersion: 1
id: tkt_01kra432ft9yk21cxvyx46xp0k
title: Persist Run Usage and Duration Metrics
status: todo
position: 6000
priority: medium
labels:
  - developer-experience
  - agent-readiness
  - relay
createdAt: '2026-05-10T23:38:20.023Z'
updatedAt: '2026-05-10T23:38:20.023Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Persist Run Usage and Duration Metrics

## Context

Symphony's SPEC.md tracks live session metadata such as session identifiers, timestamps, token usage, turn counts, and aggregate runtime totals for observability. Source: https://raw.githubusercontent.com/openai/symphony/refs/heads/main/SPEC.md

Relay already writes normalized run events to `.relay/runs/<ticket-id>/<run-id>.jsonl`, and `turn.completed` can include usage data. Relay should preserve and display the most useful run metrics so a user can understand how much work a Codex run did.

## Requirements

- Inspect the current run event normalization and JSONL log writing.
- Persist run start time, completion time, duration, final status, thread ID, and usage/token data when the Codex SDK provides it.
- Expose a lightweight run summary to the renderer for the selected ticket's latest run.
- Display duration and usage details in the ticket detail run area without cluttering the board cards.
- Preserve backward compatibility with existing run logs that do not contain summary data.
- Avoid storing secrets, full environment variables, or duplicate prompt bodies in run summary metadata.
- Include enough structure for later aggregation across a project, but do not implement project-wide analytics in this ticket.

## Acceptance Criteria

- Completed, failed, and cancelled runs have a readable summary with start/end timing and final status.
- Token usage is shown when available and hidden or marked unavailable when the SDK does not provide it.
- Existing run JSONL files continue to load without errors.
- The UI can show the latest run's summary after an app restart.
- Focused tests or manual verification cover both usage-present and usage-absent run logs.
- The project's standard validation command succeeds.

## Clarification Questions

- None.

## Implementation Notes

- Prefer deriving summaries from existing JSONL events if that keeps the storage model simple; add a separate summary file only if repeated log parsing becomes a real problem.
- Keep the summary schema versioned if a new file format is introduced under `.relay/runs`.
- This ticket is observability-only and should not change how Codex runs are launched.

## Codex Handoff

No Codex run has been started.
