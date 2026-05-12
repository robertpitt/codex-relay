---
schemaVersion: 1
id: tkt_01krf4dc76d5ff5b7v3feawnpc
title: Improve README for concise developer onboarding
ticketType: task
status: completed
position: 63000
priority: low
effort: medium
labels:
  - documentation
  - readme
  - developer-experience
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T22:20:09.830Z'
updatedAt: '2026-05-12T22:23:46.532Z'
codexThreadId: 019e1e47-fcf5-7a73-b5ee-033459018c2f
runStatus: completed
lastRunId: run_01krf4fyp3bkgg008x6nhmc5ye
lastRunStartedAt: '2026-05-12T22:21:34.593Z'
---
# Improve README for concise developer onboarding

## Context

Refresh the repository README so developers can quickly understand that Relay is a Codex-dependent working prototype and get to a local dev session with minimal friction. This is a focused documentation-only task; preserve accurate existing technical content while making the opening more attractive and less verbose.

## Goal

Update `README.md` to open with a concise prototype/Codex notice before longer project explanation.

## Decisions / Assumptions

- Use low priority because the work is documentation-only and overlaps an existing low-priority README onboarding ticket.
- Keep the README concise rather than adding a full product narrative or PRD-style documentation.
- Use the repository's existing package manager and scripts as the source of truth for setup commands.
- If existing showcase images are already in the README from prior tickets, keep them unless they make the opening feel too heavy.

## Requirements

- Update `README.md` to open with a concise prototype/Codex notice before longer project explanation.
- Add a clearly visible three-step quick start section using `Clone`, `Install`, and `Dev` steps so a developer can experiment quickly.
- Make the README more approachable and visually scannable for developers by tightening dense copy, using short sections, and preserving only high-value onboarding details.
- Preserve existing accurate technical content, links, screenshots/showcase assets, and commands unless they are outdated or duplicated.
- Do not modify runtime application code, tests, package scripts, or generated assets as part of this ticket.

## Acceptance Criteria

- `README.md` starts with a clear notice that Relay is a working prototype and requires Codex.
- A developer can see the quick start path near the top with exactly three labeled steps: `Clone`, `Install`, and `Dev`.
- The README reads shorter and more approachable than before without removing essential accurate setup or project context.
- All documented commands are valid for the current repository scripts/package manager.
- No application behavior or source code is changed.

## Test Plan

- Read `package.json` and verify the README quick-start commands exactly match available install/dev workflow assumptions, especially the dev script name.
- Render or preview `README.md` as Markdown and check heading hierarchy, code fences, links, and image references.
- Run a documentation-only diff check such as `git diff -- README.md package.json` and confirm only `README.md` changed unless a README command correction explicitly required otherwise.
- Optionally run `npm run dev` or the documented dev command long enough to confirm it starts, then stop it; record if skipped.

## Implementation Notes

- Codebase finding: Bounded research did not inspect the current README directly; it only matched README draft/ticket plumbing in `tests/ticket-draft.test.ts`, `src/main/ipc/methods/tickets.ts`, and `src/main/services/storage/index.ts`.
- Codebase finding: Intake identified prior completed README cleanup tickets and one overlapping open Todo ticket: `tkt_01krebs5x4av65p7pns4fw58jy` (`Clean up README for concise onboarding`), so this work should either replace or be reconciled with that ticket before implementation.
- Codebase finding: Known product decision from intake: the README must begin with a notice that Relay is a working prototype and requires Codex.
- Codebase finding: Known product decision from intake: the README must include a simple three-step setup path named `Clone`, `Install`, and `Dev`.
- Codebase finding: Known scope decision from intake: this is documentation-only and must not change application source behavior.
- Implementation: Edit `README.md` so the first content after the title is a short notice that Relay is a working prototype requiring Codex.
- Implementation: Restructure the setup area into a compact three-step quick start: `Clone`, `Install`, and `Dev`, using the repository's actual package-manager commands from `package.json`.
- Implementation: Trim or consolidate verbose README sections while keeping essential information about what Relay does, local development, project structure, and any existing showcase/assets sections.
- Implementation: Ensure Markdown headings, lists, code fences, and relative image links render cleanly and keep the README skimmable.
- Implementation: Coordinate with or supersede the open Todo ticket `tkt_01krebs5x4av65p7pns4fw58jy` to avoid duplicate README cleanup work.
- Research was incomplete for `README.md` and `package.json` due to the bounded context provided; implementation should use those files directly as the source of truth before editing, but the required product decisions are already resolved.
- Because there is an existing open Todo ticket for concise README onboarding, project maintainers may choose to merge this ticket into that one rather than track both.

## Codex Handoff

### 5/12/2026, 11:23:34 PM

Implemented the README onboarding refresh.

**Summary**
- Added a top notice that Relay is a working prototype and requires Codex for agent-backed flows.
- Added a near-top three-step Quick Start with exactly `Clone`, `Install`, and `Dev`.
- Tightened dense sections while preserving setup commands, screenshots, local data details, Codex auth notes, command reference, distribution info, troubleshooting, and workflow guidance.
- Confirmed only `README.md` changed among `README.md` and `package.json`.

**Files Changed**
- [README.md](/Users/robertpitt/Projects/relay/README.md)

**Commands Run**
- Read `README.md` and `package.json`
- Checked existing worktree status
- Verified image paths under `assets/`
- Verified documented npm scripts from `package.json`
- Ran Markdown structure/code fence checks with `grep`, `awk`, and `git diff --check`
- Ran scoped diffs: `git diff -- README.md package.json`, `git diff --name-only -- README.md package.json`, `git diff --stat -- README.md`

`rg` was unavailable in this shell, so I used standard shell tools instead.

**Tests Run**
- `git diff --check -- README.md` passed.
- Verified Quick Start headings are exactly `Clone`, `Install`, and `Dev`.
- Verified referenced showcase images exist.
- Verified documented npm scripts exist in `package.json`.
- Did not run `npm run dev`; this was documentation-only and launching Electron was optional.

**Subagent Usage**
- none used

**Remaining Risks / Follow-up**
- Existing unrelated worktree changes were present before this task; I did not touch them.
- The clone command uses `<repo-url>` because the local checkout does not encode a single README-safe public URL.


No Codex run has been started.
