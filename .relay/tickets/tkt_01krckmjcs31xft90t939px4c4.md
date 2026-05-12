---
schemaVersion: 1
id: tkt_01krckmjcs31xft90t939px4c4
title: >-
  Pass local Markdown image references and drag-and-drop uploads to Codex SDK
  input
ticketType: task
status: review
position: 1000
priority: medium
labels:
  - codex
  - sdk
  - attachments
  - feature
  - ui
parentEpicId: tkt_01krcka112x6zmxsz6416d6hrj
subticketIds: []
blockedByIds: []
createdAt: '2026-05-11T22:48:30.873Z'
updatedAt: '2026-05-12T00:09:59.474Z'
codexThreadId: 019e1970-9b2e-7c73-96c7-5d42b125f148
runStatus: completed
lastRunId: run_01krcqq9gb3msw35dvef892pbv
lastRunStartedAt: '2026-05-11T23:59:54.651Z'
---
# Pass local Markdown image references and drag-and-drop uploads to Codex SDK input

## Parent Epic

Codex SDK integration improvement epic

## Context

The SDK supports structured local image inputs, but Relay sends ticket execution prompts as plain strings. Relay already creates an attachments directory, so tickets that reference local screenshots can be made visible to Codex. This ticket should also add a lightweight drag-and-drop image upload path so users can drop screenshots into the ticket markdown editor, have Relay store them under the project attachment directory, and insert Markdown image references that implementation runs can pass to Codex as local images.

## Codebase Findings

- `node_modules/@openai/codex-sdk/README.md:86-95` documents `thread.run([{ type: "text", ... }, { type: "local_image", path }])`.
- `node_modules/@openai/codex-sdk/dist/index.d.ts:187-195` defines SDK input as either a string or an array of text/local_image entries.
- `node_modules/@openai/codex-sdk/dist/index.js:217-220` converts image entries to CLI `--image` arguments.
- `src/main/services/codex/index.ts:1390-1411` builds the implementation-run prompt as a plain string.
- `src/main/services/codex/index.ts:1629` currently calls `thread.runStreamed(prompt, { signal })`, so no image entries are ever passed.
- `src/main/services/storage/index.ts:164-168` creates `.relay/attachments`, but search found no other attachment handling besides `src/main/services/storage/paths.ts:11`.
- Drag-and-drop support will need to hook into the existing ticket markdown editing surface and use an IPC/main-process write path so dropped image files are copied into `.relay/attachments` safely before Markdown is inserted.

## Requirements

- Detect local Markdown image references in ticket markdown during implementation-run prompt construction.
- Support standard Markdown image syntax `![alt](path)` for relative project paths and `.relay/attachments` paths; ignore remote URLs, data URLs, fragments-only links, and paths that resolve outside the project root.
- Add drag-and-drop image upload support to the ticket markdown editing experience.
- When one or more image files are dropped into the ticket markdown editor, copy them into the current project’s `.relay/attachments` directory and insert Markdown image references at the drop/cursor location.
- Restrict drag-and-drop upload handling to image MIME types or known image extensions; reject unsupported files without modifying the ticket markdown.
- Generate collision-resistant attachment filenames while preserving useful extensions.
- Use project-relative Markdown paths for inserted attachment references, preferably `.relay/attachments/<filename>`.
- Pass structured SDK input only when at least one valid local image is found; otherwise preserve the existing string prompt behavior.
- Deduplicate image paths while preserving first-seen order.
- Keep ticket draft and ticket update prompts unchanged in this subticket.

## Implementation Plan

- Import the SDK `Input` or `UserInput` type in `src/main/services/codex/index.ts` and widen `CodexRunThread.runStreamed` mocks/types to accept SDK input, not only `string`.
- Add a helper near `buildExecutionPrompt()` that extracts local Markdown image paths from ticket markdown, resolves them against `projectPath`, rejects paths outside the project, and returns absolute image paths.
- Add `buildExecutionInput(projectPath, ticketMarkdown, clarifications)` that returns the existing prompt string when no images are found, or an SDK input array with one text entry followed by local_image entries.
- Update `beginRunPromise()` to call `buildExecutionInput(projectPath, ticket.markdown, clarifications)` and pass the result to `thread.runStreamed()`.
- Add a main-process attachment save API that accepts dropped image metadata/content, writes into `.relay/attachments`, and returns the project-relative Markdown path.
- Wire the ticket markdown editor drag-and-drop flow to call the attachment save API and insert one `![filename](.relay/attachments/<filename>)` reference per saved image.
- Keep the upload interaction scoped to the existing editor; do not add a separate attachment management UI in this subticket.
- Add tests using mocked `runStreamed()` inputs to verify image extraction, path scoping, deduplication, and plain-string fallback.
- Add focused tests for attachment filename generation/path scoping and, where practical, renderer/editor drop handling.

