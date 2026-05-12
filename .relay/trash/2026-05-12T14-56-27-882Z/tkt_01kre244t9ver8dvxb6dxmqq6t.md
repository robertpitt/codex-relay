---
schemaVersion: 1
id: tkt_01kre244t9ver8dvxb6dxmqq6t
title: Evaluate Effect Workflow Concepts for Relay-Native Ticket Lifecycle Control
ticketType: task
status: todo
position: 19000
priority: medium
labels:
  - workflow
  - effect
  - architecture
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T12:20:55.753Z'
updatedAt: '2026-05-12T13:14:36.726Z'
codexThreadId: 019e1c52-281a-7032-8c08-dd083b4a76b2
runStatus: cancelled
lastRunId: run_01kre549hz642mv0e1krfemt8b
lastRunStartedAt: '2026-05-12T13:13:26.605Z'
---
## Summary

Explore how Relay can adapt ideas from the Workflow-related code under `.effect/packages/effect/src` as reference material for a Relay-native ticket lifecycle workflow layer. The first implementation focus should be validated status transitions and retry/recovery behavior, with pause/resume and inspection considered as staged follow-up capabilities.

## Original Idea

How can I incorporate the `.effect/packages/effect/src` Workflow related code so that I can better control the workflow of a ticket, the state changes, resumable and pauseable workflows.

## Clarifications Incorporated

- `.effect/packages/effect/src` is a cloned source reference only. Relay should not directly depend on Effect Workflow internals from that path.
- The first implementation should prioritize validated status transitions and retry/recovery.

## Problem

Relay tickets currently need a clearer workflow model for coordinating state changes and long-running execution. The desired system should make ticket workflows easier to validate, recover, retry, and eventually pause, resume, and inspect without relying on ad hoc state handling.

## Goals

- Review the Effect Workflow-related implementation under `.effect/packages/effect/src` as reference material only.
- Identify which concepts are useful for Relay ticket workflows without introducing a direct dependency on the cloned Effect source.
- Define a Relay-native model for ticket workflow state, validated transitions, retry behavior, and recovery.
- Determine how pause, resume, cancellation, completion, and workflow inspection should fit into the lifecycle model, even if some capabilities are staged after the first implementation.
- Produce an implementation plan for integrating workflow control into the ticket lifecycle.

## Non-Goals

- Do not implement the workflow integration as part of this ticket.
- Do not directly import or depend on internals from `.effect/packages/effect/src`.
- Do not migrate existing tickets or execution history yet.
- Do not change Relay board columns, ticket statuses, run history, or Codex execution metadata as part of this planning work.

## Proposed Investigation

1. Inspect the Workflow-related source in `.effect/packages/effect/src` and summarize its core primitives as design reference only.
2. Map those primitives to Relay concepts such as tickets, statuses, runs, retries, failures, cancellation, pauses, resumes, and blockers.
3. Define a Relay-native transition validation model for ticket status changes.
4. Identify required persistence changes for durable workflow state, retry attempts, recovery checkpoints, and transition audit history.
5. Define retry and recovery semantics for interrupted, failed, cancelled, and resumed ticket execution.
6. Document how pause/resume and workflow inspection could be added after the first implementation focus.
7. Document the safest integration path, including risks, staged rollout steps, and follow-up implementation tickets.

## Acceptance Criteria

- A concise architecture note explains which Effect Workflow concepts apply to Relay ticket workflows.
- The note explicitly states that `.effect/packages/effect/src` is reference-only and recommends a Relay-native workflow layer rather than a direct dependency on cloned Effect internals.
- The proposed first implementation scope prioritizes validated status transitions and retry/recovery behavior.
- The ticket workflow lifecycle describes expected behavior for validation, retry, recovery, failure, cancellation, completion, and later pause/resume support.
- Persistence requirements are documented for durable workflow state, transition history, retry attempts, and recovery checkpoints.
- Risks, migration considerations, staged rollout steps, and follow-up implementation tickets are listed.

## Codex Handoff

Ticket was redrafted from the original placeholder. No implementation has been performed. Clarification answers have been incorporated into the planning scope: Effect source is reference-only, and the initial implementation focus is validated status transitions plus retry/recovery.
