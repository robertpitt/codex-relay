---
schemaVersion: 1
id: tkt_01krp4z2fr3jagyj5xv5dkz93q
title: Update README intro and quick start for developer conversion
ticketType: task
status: completed
position: 76000
priority: medium
effort: medium
labels:
  - documentation
  - developer-experience
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-15T15:44:30.712Z'
updatedAt: '2026-05-15T15:49:36.352Z'
authoringState: ready
codexThreadId: 019e2c52-e78b-7533-94a8-a096eda15b83
runStatus: completed
lastRunId: run_01krp55rxgs9a980032vft9v05
lastRunStartedAt: '2026-05-15T15:48:10.897Z'
---
# Update README intro and quick start for developer conversion

## Context

Improve the top of the README so developers landing from GitHub immediately understand what Relay is, that setup is lightweight, and how quickly they can run it locally. The goal is developer conversion: reduce perceived setup complexity, not add marketing copy or change application behavior.

## Goal

Rewrite the README opening and Quick Start to foreground a fast local trial: after cloning, developers should see at most two setup/run commands, `npm install` and `npm run dev`.

## Decisions / Assumptions

- The repository is already cloned when evaluating the two-command setup promise; clone/cd may remain in prose but should not compete visually with the install/run commands.
- No new script such as `npm start` or combined install/dev script should be added for this ticket; this is documentation-only.
- The intended audience is developers browsing GitHub who may abandon if setup looks complex.
- README.md is the only file expected to change.

## Requirements

- Rewrite the README opening and Quick Start to foreground a fast local trial: after cloning, developers should see at most two setup/run commands, `npm install` and `npm run dev`.
- Keep the README technically accurate: Node.js 18+, npm/package-lock workflow, optional Codex CLI/auth for agent-backed drafting/execution only, and no database/container/.env requirement.
- Move or reframe Codex setup so it reads as an optional enhancement after the first-run path, not a prerequisite for trying Relay manually.
- Preserve existing useful sections and screenshots; avoid broad README restructuring outside the intro, Quick Start, and nearby prerequisite/first-project wording needed for flow.
- Use clear developer-facing language focused on immediacy and confidence, not sales-heavy marketing copy.

## Acceptance Criteria

- The README top section makes the easy setup path obvious before optional Codex setup details.
- The Quick Start visible command block for running an already cloned repo contains only `npm install` and `npm run dev`.
- The README still states Codex CLI/auth is required only for agent-backed drafting/execution, not for manual board and ticket management.
- No inaccurate commands are introduced; commands match package.json scripts.
- The existing screenshots and later reference sections remain intact unless lightly reworded for consistency.

## Test Plan

- Run `npm run typecheck` to ensure no incidental repository breakage if docs tooling or metadata is touched.
- Preview README.md locally or via Markdown renderer to verify the top section reads correctly, code fences render, and the Showcase images remain referenced as `assets/front.png`, `assets/front-2.png`, and `assets/ticket.png`.
- Manually verify the Quick Start contains no more than two setup/run commands after clone/cd context and that Codex setup is clearly optional.

## Implementation Notes

- Codebase finding: README.md:1-5 currently opens with a factual product description and Codex caveat before showing setup; it does not explicitly lead with quick local setup or low-friction trial value.
- Codebase finding: README.md:7-14 has Quick Start with four separate commands: clone, cd, npm install, npm run dev. The clarified goal asks for a two-command maximum feel at the top of the README.
- Codebase finding: README.md:16-21 currently places Codex verification directly after Quick Start, which can make the first-run path feel conditional or more complex even though manual board/ticket management works without Codex.
- Codebase finding: README.md:31-38 already documents prerequisites and explicitly says no database, container stack, hosted issue tracker, or .env file is required; reuse this message near the top rather than inventing new claims.
- Codebase finding: package.json:9-20 confirms the setup commands are npm-based: npm install, npm run dev, npm test, npm run typecheck, and npm run build. There is no lint or format script.
- Implementation: Edit README.md lines 1-21 to make the first viewport communicate: Relay is a local-first desktop kanban for software work, data stays in project-local `.relay/`, and a local trial is `npm install` then `npm run dev` after cloning.
- Implementation: Change the Quick Start code block to assume the reader is already in the cloned repo or combine clone/cd as surrounding prose, so the visible setup/run commands remain limited to `npm install` and `npm run dev`.
- Implementation: Rewrite the Codex note after Quick Start as an optional section/sentence for agent-backed drafting and execution, keeping `codex --version` and `codex login` visible but clearly secondary.
- Implementation: Tighten README.md lines 31-50 so prerequisites and First Project reinforce the low-friction path without duplicating the new intro; retain Node/npm/Git/Codex accuracy.
- Implementation: Do a final pass on README.md for command accuracy against package.json and for Markdown rendering of headings, code fences, links, and images.
- Initial bounded research matched unrelated `readMetadata` symbols in `src/services/git/*`; direct README/package.json inspection was needed for the actual docs scope.
- `rg` was unavailable in the local shell during drafting, so numbered file reads used `nl` and `sed` instead.
- No blocking clarification remains after the user clarified that 'developer conversation' means developer conversion from GitHub clone/try-out intent.

## Codex Handoff

### 5/15/2026, 4:49:14 PM

Implemented the README-only update.

**Summary of changes made**
- Rewrote the README opening to foreground Relay as a low-friction local-first kanban app.
- Changed Quick Start so the visible setup/run block contains only:
  ```sh
  npm install
  npm run dev
  ```
- Reframed Codex setup as optional and only required for agent-backed drafting/execution.
- Lightly tightened prerequisites and first-project wording.
- Preserved existing screenshot references: `assets/front.png`, `assets/front-2.png`, `assets/ticket.png`.

**Files changed**
- `README.md`

**Commands run**
- `sed -n '1,120p' README.md`
- `sed -n '1,80p' package.json`
- `git status --short`
- `sed -n '120,240p' README.md`
- `git diff -- README.md`
- `grep -nE ... README.md`
- `npm run typecheck`
- `git diff --stat -- README.md`
- `git status --short README.md`
- `awk '/^```/{count++} END {print count}' README.md`

Note: `rg` was attempted first but is not installed in this shell, so I used `grep`.

**Tests run and results**
- `npm run typecheck`: passed.
- Manual README checks: Quick Start has only the two required commands; Codex setup is optional; screenshot references remain intact; fenced code block count is balanced.

**Subagent usage**
- none used

**Remaining risks or follow-up work**
- I did not launch a graphical Markdown previewer; verification was done by reading the rendered Markdown source structure and checking links/code fences from the file.


No Codex run has been started.
