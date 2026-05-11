---
schemaVersion: 1
id: tkt_01krbd7ytw9a1fngv3pfmvg0bn
title: Add @-reference autocomplete for linking tickets while drafting
status: in_progress
position: 1000
priority: medium
labels:
  - feature
  - tickets
  - editor
  - markdown
createdAt: '2026-05-11T11:37:31.740Z'
updatedAt: '2026-05-11T11:37:48.703Z'
codexThreadId: 019e16d4-3d6b-7bd0-ad55-34eccbc7dbcb
runStatus: running
lastRunId: run_01krbd8f89wf6qwc2g0h3h9smw
---
# Add @-reference autocomplete for linking tickets while drafting

## Context

While creating a ticket, users should be able to type @, search existing tickets, and insert a Markdown link to the selected ticket file. This should work inside the ticket creation/drafting flow and produce normal Markdown so the link remains portable in saved ticket files.

## Research Findings

- src/shared/types.ts defines TicketDraft with a markdown field and research metadata fields, so inserted @ references should ultimately become plain Markdown in the draft content rather than a new persisted reference type unless a stronger need is found.
- src/renderer/src/components/MarkdownBlock.tsx contains Markdown rendering/link handling via MarkdownBlock, normalizeMarkdown, and safeLinkProtocols; verify that relative file links to local ticket markdown files render safely and are not blocked by protocol filtering.
- src/renderer/src/lib/markdown.ts contains ticket draft Markdown serialization helpers, including researchMetadata(draft), so any generated ticket content should preserve the inserted Markdown links without duplicating them in research metadata.
- src/main/services/codex.ts references TicketDraftResearch and prompt construction for ticket drafting; @ references are a renderer/editor interaction and should not require changing Codex prompt generation unless selected references should be included as extra drafting context.
- tests/ticket-draft.test.ts validates ticket draft prompt/research context behavior; add or adjust tests only if the feature changes draft markdown generation or research context formatting.
- src/main/services/schemas.ts defines ticket draft research limit schemas; no schema change appears necessary for plain Markdown links unless the implementation stores selected references as structured metadata.
- Bounded research did not inspect the specific ticket creation editor component or ticket file discovery code, so implementation should first locate the renderer component responsible for creating/editing ticket markdown and the existing project ticket listing service.

## Requirements

- In the ticket creation editor, typing @ followed by text opens an autocomplete/search menu for existing tickets in the current project.
- Search results include enough context to choose the right ticket, at minimum title and relative file path; include status/column if that data is already available cheaply.
- Selecting a result inserts a Markdown link to that ticket file at the cursor position, using the ticket title as link text and a path that is valid from the created ticket file location.
- The @ query text is replaced cleanly, preserving surrounding text, cursor position, and editor focus.
- The search must be scoped to local Relay ticket files for the active project and should not perform network access.
- The current draft should continue to save/export as ordinary Markdown without requiring special rendering support for @ references.
- Keyboard and pointer interactions must be supported: arrow navigation, Enter/Tab to select, Escape to close, click to select.
- Handle empty states and no-match states without disrupting typing.
- Avoid linking to archived/not-doing/completed tickets only if existing ticket search/listing conventions already filter them; otherwise show all tickets and display their status.
- Do not introduce a new persistence schema for references unless required by existing architecture.

## Implementation Plan

- Locate the renderer component used for ticket creation/editing and the state shape for the draft markdown input.
- Locate the existing ticket discovery/listing path for the active project, including how ticket markdown files, titles, paths, and columns are loaded from disk.
- Add or reuse a main-process/API method that returns searchable ticket reference candidates for the active project with title, relative path, absolute path if needed internally, and status/column metadata.
- Implement a renderer-side @ mention detector for the editor that tracks the active token before the cursor, opens the menu after @, and closes it when the token is invalid, the cursor moves away, or the user cancels.
- Build the autocomplete UI using existing app styling/components, keeping it anchored near the editor/caret where practical and accessible via keyboard.
- Implement filtering over ticket candidates by title and path, with debouncing only if the candidate list or filesystem lookup is expensive.
- On selection, replace the active @ token with a Markdown link like [Ticket Title](relative/path/to/ticket.md), escaping Markdown special characters in the title and URL-encoding or otherwise safely formatting paths with spaces.
- Ensure the inserted relative path is computed from the eventual ticket file location when known; if the file path is not known until save time, use the project-relative link format already supported by Relay or defer path resolution through the existing save flow.
- Verify MarkdownBlock renders the generated link correctly and that its safe link handling allows the chosen relative link format.
- Add focused tests for mention detection/replacement, candidate filtering, and Markdown link generation; add integration or component tests around the ticket creation editor if the project already has renderer test coverage.
- Run the relevant test suite and manually verify creating a draft, searching with @, selecting a ticket, saving, and reopening the ticket.

## Acceptance Criteria

- Typing @ in the ticket creation markdown editor opens a ticket search menu scoped to the active project.
- Typing characters after @ filters existing tickets by title and path.
- Selecting a ticket inserts a valid Markdown link to that ticket file and removes the typed @ query.
- The generated link renders as a clickable Markdown link in Relay's existing Markdown preview/display.
- Keyboard navigation and Escape cancellation work without losing editor focus.
- No network requests are made for ticket reference search.
- Existing ticket draft tests continue to pass, and new tests cover link insertion behavior.

## Clarification Questions

- Should @ search include completed/not-doing tickets by default, or only active board columns?
- Should links be relative to the new ticket file, project-root relative, or use an existing Relay-specific path convention?
- Should selecting a referenced ticket also attach any structured metadata, or is a plain Markdown link sufficient?

## Implementation Notes

- Prefer implementing references as plain Markdown links first because the inspected shared types already model draft content as markdown and no structured reference schema was identified.
- If the new ticket file path is unknown during creation, path calculation may be the main design decision; avoid inserting absolute local filesystem paths unless Relay already uses them.
- Keep this feature independent from the Codex ticket-drafting research prompt unless future requirements ask @ references to influence AI-generated ticket content.

## Research Metadata

- File inspected: tests/ticket-draft.test.ts - Matched terms: references, search, markdown, url, fetch, http, network; characters read: 11332; symbols: TicketDraftDependencies, readyStatus, createProject, projectPath, validDraftJson, prompt
- File inspected: src/main/services/codex.ts - Matched terms: like, while, search, add, markdown, url, fetch, http; characters read: 12000; symbols: Thread, ThreadEvent, ThreadItem, ThreadOptions, ClarificationQuestion, CodexStatus
- File inspected: src/renderer/src/components/MarkdownBlock.tsx - Matched terms: while, markdown, link, url, http; characters read: 12000; symbols: ClipboardWriter, MarkdownNode, CopyKind, MarkdownBlockProps, safeLinkProtocols, normalizeMarkdown
- File inspected: src/shared/types.ts - Matched terms: search, add, markdown, url, fetch, web, network; characters read: 10485; symbols: RELAY_SCHEMA_VERSION, DEFAULT_COLUMNS, TicketPriority, RunStatus, ProjectHealth, ThemePreference
- File inspected: src/renderer/src/lib/markdown.ts - Matched terms: search, add, markdown, url; characters read: 2068; symbols: list, researchMetadata, urls, title, reason, files
- File inspected: src/main/services/schemas.ts - Matched terms: search, url, fetch; characters read: 4997; symbols: isoString, relayColumnSchema, projectSettingsSchema, projectConfigSchema, ticketFrontMatterSchema, appRegistrySchema

## Codex Handoff

No Codex run has been started.
