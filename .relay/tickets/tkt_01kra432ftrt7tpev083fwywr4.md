---
schemaVersion: 1
id: tkt_01kra432ftrt7tpev083fwywr4
title: Stop Auto-Completing Runs and Add Post-Run Review Actions
status: todo
position: 9000
priority: high
labels:
  - workflow
  - developer-experience
  - agent-readiness
  - bug
createdAt: '2026-05-10T23:38:20.023Z'
updatedAt: '2026-05-11T12:56:12.469Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Stop Auto-Completing Runs and Add Post-Run Review Actions

## Context

Symphony's SPEC.md makes an important workflow distinction: a successful coding-agent run may end at a workflow-defined handoff state such as human review, not necessarily `Done`. Source: https://raw.githubusercontent.com/openai/symphony/refs/heads/main/SPEC.md

Relay's own SPEC now says a completed Codex run should set `runStatus` to `completed`, write `lastRunId`, append the final response to `Codex Handoff`, and leave the card under human control until the user marks it complete.

The current implementation has drifted since this ticket was written:

- Ticket detail already has `Start Codex`, `Resume Codex`, `Stop`, editable status, the clarification panel, the Agent Ticket Update panel, and the Agent Activity/log viewer.
- `beginRun` in `src/main/services/codex.ts` moves tickets to `in_progress` at run start when that column exists.
- If Codex asks for clarification, the backend sets `runStatus: blocked`, creates clarification records, appends the handoff, and moves to `needs_clarification` if configured.
- On a normal successful `turn.completed`, the backend sets `runStatus: completed`, appends the handoff, and currently auto-transitions the ticket to `completed` if that column exists. This is the behavior this ticket should replace.

## Requirements

- Remove the normal successful-run auto-transition to `completed` from the Codex execution path. A successful run should update run metadata and append the handoff, but leave the ticket status unchanged after the run-start transition, usually `in_progress`.
- Keep the existing clarification-request flow working: parsed clarification requests may still create clarification records, set `runStatus: blocked`, and move to `needs_clarification` when that configured column exists.
- Add a post-run review area in the ticket detail panel when the latest implementation Codex run has `runStatus === "completed"`.
- Show the latest Codex handoff close to the review actions. Prefer the latest `run.completed.finalResponse` from merged run events, and fall back to the latest entry in the Markdown `## Codex Handoff` section when saved events are unavailable.
- Offer clear review controls for:
  - moving the ticket to the configured `completed` column, or to a configured terminal column when `completed` is unavailable;
  - moving the ticket to `needs_clarification` when that column exists;
  - keeping the ticket in its current column without creating new persisted workflow state;
  - continuing work through the existing Start/Resume Codex action.
- Use configured `board.columns` names and IDs in the UI. Do not create implicit columns or new project settings.
- Record user-triggered status moves through the existing ticket save/move persistence path with a user source, not through `agent_execution`.
- Do not silently persist unrelated unsaved editor changes when a review status action is clicked; either block the action while unsaved edits exist or update status from a freshly loaded ticket record.
- Keep the Agent Ticket Update workflow separate. Post-run follow-up work should not be confused with the ticket-content update agent.
- Do not mutate run logs, run history, `lastRunId`, `codexThreadId`, or Codex execution metadata from review actions.

## Acceptance Criteria

- A successful implementation Codex run no longer moves the ticket to `Completed` automatically.
- Backend coverage asserts successful run completion leaves ticket status in the current/in-progress column while setting `runStatus` to `completed` and appending the handoff.
- When a completed run is selected, the ticket detail panel shows a review area with the latest handoff and explicit review actions.
- `Mark Completed` updates board state and ticket front matter consistently through existing persistence, and creates a user status-change audit event.
- `Needs Clarification` is shown only when the configured `needs_clarification` column exists, and uses the existing status-change persistence path.
- If no `completed` or terminal target column exists, the completion action is hidden or disabled with clear copy.
- `Continue Work` uses the existing Start/Resume Codex behavior and can start a follow-up run without changing ticket status first.
- Existing clarification-request behavior and the clarification panel continue to work.
- `npm test` and `npm run typecheck` succeed; run `npm run build` as well if IPC/shared type changes are made.

## Clarification Questions

- None.

## Implementation Notes

- This ticket is intentionally smaller than a full workflow-state engine. Do not add a persisted reviewed/dismissed state unless another ticket explicitly asks for it.
- The main backend change is in `src/main/services/codex.ts` around successful `turn.completed` handling.
- The main renderer change is in `src/renderer/src/App.tsx`, near the ticket detail actions and `AgentActivityPanel`.
- A small helper for deriving the latest handoff from `currentRunEvents` and Markdown may keep the UI code readable.
- Prefer existing `window.relay.ticket.save` or `window.relay.ticket.move` APIs before adding IPC.
- If using a terminal custom column as the completion target, label the action with that column's configured name.

## Codex Handoff

No Codex run has been started.
