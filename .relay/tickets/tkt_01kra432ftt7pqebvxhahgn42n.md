---
schemaVersion: 1
id: tkt_01kra432ftt7pqebvxhahgn42n
title: Add Ticket Blocker Metadata and Start Guards
status: todo
position: 8000
priority: medium
labels:
  - workflow
  - tickets
  - agent-readiness
createdAt: '2026-05-10T23:38:20.023Z'
updatedAt: '2026-05-10T23:38:20.023Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Add Ticket Blocker Metadata and Start Guards

## Context

Symphony's SPEC.md normalizes issue blockers and uses them during dispatch eligibility, including avoiding work on `Todo` issues that still have non-terminal blockers. Source: https://raw.githubusercontent.com/openai/symphony/refs/heads/main/SPEC.md

Relay does not need a full external issue model, but local tickets can still benefit from first-class blocker metadata. This helps users avoid starting Codex on work that depends on unfinished local tickets.

## Requirements

- Add optional blocker metadata to Relay tickets in a backward-compatible way.
- Let users choose one or more existing tickets as blockers from the ticket detail UI.
- Show blocked status on board cards and in ticket detail when any blocker is not in a terminal column.
- Prevent `Start Codex` by default for blocked tickets and show which blockers are still active.
- Provide an explicit user override for starting a blocked ticket if product patterns support overrides; otherwise document that blockers are strict.
- Handle deleted or invalid blocker references gracefully.
- Keep blocker logic local to `.relay` ticket state; do not add external tracker dependencies.

## Acceptance Criteria

- Existing tickets without blocker metadata still parse and render normally.
- A ticket can reference other local tickets as blockers and show their titles/statuses.
- A blocked ticket cannot accidentally start a Codex run without the user seeing the blocker reason.
- Moving blocker tickets into terminal columns updates the blocked ticket's eligibility on the next board refresh.
- Deleted or missing blocker tickets appear as warnings rather than crashing the board.
- The project's standard validation command succeeds.

## Clarification Questions

- None.

## Implementation Notes

- The existing ticket front matter parser uses passthrough behavior, but shared TypeScript types and renderer forms should still be updated if blocker metadata becomes first-class.
- Treat terminal columns using `.relay/project.json` column metadata instead of hard-coding `completed`.
- Avoid implementing dependency graphs, critical paths, or automatic scheduling in this ticket.

## Codex Handoff

No Codex run has been started.
