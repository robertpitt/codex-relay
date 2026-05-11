---
schemaVersion: 1
id: tkt_01kra7cjw3bxwy0bc0vk6vsh12
title: Improve frontend Markdown rendering and copy support
status: completed
position: 6000
priority: medium
labels:
  - frontend
  - markdown
  - ux
  - security
createdAt: '2026-05-11T00:35:57.443Z'
updatedAt: '2026-05-11T00:45:58.461Z'
codexThreadId: 019e1476-7493-7383-b376-bd036a36cf0b
runStatus: completed
lastRunId: run_01kra7cx1r7m5fjk69an2dceyd
---
# Improve frontend Markdown rendering and copy support

## Context

Improve Markdown handling across Relay’s frontend so Markdown content is rendered consistently for reading while remaining easy to copy as Markdown source. The work should cover user-visible frontend surfaces where Markdown-like content is displayed, without changing stored content formats unless explicitly required.

## Requirements

- Audit frontend locations that display user-generated or system-generated Markdown/plain text content and identify inconsistent rendering or copy behavior.
- Introduce or standardize a shared Markdown rendering path/component for frontend Markdown content.
- Support common Markdown features including paragraphs, headings, emphasis, links, ordered/unordered lists, blockquotes, inline code, fenced code blocks, and tables if the existing product context needs them.
- Ensure rendered Markdown is sanitized so unsafe HTML/scripts cannot execute.
- Add copy affordances where Markdown content is presented, with copy behavior preserving the original Markdown source rather than copying rendered HTML.
- Ensure code blocks remain separately copyable as code content where code block UI already exists or is introduced.
- Preserve existing data contracts and API payloads unless a schema change is explicitly approved.
- Add tests for rendering behavior, sanitization, and Markdown-source copy behavior.

## Acceptance Criteria

- Markdown content renders consistently across audited frontend locations using the shared renderer or shared rendering rules.
- Copying a rendered Markdown block copies Markdown source text with formatting syntax preserved.
- Copying a fenced code block copies only the code block contents, excluding fences and UI labels.
- Unsafe Markdown/HTML input does not execute scripts or inject unsafe attributes into the DOM.
- Existing non-Markdown/plain-text content remains readable and does not regress visually.
- Automated tests cover representative Markdown syntax, copy behavior, and sanitization.
- The implementation includes a short note or code comment documenting which frontend surfaces were audited and updated.

## Clarification Questions

- Which frontend surfaces are highest priority for Markdown rendering, for example chat/messages, notes, comments, descriptions, or generated outputs?
- Should raw inline HTML in Markdown be supported, stripped, or escaped everywhere?
- Should the copy affordance appear on every Markdown block, only generated responses, or only on hover/context actions?

## Implementation Notes

- Start by searching the frontend for existing Markdown rendering, rich text, message body, description, comment, and copy-to-clipboard implementations.
- Prefer consolidating behavior behind a reusable Markdown renderer/copy component instead of fixing each screen independently.
- If the project already has a Markdown parser/sanitizer dependency, use it consistently; otherwise evaluate a CommonMark-compatible renderer plus an explicit sanitizer.
- Keep styling aligned with existing typography, spacing, and code block conventions rather than introducing a new visual system.
- Avoid persisting rendered HTML; render from source Markdown at the frontend boundary.

## Codex Handoff

### 5/11/2026, 1:45:58 AM

**Summary**
Implemented a shared sanitized Markdown renderer with source-copy and code-block-copy affordances. It now renders create-ticket draft previews, ticket detail previews, clarification text, and generated Codex completion/final-response console events. Stored Markdown/API payloads are unchanged.

**Files Changed**
- [MarkdownBlock.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/components/MarkdownBlock.tsx:1)
- [App.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/App.tsx:112)
- [ClarificationPanel.tsx](/Users/robertpitt/Projects/relay/src/renderer/src/components/ClarificationPanel.tsx:40)
- [styles.css](/Users/robertpitt/Projects/relay/src/renderer/src/styles.css:849)
- [markdown-block.test.tsx](/Users/robertpitt/Projects/relay/tests/markdown-block.test.tsx:34)
- [run-tests.mjs](/Users/robertpitt/Projects/relay/tests/run-tests.mjs:11)

**Commands Run**
- Inspection: `find`, `grep`, `sed`, `nl`, `git status --short`
- Verification: `npm test`, `npm run typecheck`, `npm run build`

**Tests Run**
- `npm test`: passed, 12/12 tests
- `npm run typecheck`: passed
- `npm run build`: passed

**Remaining Risks**
The renderer is intentionally lightweight because the project had no Markdown parser/sanitizer dependency installed. It covers the requested common syntax and sanitization path, but it is not a full CommonMark implementation for deeper edge cases like complex nested lists.


No Codex run has been started.
