---
schemaVersion: 1
id: tkt_01krhmsbpyf6ytkx5240zkzge3
title: Create detailed README files for backend service folders
ticketType: task
status: todo
position: 21000
priority: medium
effort: medium
labels:
  - documentation
  - backend
  - services
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-13T21:44:48.606Z'
updatedAt: '2026-05-15T15:42:53.787Z'
authoringState: ready
codexThreadId: 019e2c4d-d567-78a0-a05b-fc88cc7631c5
runStatus: cancelled
lastRunId: run_01krp4vmf9hfqdb8xc6ejhb5rf
lastRunStartedAt: '2026-05-15T15:42:38.472Z'
---
# Create detailed README files for backend service folders

## Context

Add maintainable operational README documentation under each immediate child directory of `src/main/services/` so developers and coding agents can understand service ownership, architecture, interfaces, workflows, dependencies, side effects, and debugging/testing guidance without reverse-engineering the backend service tree first.

## Goal

Create or update `README.md` in each immediate child directory of `src/main/services/`: `codex`, `electron`, `git`, `io`, `kernel`, `logger`, `registry`, `run-events`, `runtime`, and `storage`.

## Decisions / Assumptions

- A service folder means each immediate child directory of `src/main/services/`; nested directories do not need their own README for this ticket unless they are already part of a target README's architecture description.
- README files should live alongside each service folder rather than as a single aggregate `src/main/services/README.md`.
- The expected depth is an operational guide, not exhaustive API documentation or a forward-looking architecture proposal.
- Documentation should use current source as the source of truth and should not introduce TODO-style product decisions.

## Requirements

- Create or update `README.md` in each immediate child directory of `src/main/services/`: `codex`, `electron`, `git`, `io`, `kernel`, `logger`, `registry`, `run-events`, `runtime`, and `storage`.
- Each README must be a concise but detailed operational guide with these sections where applicable: Purpose, Architecture/Design, Interface/Key Exports, Workflow/Data Flow, Dependencies/Side Effects, and Testing/Debugging Notes.
- Base the documentation on actual current source behavior, naming key files, exported services/layers/functions, important data flow, and operational caveats; avoid generic boilerplate.
- For `src/main/services/electron`, document the folder honestly according to current contents; if it remains empty/reserved, state that current role and do not invent behavior.
- Do not change runtime TypeScript behavior, package configuration, generated data, or tests as part of this documentation-only task.

## Acceptance Criteria

- All 10 immediate child directories under `src/main/services/` contain a `README.md`.
- Each README clearly names the service purpose, key files/exports, architecture/design, workflow/data flow, dependencies/side effects, and testing/debugging notes, with depth proportional to service complexity.
- Documentation reflects current source behavior and does not claim unsupported behavior for empty or reserved folders.
- No runtime TypeScript behavior or package configuration is changed.
- Validation commands pass, or any unrelated pre-existing failure is documented in the implementation PR notes.

## Test Plan

- Run `find src/main/services -mindepth 2 -maxdepth 2 -name README.md | sort` and confirm it lists exactly the 10 target README paths.
- Run `rg -n "^(#|##)" src/main/services/*/README.md` and confirm each README includes the agreed operational sections or an intentional shorter equivalent for empty/reserved folders.
- Run `rg -n "TODO|TBD|placeholder|coming soon" src/main/services/*/README.md` and remove speculative placeholder language unless it documents an actual current reserved state.
- Run `npm run typecheck` as a regression check that the docs-only change did not disturb the repo state.

## Implementation Notes

- Codebase finding: `src/main/services/` currently has 10 immediate child service folders requiring coverage: `codex`, `electron`, `git`, `io`, `kernel`, `logger`, `registry`, `run-events`, `runtime`, and `storage`; prior bounded research found no existing service README files under these folders.
- Codebase finding: `src/main/services/kernel/index.ts:12-17` re-exports kernel modules; `src/main/services/kernel/index.ts:19-33` composes `BackendKernelBaseLive` and `BackendKernelLive` from ledger, idempotency, audit, worker registry, supervisor, run registry, and workflow engine layers.
- Codebase finding: `src/main/services/io/index.ts:8-12` re-exports filesystem, HTTP, path, process, and socket boundaries; `src/main/services/io/index.ts:14` composes them into `IoLive`.
- Codebase finding: `src/main/services/storage/index.ts:22-30` shows filesystem-backed storage exports and adapter wiring; `src/main/services/storage/index.ts:36-80` defines `StorageService` for project config, board/ticket CRUD, drafts, queueing, clarification questions, attachments, status transitions, deletion, and duplication.
- Codebase finding: `src/main/services/codex/index.ts:64-78` imports kernel, run-events, storage, CLI/status/research helpers, and shared schemas, making this service the bridge between ticket/draft workflows and Codex SDK execution; `package.json` exposes `npm run typecheck` and `npm test`.
- Implementation: Add `src/main/services/codex/README.md` covering Codex SDK orchestration, ticket draft/update/run entry points, storage/kernel/run-event interactions, preflight/status/research helpers, and debugging/logging guidance.
- Implementation: Add `README.md` files for `kernel`, `storage`, `io`, `runtime`, and `run-events` that explain their Effect services/layers, primary files, lifecycle/data flow, persistence or process side effects, and focused test/debug guidance.
- Implementation: Add `README.md` files for `git`, `logger`, `registry`, and `electron` that document each folder's ownership, exported interfaces/functions, external dependencies such as git commands or Electron userData paths, and operational caveats.
- Implementation: Use consistent section headings across all service READMEs while allowing shorter content for smaller services and deeper content for broad services like `codex`, `kernel`, and `storage`.
- Implementation: After adding docs, verify that the 10 target service folders contain README files and that documented file/symbol references match committed source.
- Prior bounded research stopped after scanning 90 candidate files and reading representative service entry points; implementation should use the listed directory inventory and source references as the baseline, then only verify references while editing docs.
- The `electron` service folder appeared in the directory inventory, but no TypeScript files were listed within the bounded `find` output; document it as empty/reserved if that remains true at edit time.
- No Codex implementation run has been started for this ticket.

## Codex Handoff

No Codex run has been started.
