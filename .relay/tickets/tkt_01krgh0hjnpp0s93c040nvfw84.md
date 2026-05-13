---
schemaVersion: 1
id: tkt_01krgh0hjnpp0s93c040nvfw84
title: Clean Up Repository README
ticketType: task
status: todo
position: 19000
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
createdAt: '2026-05-13T11:19:35.253Z'
updatedAt: '2026-05-13T11:20:38.083Z'
authoringState: reviewing
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krgh0hgjx5y3r80wvq275vta
lastRunStartedAt: null
---
# Clean Up Repository README

## Context

Refresh the repository README as a focused documentation cleanup. Preserve Relay's current technical intent and developer onboarding content, but make the document easier to scan, less repetitive, and more consistent for new developers and coding agents. This is a follow-up to several completed README tickets, so avoid a broad rewrite unless needed to improve clarity.

## Goal

Update README.md only unless a broken reference requires a minimal adjacent fix.

## Decisions / Assumptions

- This is a documentation cleanup, not a product behavior, test, or architecture change.
- The existing README content is broadly accurate and should be refined rather than replaced wholesale.
- The README should remain optimized for local contributors and coding agents rather than marketing readers.
- No new screenshots or assets are required for this pass.

## Requirements

- Update README.md only unless a broken reference requires a minimal adjacent fix.
- Reduce repetition and improve section flow, especially the opening summary and developer onboarding path.
- Keep current technical facts intact: Electron + React + TypeScript, local-first .relay storage, Codex dependency for agent-backed flows, npm/package-lock workflow, and available package scripts.
- Keep the showcase images and existing useful operational sections, but tighten wording and headings where they are too verbose.
- Do not introduce new setup requirements, commands, badges, generated docs, or product claims not supported by the repository.

## Acceptance Criteria

- README.md has a concise non-redundant introduction and a clearer onboarding flow from install to npm run dev.
- All documented commands match package.json and all referenced local files or image assets exist.
- Codex requirements are clear: manual ticket management can work without Codex, while drafting/execution requires Codex CLI/authentication or API key configuration.
- No unsupported product behavior or new workflow requirements are introduced.
- The final README is easier to scan through consistent headings, shorter paragraphs, and focused bullet/table content.

## Test Plan

- Manually read README.md top to bottom and verify the setup path is clear, ordered, and free of duplicated paragraphs.
- Verify all referenced local paths exist: assets/front.png, assets/front-2.png, assets/ticket.png, package.json, package-lock.json, SPEC.md, src/, and tests/.
- Compare the Commands table against package.json scripts and confirm no nonexistent script is documented.
- Run npm run typecheck only if non-README files are changed; for README-only edits, record that automated tests were not run because the change is documentation-only.

## Implementation Notes

- Codebase finding: README.md currently opens with two overlapping product descriptions at lines 3-5; this is a clear cleanup target for a single concise intro.
- Codebase finding: README.md already includes the core onboarding path: Quick Start at lines 7-33, prerequisites at lines 55-62, first project setup at lines 64-72, and commands at lines 138-155.
- Codebase finding: README.md references three showcase assets at lines 35-41; the files exist at assets/front.png, assets/front-2.png, and assets/ticket.png.
- Codebase finding: README.md includes detailed local data, Codex/secrets, repository map, workflow, distribution, and troubleshooting sections at lines 85-295; these should be tightened without removing important operational guidance.
- Codebase finding: package.json scripts at lines 8-19 match the README command table: dev, dev:logs, build, clean:dist, package:binary, dist, logs, logs:dev, preview, test, and typecheck. package-lock.json exists, so npm/package-lock references are current.
- Implementation: Rewrite the README.md opening into one concise description that explains what Relay is, its local-first desktop shape, and when Codex is required.
- Implementation: Tighten Quick Start, Prerequisites, First Project, and Commands so a new developer can get from clone to local dev without duplicated Codex guidance.
- Implementation: Keep the Showcase section with the three existing asset links, preserving accessible alt text and relative paths.
- Implementation: Edit longer reference sections, including Local Data, Codex and Secrets, Repository Map, Development Workflow, Distribution, and Troubleshooting, for consistent tone, concise bullets, and accurate command names.
- Implementation: Do a final pass over README.md headings, tables, code fences, relative paths, and line wrapping to ensure the document reads as a cohesive maintained README.
- Bounded intake research initially scanned unrelated source files and stopped after 90 candidates; direct follow-up inspection covered README.md, package.json, package-lock.json presence, SPEC.md presence, assets, and tests.
- ripgrep is not installed in the local shell, so file discovery used find instead.
- There is an existing Todo placeholder draft with a near-identical idea; this ticket should replace that placeholder rather than creating an additional duplicate if the ticketing workflow supports replacement.

## Codex Handoff

No Codex run has been started.
