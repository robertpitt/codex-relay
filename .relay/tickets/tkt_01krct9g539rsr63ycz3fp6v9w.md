---
schemaVersion: 1
id: tkt_01krct9g539rsr63ycz3fp6v9w
title: Add Subagent-Aware Guidance to Codex Ticket Runs
ticketType: task
status: completed
position: 50000
priority: medium
labels:
  - codex
  - agent-execution
  - prompting
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-12T00:44:48.163Z'
updatedAt: '2026-05-12T01:14:00.819Z'
codexThreadId: 019e19b5-a5af-7390-98c0-48e8b54c23cb
runStatus: completed
lastRunId: run_01krcttxpt9qjnkr52rn0kmrwr
lastRunStartedAt: '2026-05-12T01:03:15.215Z'
---
# Add Subagent-Aware Guidance to Codex Ticket Runs

## Context

Relay should benefit from Codex subagents while a ticket is being worked by giving the implementation agent clear, conservative delegation guidance in the ticket execution prompt. The first implementation should be prompt-level behavior only: no new UI, project setting, schema field, or Relay-managed subagent orchestration.

## Codebase Findings

- OpenAI docs URL research fetched `Subagents – Codex | OpenAI Developers` at `https://developers.openai.com/codex/subagents`, but the bounded fetch only read 416 characters of title/navigation content and did not expose detailed API text.
- `node_modules/@openai/codex-sdk/dist/index.d.ts:196-209` exposes `Thread.runStreamed(input, turnOptions?)` and `Thread.run(input, turnOptions?)`; `ThreadOptions` at `node_modules/@openai/codex-sdk/dist/index.d.ts:238-249` has model, sandbox, network, web search, approval, and additional directory options but no subagent option.
- `src/main/services/codex/index.ts:231-238` defines Relay's `CodexRunThread`/`CodexRunClient` abstraction around `runStreamed`, `startThread`, and `resumeThread`, so Relay currently has no direct SDK surface for app-managed subagent spawning.
- `src/main/services/codex/index.ts:1566-1587` `buildExecutionPrompt` is the prompt used while Codex works a ticket; it currently tells Codex to follow the ticket, ask for clarification, and provide a final handoff, but it does not mention subagents or parallel delegation.
- `src/main/services/codex/index.ts:1629-1641` `buildExecutionInput` wraps the execution prompt with local image items when ticket markdown references local images, so a `buildExecutionPrompt` change applies to both plain string and structured SDK inputs.
- `src/main/services/codex/index.ts:175-199` uses `config.settings.agentConcurrency` to drain queued Ready tickets; `src/main/services/storage/index.ts:1059-1118` moves queued tickets into Ready and lists queued Ready tickets. This setting controls concurrent tickets, not subagents within one ticket.
- `src/main/services/storage/index.ts:83-95`, `src/shared/types.ts:51-63`, and `src/main/services/schemas.ts:169-192` define, default, and validate `agentConcurrency` as an integer >= 1; reusing it as a subagent limit would change existing semantics.
- `tests/backend.test.ts:709-765` already mocks `startCodexRun`, captures the implementation prompt, and asserts selected-project behavior; this is the most direct test location for prompt content assertions.
- `README.md:252-256` documents coding-agent handoff expectations, and `SPEC.md:696-716` documents the execution prompt shape; both should be aligned with the new subagent guidance.
- Fetched "Subagents – Codex | OpenAI Developers" (https://developers.openai.com/codex/subagents) for external context.
- Inspected src/main/services/codex/research.ts (Matched terms: draft, createdraft, createticketdraft, ticketdraft, ticketdraftschema, ticket:createdraft, markdownfromdraft, url; symbols: errorMessage, nowIso, DEFAULT_TICKET_DRAFT_RESEARCH_LIMITS, ResearchUrlExcerpt).
- Inspected tests/ticket-draft.test.ts (Matched terms: task, draft, createdraft, createticketdraft, ticketdraft, url; symbols: TicketDraftCodexClient, TicketDraftDependencies, TicketDraftStartDependencies, TicketDraftThread).
- Inspected src/main/services/schemas.ts (Matched terms: task, draft, createdraft, ticketdraft, ticketdraftschema, url, fetch; symbols: RelaySchema, nonEmptyString, numberSchema, unknownRecordSchema).
- Inspected src/renderer/src/App.tsx (Matched terms: you, task, draft, ticketdraft, markdownfromdraft; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast).
- Inspected src/shared/types.ts (Matched terms: task, draft, ticketdraft, url, fetch; symbols: RELAY_SCHEMA_VERSION, RELAY_TODO_STATUS, RELAY_READY_STATUS, RELAY_IN_PROGRESS_STATUS).
- Inspected tests/schemas.test.ts (Matched terms: way, task, draft, ticketdraft, ticketdraftschema; symbols: expectSchemaError, rendered, validDraftBase, validProjectConfigInput).
- Research limitation: Code search stopped after scanning 160 candidate files.

## Requirements

- Add subagent-aware instructions to Codex ticket execution runs only; do not change ticket drafting, ticket update, schema, IPC, or renderer behavior for this first pass.
- The execution prompt must tell Codex to use subagents only when they are available and useful for the current ticket, especially for independent sidecar tasks that can run in parallel with local critical-path work.
- The guidance must tell Codex to keep urgent blocking work local, avoid duplicate delegation, assign concrete bounded responsibilities, and use disjoint file/module ownership for worker subagents that edit code.
- The guidance must tell Codex to avoid subagents for small or tightly coupled tickets where delegation adds overhead.
- The final handoff requested by Relay must include subagent usage: which subagents were launched, what they owned, what files they changed, how results were integrated, or that no subagents were used.
- Existing project-level `agentConcurrency` behavior must remain limited to queued ticket execution and must not become a subagent limit.
- Keep prompt text concise enough that every ticket run does not receive an oversized policy block.

## Implementation Plan

- Add a small `subagentExecutionGuidance` constant near `buildExecutionPrompt` in `src/main/services/codex/index.ts`.
- Interpolate the new guidance into `buildExecutionPrompt` after the opening instruction to follow the ticket and before the clarification-record section.
- Write the guidance around these rules: plan locally first, delegate only independent sidecar tasks, keep blocking critical-path work local, assign disjoint ownership for code-editing workers, integrate subagent results before finalizing, and wait for subagents only when their result is needed.
- Extend the final handoff bullets in `buildExecutionPrompt` to require a short subagent-usage line, including `none used` when no subagents were launched.
- Update `SPEC.md` section 8.3 so the documented execution prompt includes equivalent subagent guidance without implying Relay directly spawns subagents.
- Update the coding-agent notes in `README.md:252-256` with the same high-level expectation that ticket runs should use subagents conservatively when useful and report that usage in the handoff.
- Add or extend a mocked `startCodexRun` test in `tests/backend.test.ts` near the existing prompt capture test to assert the prompt contains the subagent guidance and final handoff requirement while still including the ticket markdown.
- Keep existing image-input behavior unchanged; no changes should be needed in `buildExecutionInput` beyond receiving the updated prompt text.

## Test Plan

- Run `npm test` and confirm the new backend prompt assertion plus existing Codex run tests pass.
- Run `npm run typecheck`.
- In the new/updated backend test, assert the captured prompt includes terms for subagents, independent sidecar tasks, keeping blocking work local, disjoint ownership, and final handoff reporting.
- Confirm existing local-image run tests in `tests/backend.test.ts:768-858` still pass, proving structured SDK input still carries the updated text prompt.

## Acceptance Criteria

- A Codex implementation run prompt contains a clear subagent guidance section before the ticket markdown.
- The prompt tells Codex that subagent use is optional and should be limited to useful, independent work rather than forced on every ticket.
- The prompt requires final handoff reporting for subagents used, including responsibilities, changed files, integration result, or `none used`.
- No new project setting, IPC contract, shared type, renderer UI, or `.relay/project.json` migration is introduced.
- Existing queued ticket `agentConcurrency` behavior remains unchanged.
- `README.md` and `SPEC.md` describe the new execution-prompt behavior consistently.
- `npm test` and `npm run typecheck` pass.

## Assumptions / Open Questions

- The Codex agent invoked by Relay will have access to subagent capability when the installed Codex CLI supports it; Relay only needs to steer that behavior through the execution prompt in this ticket.
- A prompt-only implementation is the conservative first step because the installed `@openai/codex-sdk` type surface does not expose direct subagent orchestration controls.
- No per-project or per-ticket opt-out is needed until users report that the guidance creates measurable overhead or unwanted delegation.

## Implementation Notes

- The OpenAI docs MCP was not available in this environment, and the bounded URL fetch only captured the page title/navigation. The ticket remains ready because the implementation relies on Relay's existing execution prompt and SDK boundaries rather than undocumented API calls.
- Do not add direct calls to subagent APIs or CLI commands in Relay for this ticket.
- Do not rename or repurpose `agentConcurrency`; it already has a clear multi-ticket scheduler meaning.

## Research Metadata

- URL fetched: https://developers.openai.com/codex/subagents (Subagents – Codex | OpenAI Developers); characters read: 416
- File inspected: src/main/services/codex/research.ts - Matched terms: draft, createdraft, createticketdraft, ticketdraft, ticketdraftschema, ticket:createdraft, markdownfromdraft, url; characters read: 12000; symbols: errorMessage, nowIso, DEFAULT_TICKET_DRAFT_RESEARCH_LIMITS, ResearchUrlExcerpt, TicketDraftResearchContext, CandidateResearchFile
  Matched lines:
  - 2: CreateDraftInput,
  - 3: TicketDraftResearch,
  - 4: TicketDraftResearchFile,
- File inspected: tests/ticket-draft.test.ts - Matched terms: task, draft, createdraft, createticketdraft, ticketdraft, url; characters read: 12000; symbols: TicketDraftCodexClient, TicketDraftDependencies, TicketDraftStartDependencies, TicketDraftThread, readyStatus, createProject
  Matched lines:
  - 8: createTicketDraft,
  - 9: draftToCreateInput,
  - 10: extractTicketDraftUrls,
- File inspected: src/main/services/schemas.ts - Matched terms: task, draft, createdraft, ticketdraft, ticketdraftschema, url, fetch; characters read: 12000; symbols: RelaySchema, nonEmptyString, numberSchema, unknownRecordSchema, mutableArray, withDefault
  Matched lines:
  - 11: CreateDraftInput,
  - 28: TicketDraft,
  - 29: TicketDraftResearch,
- File inspected: src/renderer/src/App.tsx - Matched terms: you, task, draft, ticketdraft, markdownfromdraft; characters read: 12000; symbols: DragEndEvent, ShortcutDirection, TicketMentionToken, Toast, LocalAgentProgress, ActiveTicketReferenceMention
  Matched lines:
  - 42: TicketDraft,
  - 43: TicketDraftErrorPayload,
  - 44: TicketDraftSubticket,
- File inspected: src/shared/types.ts - Matched terms: task, draft, ticketdraft, url, fetch; characters read: 12000; symbols: RELAY_SCHEMA_VERSION, RELAY_TODO_STATUS, RELAY_READY_STATUS, RELAY_IN_PROGRESS_STATUS, RELAY_NEEDS_CLARIFICATION_STATUS, RELAY_REVIEW_STATUS
  Matched lines:
  - 21: export type TicketType = "task" | "epic";
  - 25: | "drafting"
  - 26: | "draft_failed"
- File inspected: tests/schemas.test.ts - Matched terms: way, task, draft, ticketdraft, ticketdraftschema; characters read: 11171; symbols: expectSchemaError, rendered, validDraftBase, validProjectConfigInput, createdAt, parsed
  Matched lines:
  - 10: ticketDraftSchema,
  - 13: import type { TicketDraftSubticket } from "../src/shared/types";
  - 24: const validDraftBase = (patch: Partial<TicketDraftSubticket> = {}): TicketDraftSubticket => ({
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

### 5/12/2026, 2:05:07 AM

**Summary**
Added prompt-level subagent guidance for Codex ticket execution runs only. The execution prompt now tells Codex to use subagents conservatively, keep blocking work local, delegate only independent sidecar work, assign bounded/disjoint ownership for worker edits, and report subagent usage in the final handoff.

**Files Changed**
- [src/main/services/codex/index.ts](/Users/robertpitt/Projects/relay/src/main/services/codex/index.ts:1786)
- [tests/backend.test.ts](/Users/robertpitt/Projects/relay/tests/backend.test.ts:760)
- [README.md](/Users/robertpitt/Projects/relay/README.md:252)
- [SPEC.md](/Users/robertpitt/Projects/relay/SPEC.md:698)

**Commands Run**
- `grep`, `sed`, `nl`, `git diff`, `git status` for inspection
- `npm test`
- `npm run typecheck`

**Tests**
- `npm test`: passed, 115 tests
- `npm run typecheck`: passed

**Subagent Usage**
None used.

**Remaining Risks / Follow-Up**
No Relay-managed subagent orchestration was added, by design. The worktree already contains unrelated modified and untracked files; I left them intact.


No Codex run has been started.
