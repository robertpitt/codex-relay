---
schemaVersion: 1
id: tkt_01krbzznkmnvjvz219fatr4426
title: Update README to Reflect Current Project Structure
ticketType: task
status: completed
position: 31000
priority: medium
labels:
  - documentation
  - readme
  - project-structure
parentEpicId: null
subticketIds: []
createdAt: '2026-05-11T17:05:03.092Z'
updatedAt: '2026-05-11T17:09:28.940Z'
codexThreadId: 019e17ff-e1a0-7eb0-9b26-07aa2dae5f0d
runStatus: completed
lastRunId: run_01krbzzr9ax6wt19p9jxskv3rz
---
# Update README to Reflect Current Project Structure

## Context

The README should be refreshed so new contributors and coding agents can quickly understand Relay's current layout and the main workflows around projects, tickets, drafts, updates, storage, IPC, and Codex integration. The update should be documentation-only and should avoid changing runtime behavior.

## Research Findings

- `src/main/ipc/methods/projects.ts` defines project-related IPC methods such as `addProjectFolder`, using registry helpers (`readRegistry`, `upsertProjectPath`, `removeProjectPath`) and storage helpers (`initializeProject`, `summarizeProject`).
- `src/main/ipc/methods/tickets.ts` defines ticket-related IPC methods and references `TicketCreateInput`, `EpicSubticketCreateInput`, and `createTicketDraft`, indicating ticket creation and draft generation are part of the main IPC surface.
- `src/main/services/codex/index.ts` contains Codex integration types and flows including `CreateDraftInput`, `TicketCreateInput`, `AgentTicketUpdate`, and `AgentTicketUpdateInput`.
- `tests/ticket-draft.test.ts` covers ticket draft behavior through `createTicketDraft`, `draftToCreateInput`, `validDraftJson`, and `validEpicDraftJson`.
- `tests/ticket-update.test.ts` covers ticket update behavior using storage functions such as `createTicket`, `readTicket`, and `readClarificationQuestions`.
- `tests/backend.test.ts` covers broader backend behavior including `createTicket`, `createSubticket`, `createClarificationQuestions`, and `CodexRunDependencies`.
- Research did not include reading the existing README content, and code search stopped after scanning 160 candidate files, so the implementer should verify the current README before editing.

## Requirements

- Update the root README to accurately describe the current Relay project structure.
- Document the main source areas at a useful level of detail, including IPC methods, storage/services, Codex integration, shared types, and tests where applicable.
- Ensure descriptions match actual files and exported concepts in the repository rather than inferred or outdated architecture.
- Include enough guidance for a new developer or coding agent to locate project management, ticket management, draft/update flows, and tests.
- Keep the README concise and maintainable; avoid duplicating implementation details that are likely to drift.
- Do not change application code, tests, package metadata, or generated files unless required by existing documentation tooling.

## Implementation Plan

- Open the existing root README and identify the sections that describe project purpose, setup, architecture, and repository layout.
- Inspect the current top-level tree and key source directories under `src/main`, `src/shared`, renderer/UI directories if present, and `tests` to validate the actual structure.
- Revise or add a project structure section that maps major directories/files to responsibilities, using concrete examples such as `src/main/ipc/methods/projects.ts`, `src/main/ipc/methods/tickets.ts`, and `src/main/services/codex/index.ts`.
- Update any outdated references to ticket creation, draft generation, ticket updates, clarification questions, subtickets, project registry/storage, or Codex runs so they align with the current codebase.
- Review setup, development, and test command sections for accuracy against `package.json` scripts if those sections exist.
- Run the repository's normal documentation-safe validation, such as markdown formatting or link checks if configured; otherwise run a lightweight README review for broken internal paths and stale file names.

## Acceptance Criteria

- The root README contains an accurate, current project structure overview.
- The README points readers to the relevant code areas for project IPC, ticket IPC, storage/services, Codex integration, and tests.
- All documented file paths and command references exist or are explicitly marked as examples/placeholders.
- No runtime source files are changed as part of this documentation task.
- The README remains concise enough for onboarding and does not include large copied source snippets.
- Any validation performed, or the reason validation was not available, is noted in the implementation summary.

## Clarification Questions

- None.

## Implementation Notes

- Start by verifying the existing README because it was not part of the bounded research read set.
- Use actual repository inspection as the source of truth; the research context is intentionally bounded and may not cover renderer/UI structure or all service modules.
- This is a documentation-only task unless the README references tooling that requires generated documentation updates.

## Research Metadata

- File inspected: tests/ticket-update.test.ts - Matched terms: create, project, structure; characters read: 8229; symbols: TicketUpdateDependencies, createProject, projectPath, createFakeRunEventSink, events, waitFor
- File inspected: tests/backend.test.ts - Matched terms: create, project; characters read: 12000; symbols: CodexRunDependencies, createProject, projectPath, auditEvents, raw, allowNonGitRuns
- File inspected: tests/ticket-draft.test.ts - Matched terms: create, project; characters read: 12000; symbols: TicketDraftDependencies, readyStatus, createProject, projectPath, validDraftJson, validEpicDraftJson
- File inspected: src/main/ipc/methods/projects.ts - Matched terms: create, project; characters read: 3832; symbols: AnyRelayIpcMethod, projectSummariesFromRegistry, registry, addProjectFolder, electronDialog, result
- File inspected: src/main/ipc/methods/tickets.ts - Matched terms: create, project; characters read: 6015; symbols: AnyRelayIpcMethod, ticketIpcMethods, resolvedProjectPath, meta
- File inspected: src/main/services/codex/index.ts - Matched terms: create, project; characters read: 12000; symbols: Thread, ThreadEvent, ThreadItem, ThreadOptions, AgentTicketUpdate, AgentTicketUpdateInput
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

### 5/11/2026, 6:09:28 PM

Summary of changes made:
- Updated [README.md](/Users/robertpitt/Projects/relay/README.md) to reflect the current split `src/main` architecture.
- Added current `.relay` storage details for clarifications, audit logs, runs, and trash.
- Expanded repository structure, backend map, Codex flow pointers, IPC guidance, and test map.
- Removed outdated references to flat service files such as `src/main/services/storage.ts`.

Files changed:
- [README.md](/Users/robertpitt/Projects/relay/README.md)

Commands run:
- Inspected repo/docs/source with `find`, `sed`, `grep`, `git diff`, and `git status`.
- Tried `rg`, but it is not installed in this environment.
- Ran `git diff --check README.md`.
- Ran explicit README path existence validation for documented source/test paths.
- Ran a stale-reference check for old flat service file paths.

Tests run and results:
- No application test suite was run because this was documentation-only.
- Documentation validation passed: no whitespace errors, all checked README paths exist, and no stale flat service references remain.

Remaining risks or follow-up:
- No known remaining risks. No markdown lint or link-check script is configured in `package.json`.


No Codex run has been started.
