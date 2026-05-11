---
schemaVersion: 1
id: tkt_01krb3hk95zkqevncwesjecy02
title: Show Git Metadata in Project Headers
status: in_progress
position: 1000
priority: medium
labels:
  - feature
  - ui
  - git
  - project-metadata
createdAt: '2026-05-11T08:48:01.829Z'
updatedAt: '2026-05-11T08:49:40.090Z'
codexThreadId: 019e163a-4cc4-7ba2-8332-ec773474840a
runStatus: running
lastRunId: run_01krb3mk2tsjtn4f2hy1fnce6z
---
# Show Git Metadata in Project Headers

## Context

Project headers should surface useful Git status information so users can quickly understand each project's repository state without opening a terminal. The metadata should include the current branch, whether Git is available/enabled for the project, whether the working tree is clean or dirty, and the number of uncommitted file changes where available.

## Requirements

- Display Git metadata in the header for each project shown in the Relay UI.
- Show the current branch name for Git-enabled projects.
- Show a clear clean/dirty status for Git-enabled projects.
- Show a count of uncommitted file changes, including staged, unstaged, and untracked files unless an existing project convention defines this differently.
- Indicate when Git is not enabled, unavailable, or the project directory is not a Git repository.
- Handle detached HEAD, missing repository, inaccessible path, and Git command failures gracefully.
- Avoid blocking the project list/header render while Git metadata is loading.
- Refresh metadata when a project is opened, focused, or when the project list is refreshed.
- Keep the UI compact so metadata does not crowd the existing project header content.

## Acceptance Criteria

- Each project header includes Git metadata when the project is a valid Git repository.
- A clean repository displays its branch and a clean state with no misleading change count.
- A dirty repository displays its branch and the number of changed files.
- A non-Git project displays a neutral Git-disabled or not-a-repository state.
- Detached HEAD repositories display a meaningful short commit SHA or detached indicator instead of failing.
- Git errors are surfaced non-intrusively and do not break the project header UI.
- Metadata loading and error states are represented consistently with existing Relay UI patterns.
- The implementation includes focused tests for Git metadata parsing/status handling and UI rendering states where the project test setup supports it.

## Clarification Questions

- Should the uncommitted file count be a single total or split into staged, unstaged, and untracked counts?
- Does "Git enabled" mean the project directory is a Git repository, or is there a separate Relay setting that enables/disables Git integration?
- Which project headers should show this metadata: project cards, project detail pages, sidebars, or all of them?
- Should metadata update live via file watching, or only refresh when the project view/list refreshes?

## Implementation Notes

- Look for existing project metadata models, project header components, and any existing Git utilities before adding new abstractions.
- Prefer a backend/service-layer Git status provider that returns structured metadata rather than parsing Git output directly in UI components.
- Use stable fields such as branchName, isGitRepository, isDirty, changedFileCount, isDetachedHead, commitSha, and error/message as appropriate.
- Consider using porcelain Git status output for reliable parsing if no existing Git library is already used.
- Cache or debounce Git status calls to avoid running Git repeatedly for every render, especially when multiple projects are visible.
- Keep presentation logic separate from Git status collection so the UI can render loading, unavailable, clean, dirty, and error states predictably.

## Codex Handoff

No Codex run has been started.
