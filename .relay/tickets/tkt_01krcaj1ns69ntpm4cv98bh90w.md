---
schemaVersion: 1
id: tkt_01krcaj1ns69ntpm4cv98bh90w
title: Update README showcase with three assets images
ticketType: task
status: completed
position: 36000
priority: low
labels:
  - documentation
  - readme
  - assets
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-11T20:09:51.033Z'
updatedAt: '2026-05-11T20:14:26.186Z'
codexThreadId: 019e18a9-a5d3-79a2-bc9d-3c01fef8aea9
runStatus: completed
lastRunId: run_01krcak9amghtkfktd0x4c8bjp
---
# Update README showcase with three assets images

## Context

The README should be updated to include a showcase section that displays the three images located in the project's assets folder. The intent is documentation-only: make the images visible to readers using relative Markdown image references and preserve the existing README structure.

## Research Findings

- Bounded code search was run with terms including `readme`, `show`, `showcase`, `images`, `assets`, and `folder`, but no README or assets files were included in the inspected file set.
- `src/renderer/src/App.tsx` was inspected and contains folder-related UI symbols/imports such as `Folder`, `FolderOpen`, and `FolderPlus`, but it is unrelated to README image rendering.
- `src/main/electron/ElectronShell.ts` exposes `showElectronItemInFolder` and `ElectronShellService.showItemInFolder`, confirming folder-opening behavior exists in the app but not relevant to this documentation task.
- `src/renderer/src/styles.css` contains `.project-folder-row` styles, again folder-related but not directly tied to README/assets documentation.
- Research limitation: search stopped after scanning 160 candidate files, so the exact README path and the exact three asset image filenames still need to be verified before editing.

## Requirements

- Find the project README, likely `README.md` at the repository root.
- Find the assets folder and identify the three image files the user wants showcased.
- Add or update a `Showcase` section in the README that renders all three images using relative paths.
- Use meaningful alt text for each image and, if appropriate, short captions matching the image purpose/content.
- Keep the README formatting consistent with the existing document style.
- Do not change application code or unrelated documentation.

## Implementation Plan

- Inspect the repository root for `README.md` and locate the assets directory containing the three images.
- Confirm the image filenames and relative paths from the README location.
- Choose an appropriate placement for the showcase section, preferably near the top-level project overview or existing screenshots/demo section if one exists.
- Add Markdown image references for the three assets, using stable relative links such as `![Alt text](assets/example.png)`.
- If the existing README uses HTML for image layout, follow that style; otherwise use simple Markdown for broad compatibility.
- Preview or validate the README rendering locally where possible, and check that all three image links resolve.

## Acceptance Criteria

- README contains a clearly labeled showcase section or equivalent existing section update.
- All three images from the assets folder are displayed in the README.
- Image paths are relative and work from the README location.
- Each image has useful alt text.
- No unrelated files or application behavior are changed.

## Clarification Questions

- Which exact three images should be shown if the assets folder contains more than three image files?
- Should the images appear near the top of the README or in an existing screenshots/demo section?

## Implementation Notes

- This is a documentation-only task; no tests are expected unless the repo has README/link validation tooling.
- If the assets folder has exactly three images, use those and no clarification is needed.
- If the README is not at the repository root, calculate image paths relative to the README file actually being edited.

## Research Metadata

- File inspected: src/renderer/src/App.tsx - Matched terms: you, folder; characters read: 12000; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast, LocalAgentProgress, ActiveTicketReferenceMention
- File inspected: tests/create-ticket-mention-layout.test.ts - Matched terms: you; characters read: 1194; symbols: layout
- File inspected: src/main/electron/ElectronShell.ts - Matched terms: show, folder; characters read: 998; symbols: ElectronShellService, ElectronShell, ElectronShellLive, message, showElectronItemInFolder
- File inspected: src/main/electron/ElectronDialog.ts - Matched terms: show; characters read: 1338; symbols: MessageBoxOptions, MessageBoxReturnValue, OpenDialogOptions, OpenDialogReturnValue, ElectronOpenDialogOptions, ElectronOpenDialogResult
- File inspected: src/renderer/src/styles.css - Matched terms: folder; characters read: 12000
- File inspected: .effect/packages/ai/openai/test/OpenAiLanguageModel.test.ts - Matched terms: you; characters read: 12000; symbols: HttpClientError, result, metadata, requests, body, systemMessage
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

### 5/11/2026, 9:12:04 PM

**Summary**
Added a `## Showcase` section to [README.md](/Users/robertpitt/Projects/relay/README.md:37), immediately after Project Overview, and added it to the table of contents. The section displays all three images from `assets/` using relative Markdown image links with alt text:

- `assets/front.png`
- `assets/front-2.png`
- `assets/ticket.png`

**Files Changed**
- [README.md](/Users/robertpitt/Projects/relay/README.md:9)

**Commands Run**
- `rg --files ...` failed because `rg` is not installed.
- `find . -name 'README*' ...`
- `find assets -type f`
- `sed -n '1,220p' README.md`
- `sed -n '221,520p' README.md`
- `file assets/ticket.png assets/front-2.png assets/front.png`
- `sips -g pixelWidth -g pixelHeight ...`
- `git diff -- README.md`
- `git diff --check -- README.md`
- `test -f assets/front.png`
- `test -f assets/front-2.png`
- `test -f assets/ticket.png`
- `git status --short`

**Tests Run**
- `git diff --check -- README.md`: passed.
- File existence checks for all three image paths: passed.
- No npm tests run because this was documentation-only.

**Remaining Risks / Follow-Up**
No known blockers. The worktree already contains other modified/untracked files, including existing README changes outside the showcase edit; I preserved them and did not change application code.


No Codex run has been started.
