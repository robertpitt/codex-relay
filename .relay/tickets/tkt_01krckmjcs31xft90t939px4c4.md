---
schemaVersion: 1
id: tkt_01krckmjcs31xft90t939px4c4
title: Pass local Markdown image references to Codex SDK input
ticketType: task
status: todo
position: 14000
priority: medium
labels:
  - codex
  - sdk
  - attachments
  - feature
parentEpicId: tkt_01krcka112x6zmxsz6416d6hrj
subticketIds: []
blockedByIds: []
createdAt: '2026-05-11T22:48:30.873Z'
updatedAt: '2026-05-11T22:48:30.873Z'
codexThreadId: null
runStatus: idle
lastRunId: null
---
# Pass local Markdown image references to Codex SDK input

## Parent Epic

Codex SDK integration improvement epic

## Context

The SDK supports structured local image inputs, but Relay sends ticket execution prompts as plain strings. Relay already creates an attachments directory, so tickets that reference local screenshots can be made visible to Codex without adding a new upload UI.

## Codebase Findings

- `node_modules/@openai/codex-sdk/README.md:86-95` documents `thread.run([{ type: "text", ... }, { type: "local_image", path }])`.
- `node_modules/@openai/codex-sdk/dist/index.d.ts:187-195` defines SDK input as either a string or an array of text/local_image entries.
- `node_modules/@openai/codex-sdk/dist/index.js:217-220` converts image entries to CLI `--image` arguments.
- `src/main/services/codex/index.ts:1390-1411` builds the implementation-run prompt as a plain string.
- `src/main/services/codex/index.ts:1629` currently calls `thread.runStreamed(prompt, { signal })`, so no image entries are ever passed.
- `src/main/services/storage/index.ts:164-168` creates `.relay/attachments`, but search found no other attachment handling besides `src/main/services/storage/paths.ts:11`.

## Requirements

- Detect local Markdown image references in ticket markdown during implementation-run prompt construction.
- Support standard Markdown image syntax `![alt](path)` for relative project paths and `.relay/attachments` paths; ignore remote URLs, data URLs, fragments-only links, and paths that resolve outside the project root.
- Pass structured SDK input only when at least one valid local image is found; otherwise preserve the existing string prompt behavior.
- Deduplicate image paths while preserving first-seen order.
- Do not add a new UI or file upload workflow in this subticket.

## Implementation Plan

- Import the SDK `Input` or `UserInput` type in `src/main/services/codex/index.ts` and widen `CodexRunThread.runStreamed` mocks/types to accept SDK input, not only `string`.
- Add a helper near `buildExecutionPrompt()` that extracts local Markdown image paths from ticket markdown, resolves them against `projectPath`, rejects paths outside the project, and returns absolute image paths.
- Add `buildExecutionInput(projectPath, ticketMarkdown, clarifications)` that returns the existing prompt string when no images are found, or an SDK input array with one text entry followed by local_image entries.
- Update `beginRunPromise()` to call `buildExecutionInput(projectPath, ticket.markdown, clarifications)` and pass the result to `thread.runStreamed()`.
- Keep ticket draft and ticket update prompts unchanged in this subticket.
- Add tests using mocked `runStreamed()` inputs to verify image extraction, path scoping, deduplication, and plain-string fallback.

## Test Plan

- Add backend tests in `tests/backend.test.ts` asserting a ticket with `![screenshot](.relay/attachments/ui.png)` causes mocked `runStreamed()` to receive an input array containing the prompt text and a `local_image` item.
- Add backend tests asserting remote image URLs and `../outside.png` are ignored and no out-of-project path is passed.
- Add a backend test asserting tickets without local images still pass a string prompt, preserving existing mocked client compatibility where possible.
- Run `npm test` and `npm run typecheck`.

## Acceptance Criteria

- Implementation runs include valid local ticket image references as SDK `local_image` entries.
- Remote, data, fragment, and out-of-project image references are ignored.
- Existing tickets with no image references execute through the same plain string prompt path as today.
- Image handling is covered by focused backend tests and does not require real Codex execution.

## Assumptions / Open Questions

- Markdown image references are enough for the first iteration because Relay has no attachment upload UI today.
- Only implementation runs should receive image inputs; ticket drafting and ticket update remain text-only for now.

## Implementation Notes

- Use structured path resolution rather than string prefix checks; resolve and compare against the resolved project root to enforce scoping.

## Codex Handoff

No Codex run has been started.
