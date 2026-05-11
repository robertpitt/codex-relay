---
schemaVersion: 1
id: tkt_01kra432ftrt7tpev083fwywr4
title: Add Post-Run Review Actions
status: todo
position: 9000
priority: medium
labels:
  - workflow
  - developer-experience
  - agent-readiness
createdAt: '2026-05-10T23:38:20.023Z'
updatedAt: '2026-05-10T23:38:20.023Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Add Post-Run Review Actions

## Context

Symphony's SPEC.md makes an important workflow distinction: a successful coding-agent run may end at a workflow-defined handoff state such as human review, not necessarily `Done`. Source: https://raw.githubusercontent.com/openai/symphony/refs/heads/main/SPEC.md

Relay already instructs Codex not to mark tickets completed itself. After a run completes, Relay should give the user clear review actions so the board state reflects a human decision rather than automatic completion.

## Requirements

- Review the current ticket detail behavior after `runStatus` becomes `completed`.
- Add a post-run review area or action state for completed Codex runs.
- Offer clear actions for moving the ticket to `Completed`, moving it to `Needs Clarification`, keeping it in the current column, and starting/resuming follow-up work.
- Show the latest Codex handoff close to those actions so the user can make the board decision without hunting through the Markdown body.
- Ensure the app never automatically moves a ticket to `Completed` solely because Codex finished a run.
- Record any user-triggered status move through the existing ticket move/save path.
- Keep the behavior compatible with custom columns by using configured column IDs and terminal metadata.

## Acceptance Criteria

- When a Codex run completes, the ticket detail panel presents explicit review actions.
- The ticket stays under human control; Relay does not mark it completed automatically.
- Moving to `Completed` or `Needs Clarification` updates the board and ticket front matter consistently.
- The latest Codex handoff remains visible in the review flow.
- Custom column configurations do not break the review actions; unavailable default columns are handled gracefully.
- The project's standard validation command succeeds.

## Clarification Questions

- None.

## Implementation Notes

- This ticket is intentionally smaller than a full workflow-state engine.
- Prefer actions that map to existing columns and controls before adding new project settings.
- If the project does not have a `needs_clarification` column, hide or relabel that action rather than creating a column implicitly.

## Codex Handoff

No Codex run has been started.
