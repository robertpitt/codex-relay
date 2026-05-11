---
schemaVersion: 1
id: tkt_01kra3y7psvjh476nz7z4jwfed
title: Add WORKFLOW.md Support
status: todo
position: 1000
priority: medium
labels:
  - documentation
  - workflow
  - agent-readiness
createdAt: '2026-05-10T23:35:41.529Z'
updatedAt: '2026-05-10T23:35:41.529Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Add WORKFLOW.md Support

## Context

Relay should be extended to recognize and document a root-level WORKFLOW.md file as a first-class project artifact. The intended format and behavior should be based on the WORKFLOW.md specification described in https://raw.githubusercontent.com/openai/symphony/refs/heads/main/SPEC.md. This ticket is for implementation planning only; the coding agent should inspect the current Relay repository before making changes.

## Requirements

- Review the linked Symphony SPEC.md and summarize the WORKFLOW.md requirements that apply to Relay before implementing.
- Add a root-level WORKFLOW.md file if the spec expects one to live at the project root.
- Ensure the file documents Relay-specific development workflows, including setup, testing, validation, and release or deployment steps where applicable.
- If Relay has tooling that discovers project metadata, extend it to detect and surface WORKFLOW.md consistently with existing project files.
- If the repository already has contributor or agent guidance files, make WORKFLOW.md complement them instead of duplicating conflicting instructions.
- Add or update tests only if code behavior changes, such as discovery, parsing, validation, or rendering of WORKFLOW.md.
- Update any relevant documentation so human developers and coding agents know when and how to use WORKFLOW.md.

## Acceptance Criteria

- A WORKFLOW.md file exists in the expected location and follows the structure required by the linked spec.
- The file contains Relay-specific workflows rather than generic placeholder content.
- Existing documentation remains consistent with the new workflow file, with no contradictory setup or test instructions.
- Any code paths that need to discover, read, validate, or display WORKFLOW.md are updated and covered by tests.
- The project’s standard validation command succeeds after the change.
- A reviewer can understand from the PR description which parts of the Symphony spec were implemented and which were intentionally deferred.

## Clarification Questions

- Should this task only add a root-level WORKFLOW.md document, or should Relay application code also parse/use it at runtime?
- Which Relay workflows must be documented first: local development, testing, CI, deployment, agent workflows, or all of these?
- Should WORKFLOW.md be treated as required project metadata, optional documentation, or an experimental convention?

## Implementation Notes

- Start by inspecting existing files such as README, CONTRIBUTING, AGENTS, package scripts, CI configuration, and deployment docs to avoid conflicting instructions.
- Prefer a minimal first implementation: add the document and only modify runtime/tooling behavior if Relay already has a comparable metadata discovery pattern.
- Keep the WORKFLOW.md content concrete and command-oriented, using actual commands from this repository.
- If the linked spec defines validation rules or machine-readable sections, implement those exactly rather than inventing a local variant.

## Codex Handoff

No Codex run has been started.
