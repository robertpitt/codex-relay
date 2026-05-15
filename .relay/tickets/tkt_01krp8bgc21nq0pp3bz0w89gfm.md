---
schemaVersion: 1
id: tkt_01krp8bgc21nq0pp3bz0w89gfm
title: Update README Layout for Scannability
ticketType: task
status: todo
position: 24000
priority: medium
effort: medium
labels:
  - documentation
  - readme
  - developer-experience
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-15T16:43:43.874Z'
updatedAt: '2026-05-15T16:44:47.177Z'
authoringState: reviewing
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krp8bg9twzgrhw33hxbj6j6f
lastRunStartedAt: null
---
# Update README Layout for Scannability

## Context

Improve the repository README layout so developers and coding agents can scan it more quickly, without doing another broad README rewrite. This is a focused documentation task: preserve the existing technical content, project positioning, setup commands, and warnings unless small wording changes are needed to make the layout coherent.

## Goal

Edit only the repository `README.md` unless a broken local image/link discovered during validation requires a minimal adjacent asset path correction.

## Decisions / Assumptions

- The repository README is located at the project root as `README.md`.
- The desired outcome is improved Markdown layout and scanability, not new product positioning or new onboarding content.
- Existing README technical content is considered authoritative unless visibly duplicated, stale in formatting, or awkwardly placed.
- A manual rendered Markdown review is acceptable validation if no Markdown lint or link-check tooling exists in the repo.

## Requirements

- Edit only the repository `README.md` unless a broken local image/link discovered during validation requires a minimal adjacent asset path correction.
- Improve layout and scannability using Markdown structure: clear heading hierarchy, concise section ordering, readable spacing, lists/tables where they reduce scanning effort, and consistent command block formatting.
- Preserve existing technical meaning, setup flow, command names, project positioning, caveats, and links; make only small wording adjustments needed to support the improved layout.
- Avoid duplicating work from prior broad README cleanup tickets: do not introduce a new product narrative, new installation requirements, or large rewritten sections unless the same content is simply being reorganized.
- Keep Markdown render-friendly on GitHub: no deeply nested lists, no broken heading jumps, no decorative layout tricks that reduce readability in plain text.

## Acceptance Criteria

- `README.md` is easier to scan at a glance, with a clear heading hierarchy and consistently formatted sections.
- Existing setup, development, test, and project context information remains present and technically unchanged.
- Commands, links, images, and code fences still render correctly in Markdown preview.
- The diff is limited to README layout/scannability refinements and any directly necessary README-local fixes.
- No application source files are modified.

## Test Plan

- Run `markdownlint README.md` if available in the repo/tooling; if unavailable, note that limitation in the implementation summary.
- Run a link check if the repo has one configured; otherwise manually click or inspect README links for obvious broken relative paths.
- Render or preview `README.md` in a Markdown/GitHub-style preview and verify heading hierarchy, spacing, lists, images, and command blocks read correctly.
- Run `git diff -- README.md` and confirm the diff is layout/scannability-focused rather than a broad rewrite.

## Implementation Notes

- Codebase finding: Related completed README tickets already covered broad README improvements: `Improve the project README`, `Clean Up Project README`, `Improve README for concise developer onboarding`, `Clean Up Repository README`, and `Update README intro and quick start for developer conversion`; this ticket should avoid re-deciding project messaging or setup content.
- Codebase finding: An open related task already exists: `tkt_01krp7q90j7610hnpnekdraxbr` / `Clean Up README for Scannability`, so this ticket should stay narrow and focus on layout-only refinements rather than a full content refresh.
- Codebase finding: Bounded scan matched README-related code service references in `src/services/git/Git.ts` (`readMetadata` symbol, match around line 27 and implementation around line 126) and `src/services/git/index.ts` (`readMetadata` wrapper around lines 19 and 41), but these are not expected to be touched for a README layout-only change.
- Codebase finding: Bounded scan matched `layout` in `src/renderer/src/App.tsx` around `TicketReferenceMenuLayout` / `TicketReferenceMenuLayoutInput` near lines 156-161; this is unrelated application UI code and should not be modified for this documentation task.
- Codebase finding: The bounded research did not inspect the current `README.md` contents directly; the implementation is still ready because the change target is explicitly limited to `README.md`, but the implementation notes call out that the first edit step must open the current README and preserve its content rather than starting from prior assumptions.
- Implementation: Open `README.md` and identify the existing major sections before editing so the current content can be reorganized without losing technical details.
- Implementation: Restructure the README in place for faster scanning: keep the top-level project introduction first, group setup/run/test commands into clearly labeled sections, and move secondary context below the primary onboarding path.
- Implementation: Normalize Markdown formatting across the file: consistent heading levels, blank lines around headings and code fences, consistent bullet style, and language tags on shell/code blocks where appropriate.
- Implementation: Tighten only layout-adjacent wording where necessary, such as shortening repeated lead-in sentences or replacing dense paragraphs with bullets while preserving the same facts.
- Implementation: Validate the rendered README manually after editing, checking headings, internal/external links, images, and command blocks for readability and correctness.
- Research was bounded and did not read `README.md`; the implementer must base edits on the current file contents and preserve content rather than applying a generic README template.
- Do not modify `src/services/git/Git.ts`, `src/services/git/index.ts`, or `src/renderer/src/App.tsx`; they appeared only because of broad search-term matches.
- Coordinate with or deduplicate against open ticket `tkt_01krp7q90j7610hnpnekdraxbr` if both are scheduled, since both concern README scannability/layout.

## Codex Handoff

No Codex run has been started.
