---
schemaVersion: 1
id: tkt_01kra3y7psvjh476nz7z4jwfed
title: Add Relay Workflow Definition Support
status: todo
position: 1000
priority: medium
labels:
  - documentation
  - workflow
  - agent-readiness
createdAt: '2026-05-10T23:35:41.529Z'
updatedAt: '2026-05-11T12:27:22.464Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Add Relay Workflow Definition Support

## Context

Relay should be extended to recognize and document a Relay-specific workflow definition as a first-class project artifact. This should not be a root-level `WORKFLOW.md` file. Relay should use a single workflow definition file at `.relay/workflow.md`.

The intended format and behavior should be informed by the WORKFLOW.md specification described in https://raw.githubusercontent.com/openai/symphony/refs/heads/main/SPEC.md, but adapted to Relay's `.relay` project metadata model. This ticket is for implementation planning only; the coding agent should inspect the current Relay repository before making changes.

## Clarified Decisions

- Workflow content should be stored only in `.relay/workflow.md`.
- Relay settings-file workflow support is not required and should be ignored for this ticket.
- Do not add a root-level `WORKFLOW.md` file.

## Requirements

- Review the linked Symphony `SPEC.md` and summarize the workflow requirements that apply to Relay before implementing.
- Do not add a root-level `WORKFLOW.md` file.
- Add support for defining workflow content at `.relay/workflow.md` only.
- Ensure the workflow definition documents Relay-specific development workflows, including setup, testing, validation, and release or deployment steps where applicable.
- If Relay has tooling that discovers project metadata, extend it to detect and surface `.relay/workflow.md` consistently with existing `.relay` project files.
- If the repository already has contributor or agent guidance files, make the Relay workflow definition complement them instead of duplicating conflicting instructions.
- Add or update tests only if code behavior changes, such as discovery, parsing, validation, or rendering of workflow content.
- Update any relevant documentation so human developers and coding agents know when and how to use `.relay/workflow.md`.

## Acceptance Criteria

- No root-level `WORKFLOW.md` file is added.
- The workflow definition exists at `.relay/workflow.md`.
- The workflow content contains Relay-specific workflows rather than generic placeholder content.
- No Relay settings-file workflow configuration is added.
- Existing documentation remains consistent with the new workflow definition, with no contradictory setup or test instructions.
- Any code paths that need to discover, read, validate, or display the workflow definition are updated and covered by tests.
- The project's standard validation command succeeds after the change.
- A reviewer can understand from the PR description which parts of the Symphony spec were implemented, how Relay adapted the storage location, and which parts were intentionally deferred.

## Clarification Questions

- Should the Relay workflow definition be treated as required project metadata, optional documentation, or an experimental convention?

## Implementation Notes

- Start by inspecting existing files such as README, CONTRIBUTING, AGENTS, package scripts, CI configuration, deployment docs, `.relay` metadata, and settings schema/configuration code to avoid conflicting instructions.
- Prefer a minimal first implementation centered on `.relay/workflow.md` as the single file-based workflow definition.
- Keep the workflow content concrete and command-oriented, using actual commands from this repository.
- Do not implement settings-file workflow storage, settings references, or precedence rules for this ticket.
- If the linked spec defines validation rules or machine-readable sections, implement those exactly where they still make sense for Relay's `.relay` metadata model rather than inventing a local variant.

## Codex Handoff

No Codex run has been started.
