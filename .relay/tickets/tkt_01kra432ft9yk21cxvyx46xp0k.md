---
schemaVersion: 1
id: tkt_01kra432ft9yk21cxvyx46xp0k
title: Persist Run Usage and Duration Metrics
ticketType: task
status: review
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
updatedAt: '2026-05-11T21:33:54.625Z'
codexThreadId: 019e18ec-539c-7d83-8e2e-0232e605cce7
runStatus: completed
lastRunId: run_01krcerm4yp8ks39b9bx0bf915
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

### 5/11/2026, 10:33:54 PM

Summary of changes made:
- Added derived run summaries from existing JSONL logs: start/end time, duration, final status, thread ID, event count, and normalized token usage.
- Added optional `finalStatus` to new terminal run events while keeping old logs valid.
- Exposed `codex.readLatestRunSummary` through IPC/preload.
- Updated the ticket detail run area to show duration, status/timing/thread details, and token usage when present. Board cards are unchanged.
- Added focused tests for usage-present, usage-absent, failed, and cancelled summaries.

Files changed:
- `src/main/services/run-events/index.ts`
- `src/main/services/codex/index.ts`
- `src/main/services/schemas.ts`
- `src/main/ipc/methods/codex.ts`
- `src/shared/types.ts`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/components/AgentActivity.tsx`
- `src/renderer/src/styles.css`
- `tests/agent-progress.test.tsx`
- `tests/run-events.test.ts`
- `tests/run-tests.mjs`

Commands run:
- Inspection via `git status`, `git ls-files`, `grep`, `sed`, and `git diff`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `git diff --check`

Tests run and results:
- `npm run typecheck`: passed
- `npm test`: passed, 78/78 tests
- `npm run build`: passed
- `git diff --check`: passed

Remaining risks or follow-up:
- No known code/test blockers. I did not manually inspect the Electron UI, but renderer coverage and the production build both passed.
- The worktree had pre-existing unrelated `.relay` and `.effect` changes before this work; I left them untouched.


No Codex run has been started.
