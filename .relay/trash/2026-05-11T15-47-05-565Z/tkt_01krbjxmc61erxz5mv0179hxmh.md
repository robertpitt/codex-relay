---
schemaVersion: 1
id: tkt_01krbjxmc61erxz5mv0179hxmh
title: Remove Legacy Effect Migration Shims and Document Final State
ticketType: task
status: todo
position: 16000
priority: medium
labels:
  - backend
  - cleanup
  - documentation
  - effect-v4
parentEpicId: tkt_01krbjxm9ggwkt1053h8j2rdtw
subticketIds: []
createdAt: '2026-05-11T13:16:44.806Z'
updatedAt: '2026-05-11T13:16:44.806Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Remove Legacy Effect Migration Shims and Document Final State

## Context

After the backend is running on Effect v4/effect-smol, remove temporary compatibility code and leave concise documentation for future backend development.

## Research Findings

- Research found no existing migration documentation. Implementation should add notes only where the repository convention supports them, such as PR notes, inline comments for non-obvious adapters, or a backend README if one exists.
- Renderer React `useEffect` files should remain untouched unless prior subtickets identify an actual backend contract change.

## Requirements

- Remove obsolete imports, compatibility shims, dead code, and old dependency declarations introduced or left behind during migration.
- Document any retained adapters, changed package names, or intentional behavior changes.
- Ensure formatting, linting, typecheck, and backend tests pass after cleanup.
- Keep documentation concise and located according to existing repository conventions.

## Implementation Plan

- Search for old Effect package names/imports and remove any remaining backend usage.
- Delete temporary migration helpers that are no longer needed.
- Add concise documentation or PR notes describing the new backend Effect v4/effect-smol pattern and any retained boundary adapters.
- Run repository formatting/lint/typecheck/backend tests as available.
- Review the final diff for unrelated changes and revert only changes made by this migration that are out of scope.

## Acceptance Criteria

- No legacy backend Effect imports or unused migration shims remain.
- The final dependency graph contains only the intended Effect v4/effect-smol dependency for backend usage.
- Developers have a clear note explaining the new backend Effect pattern and any retained adapters.
- All relevant verification commands pass or any remaining failures are documented with cause.

## Clarification Questions

- None.

## Implementation Notes

- Do not remove user-authored unrelated changes while cleaning up the migration diff.

## Research Metadata

- No research metadata recorded.

## Codex Handoff

No Codex run has been started.
