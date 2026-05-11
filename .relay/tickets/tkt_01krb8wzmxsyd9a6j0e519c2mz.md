---
schemaVersion: 1
id: tkt_01krb8wzmxsyd9a6j0e519c2mz
title: Make AI Draft Generation Research-Aware
status: completed
position: 15000
priority: high
labels:
  - ai
  - drafts
  - ticket-generation
  - research
  - developer-experience
createdAt: '2026-05-11T10:21:37.821Z'
updatedAt: '2026-05-11T10:58:06.854Z'
codexThreadId: 019e16a5-67ab-7080-8137-3dfc476f1e15
runStatus: completed
lastRunId: run_01krbaas86f31fvr9hgda9frsy
---
# Make AI Draft Generation Research-Aware

## Context

Relay's current draft creation flow appears to convert a user's rough idea into a structured ticket without first inspecting the local codebase, fetching referenced URLs, or gathering supporting context. This can produce tickets that look well formatted but are not sufficiently grounded in the actual project. Draft generation should become a research-backed workflow so the resulting markdown includes accurate findings, relevant code references, and a more concrete implementation plan.

## Requirements

- Update the draft creation workflow so the AI can perform research before producing the final ticket markdown.
- Detect URLs included in the user's idea and fetch/read their contents when allowed.
- Allow the draft agent to inspect the relevant local codebase for the selected project before writing the ticket.
- Use code search and targeted file reads to identify likely affected modules, existing patterns, related utilities, and test locations.
- Incorporate research findings into the generated ticket markdown, including concise source references such as file paths, function/component names, or URL titles.
- Generate a more implementation-oriented plan, not only a normalized ticket structure.
- Make research depth bounded and predictable so draft generation remains responsive.
- Show or persist enough metadata to know what research was performed, such as checked URLs and inspected files.
- Handle inaccessible URLs, fetch failures, missing project paths, or empty search results gracefully by noting the limitation in the draft instead of failing silently.
- Avoid including large copied source blocks or excessive page content in the ticket; summarize findings and reference sources instead.

## Acceptance Criteria

- Given an idea containing a URL, draft generation attempts to fetch the URL and incorporates relevant findings into the ticket markdown.
- Given an idea related to the current Relay codebase, draft generation searches/reads relevant project files before producing the ticket.
- Generated tickets include a research/findings section or equivalent content with concrete references to inspected files and/or fetched URLs.
- Generated tickets include a more specific implementation plan informed by the research findings.
- If URL fetching or codebase inspection fails, the generated ticket clearly states what could not be researched and why.
- The draft generation flow remains bounded by configured limits for time, number of files, and fetched content size.
- Existing simple draft creation still works for ideas that do not require research.
- Tests cover URL detection/fetch behavior, codebase research invocation, failure handling, and markdown output containing research-backed context.

## Clarification Questions

- Should the research step run automatically for every draft, or only when the user enables a research/deep-draft mode?
- What external URL domains or protocols should be allowed during draft generation?
- Should the UI expose the researched sources to the user before the draft is saved?

## Implementation Notes

- Look for the current draft generation service/agent entry point and replace the single-pass prompt flow with a bounded research-then-write workflow.
- Prefer existing project search/file-reading abstractions if Relay already has agent tooling for codebase access.
- Add URL extraction and fetching as a separate, testable step before prompt assembly.
- Consider a structured intermediate result such as researchedSources, codeFindings, limitations, and proposedPlan, then render the final ticket markdown from that context.
- Add safeguards for latency, token usage, network failures, and prompt injection from fetched web content.
- The final ticket should distinguish researched facts from assumptions so human developers can evaluate the plan quickly.

## Codex Handoff

### 5/11/2026, 11:58:06 AM

**Summary**
Implemented research-aware draft generation. Drafts now run a bounded pre-prompt research step that detects/fetches HTTP(S) URLs, scans relevant local files, records inspected sources and limitations, and passes that context into Codex. Generated markdown now includes `Research Findings`, `Implementation Plan`, and `Research Metadata`.

**Files Changed**
- [src/main/services/codex.ts](/Users/robertpitt/Projects/relay/src/main/services/codex.ts)
- [src/main/services/schemas.ts](/Users/robertpitt/Projects/relay/src/main/services/schemas.ts)
- [src/shared/types.ts](/Users/robertpitt/Projects/relay/src/shared/types.ts)
- [src/main/services/storage.ts](/Users/robertpitt/Projects/relay/src/main/services/storage.ts)
- [src/renderer/src/lib/markdown.ts](/Users/robertpitt/Projects/relay/src/renderer/src/lib/markdown.ts)
- [tests/ticket-draft.test.ts](/Users/robertpitt/Projects/relay/tests/ticket-draft.test.ts)

**Commands Run**
- `npm run typecheck`
- `npm test`
- `git diff --check`
- `git status --short`
- `git diff --stat`

**Tests Run**
- `npm run typecheck`: passed
- `npm test`: passed, 33/33 tests
- `git diff --check`: passed, no whitespace errors

**Remaining Risks / Follow-Up**
- URL fetching is limited to HTTP(S), with failures recorded in the draft.
- Research is bounded, so very large projects may only inspect the highest-scoring files.
- The worktree contains unrelated pre-existing changes outside the six files listed above; I left them untouched.


No Codex run has been started.
