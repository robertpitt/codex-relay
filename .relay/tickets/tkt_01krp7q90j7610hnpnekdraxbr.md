---
schemaVersion: 1
id: tkt_01krp7q90j7610hnpnekdraxbr
title: Clean Up README for Scannability
ticketType: task
status: todo
position: 22000
priority: low
effort: medium
labels:
  - documentation
  - readme
  - developer-experience
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-15T16:32:40.978Z'
updatedAt: '2026-05-15T16:33:58.595Z'
authoringState: reviewing
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krp7q8ynqkg7rg4e14mdcv13
lastRunStartedAt: null
---
# Clean Up README for Scannability

## Context

Refresh the repository README so it reads cleaner and is easier for developers/coding agents to scan, without repeating the broader README overhaul work already completed in prior documentation tickets. This is a focused copy, structure, and formatting cleanup only; it should not change application behavior or reposition the product.

## Goal

Edit only the repository README unless a broken README reference requires a directly related documentation asset/path fix.

## Decisions / Assumptions

- The current README content is broadly accurate and should be edited for clarity rather than rewritten from scratch.
- No new screenshots, diagrams, or documentation pages are required.
- A documentation-only change does not require running the full application test suite.
- Because bounded research did not inspect `README.md`, the implementation should keep the pass conservative and avoid product decisions not already supported by the README.

## Requirements

- Edit only the repository README unless a broken README reference requires a directly related documentation asset/path fix.
- Preserve existing technical content, setup commands, project positioning, links, and image/assets references unless they are clearly stale, duplicated, or grammatically confusing.
- Improve scannability with clearer headings, tighter paragraphs, consistent list formatting, and removal of obvious repetition.
- Keep the README concise and developer-onboarding oriented; do not add new product-scope sections or large new explanations without an existing README basis.
- Do not modify application code, tests, package metadata, or generated artifacts for this documentation-only cleanup.

## Acceptance Criteria

- `README.md` is easier to scan, with clearer headings, shorter paragraphs, and consistent formatting.
- Existing setup/run/test commands and project positioning remain materially unchanged.
- No unrelated source files or generated files are changed.
- The cleanup does not duplicate broad README overhaul work already completed in related tickets.
- Markdown renders without obvious broken lists, heading jumps, or malformed links introduced by the edit.

## Test Plan

- Run `git diff -- README.md` to verify the change is scoped and preserves commands/links.
- Run `npx prettier --check README.md` if Markdown formatting is covered by the repo toolchain; otherwise manually verify Markdown renders cleanly in a preview.
- If the README contains shell commands that were changed, run only lightweight validation for syntax/path accuracy, such as checking referenced package scripts in `package.json`.

## Implementation Notes

- Codebase finding: Related completed README tickets already covered broad onboarding and structure work: `tkt_01kra3e2wrjsfkx6fb0769vy2w`, `tkt_01krbzznkmnvjvz219fatr4426`, `tkt_01krc8rdcxs4e3ec0t7dmy616s`, `tkt_01krf4dc76d5ff5b7v3feawnpc`, `tkt_01krgh0hjnpp0s93c040nvfw84`, and `tkt_01krp4z2fr3jagyj5xv5dkz93q`; avoid another broad rewrite.
- Codebase finding: Current draft placeholder ticket is `tkt_01krp7q90j7610hnpnekdraxbr` titled `Draft: Update the readme to be cleaner`; this generated plan should replace that placeholder content.
- Codebase finding: Bounded file research did not read `README.md`; searched terms `readme` and `cleaner` across up to 90 files and only found code references to git metadata APIs, not README content.
- Codebase finding: `src/services/git/Git.ts` exposes `GitService.readMetadata(projectPath, options?)` at lines 27 and 126; this match is unrelated to the README cleanup and should not be edited for this ticket.
- Codebase finding: `src/services/git/index.ts` exposes a backend `readMetadata` wrapper at lines 19 and 41; this match is unrelated to the README cleanup and should not be edited for this ticket.
- Implementation: Open `README.md` and make a focused editorial pass that preserves the current section intent while tightening wording and reducing repetition.
- Implementation: Normalize heading hierarchy and list formatting so setup, usage, and project context sections are easy to skim.
- Implementation: Keep existing commands and links intact, changing them only when the current README text itself shows an obvious stale duplicate or typo.
- Implementation: Update the placeholder ticket `tkt_01krp7q90j7610hnpnekdraxbr` with this final plan if the ticketing workflow requires syncing generated draft content.
- Implementation: Run a final diff check limited to README/documentation changes and confirm no source-code files were modified.
- Research was intentionally bounded and did not inspect the README itself, so exact README section names and line numbers are not available in this draft.
- The only inspected code matches for `readme` were git metadata service APIs and are unrelated to this documentation task.
- If the README has changed substantially since the related completed tickets, prioritize preserving its current factual content while improving readability.

## Codex Handoff

No Codex run has been started.