## Test Plan

- Add backend tests in `tests/backend.test.ts` asserting a ticket with `![screenshot](.relay/attachments/ui.png)` causes mocked `runStreamed()` to receive an input array containing the prompt text and a `local_image` item.
- Add backend tests asserting remote image URLs and `../outside.png` are ignored and no out-of-project path is passed.
- Add a backend test asserting tickets without local images still pass a string prompt, preserving existing mocked client compatibility where possible.
- Add tests for saving dropped image files into `.relay/attachments` with collision-resistant filenames and project-relative Markdown paths.
- Add a renderer/editor test, if the existing test setup supports it, asserting dropped image files insert Markdown image references into the ticket body.
- Run `npm test` and `npm run typecheck`.

## Acceptance Criteria

- Users can drag and drop supported image files into the ticket markdown editor.
- Dropped images are copied into the project’s `.relay/attachments` directory and inserted into the ticket markdown as local Markdown image references.
- Implementation runs include valid local ticket image references as SDK `local_image` entries.
- Remote, data, fragment, unsupported-file, and out-of-project image references are ignored or rejected safely.
- Existing tickets with no image references execute through the same plain string prompt path as today.
- Image upload and SDK input handling are covered by focused tests and do not require real Codex execution.

## Assumptions / Open Questions

- Drag-and-drop insertion into the existing ticket markdown editor is enough for this iteration; no gallery, delete UI, preview UI, or standalone attachment manager is required.
- Only implementation runs should receive image inputs; ticket drafting and ticket update remain text-only for now.
- Clipboard paste upload support is out of scope unless it is already handled by the same editor drop pipeline with minimal extra work.

## Implementation Notes

- Use structured path resolution rather than string prefix checks; resolve and compare against the resolved project root to enforce scoping.
- Keep file writes in the main process or an existing trusted storage layer rather than writing directly from renderer code.
- Sanitize original filenames before using them in attachment paths, and fall back to generated names when needed.

## Codex Handoff

### 5/12/2026, 1:09:59 AM

Implemented the ticket.

**Summary**
- Added local Markdown image extraction for implementation runs, with project-root scoping, remote/data/fragment/outside-path rejection, and first-seen deduping.
- Codex implementation runs now pass SDK structured input only when valid local images exist; otherwise they still pass the original string prompt.
- Added IPC-backed image attachment saving into `.relay/attachments` with image-only validation, sanitized collision-resistant names, and project-relative Markdown paths.
- Added drag-and-drop image support to the ticket Markdown editor, inserting `![filename](.relay/attachments/...)` references at the editor selection.
- Added focused backend and renderer-helper tests.

**Files Changed**
- `src/shared/attachments.ts`
- `src/shared/types.ts`
- `src/shared/ipc.ts`
- `src/main/services/codex/index.ts`
- `src/main/services/storage/index.ts`
- `src/main/services/io/filesystem.ts`
- `src/main/services/io/path.ts`
- `src/main/services/schemas.ts`
- `src/main/ipc/methods/tickets.ts`
- `src/preload/index.ts`
- `src/renderer/src/App.tsx`
- `src/renderer/src/lib/attachments.ts`
- `src/renderer/src/styles.css`
- `tests/backend.test.ts`
- `tests/attachment-drop.test.ts`
- `tests/run-tests.mjs`

The worktree already had unrelated dirty files, including `.relay/*`, before I started; I left those alone.

**Commands Run**
- Inspection: `find`, `grep`, `sed`, `git diff --stat`, `git status --short`
- Verification: `npm run typecheck`
- Verification: `npm test`

**Tests**
- `npm run typecheck`: passed
- `npm test`: passed, 109 tests passing
- `npm test` still emits the existing esbuild `import.meta` CJS warning, but the suite passes.

**Remaining Risks**
- Drop insertion uses the textarea selection/cursor location, not pixel-perfect drop-point caret mapping inside the textarea. This matches the ticket’s cursor-location allowance and keeps the implementation lightweight.


No Codex run has been started.
