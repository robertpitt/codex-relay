---
schemaVersion: 1
id: tkt_01krcka112x6zmxsz6416d6hrj
title: Codex SDK integration improvement epic
ticketType: epic
status: completed
position: 45000
priority: medium
labels:
  - codex
  - sdk
  - epic
  - improvement
parentEpicId: null
subticketIds:
  - tkt_01krckmja3f1vzm0mvcspgr6pv
  - tkt_01krckmjb0mma38kecq4689t71
  - tkt_01krckmjbxkn615zszdmrmpz32
  - tkt_01krckmjcs31xft90t939px4c4
blockedByIds: []
createdAt: '2026-05-11T22:42:45.410Z'
updatedAt: '2026-05-12T00:25:41.035Z'
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krcka104g0w56tja0j2e0zje
lastRunStartedAt: null
---
# Codex SDK integration improvement epic

## Context

Identify and implement concrete Relay improvements from the installed `@openai/codex-sdk` documentation and Relay's current Codex integration. The work focuses on SDK/runtime alignment, supported thread options, richer streamed event handling, and structured image inputs.

## Codebase Findings

- `package.json:21-26` depends on `@openai/codex-sdk` `^0.130.0`; `node_modules/@openai/codex-sdk/package.json:66-68` shows the SDK depends on `@openai/codex` `0.130.0`.
- `node_modules/@openai/codex-sdk/README.md:5` says the TypeScript SDK wraps the `codex` CLI from `@openai/codex`; `node_modules/@openai/codex-sdk/dist/index.js:153-159` resolves an SDK-managed CLI path instead of relying on `codex` being on PATH.
- `src/main/services/codex/status.ts:6-17` currently marks the CLI unavailable when `codex --version` on PATH fails, which can disagree with how `new Codex()` will actually launch the bundled SDK CLI.
- `src/main/services/codex/index.ts:88-96` creates `new Codex({ env: codexEnv() })` without sharing status resolution or a `codexPathOverride`.
- `node_modules/@openai/codex-sdk/dist/index.d.ts:234-249` exposes `approvalPolicy: "on-failure"`, `modelReasoningEffort`, `networkAccessEnabled`, `webSearchMode`, and `additionalDirectories`; Relay settings currently only model/approval/sandbox/non-git toggles in `src/shared/types.ts:48-55`.
- `src/main/services/codex/index.ts:134-145` hard-codes `networkAccessEnabled: false` and `webSearchMode: "disabled"`, and does not pass SDK `modelReasoningEffort` or `additionalDirectories`.
- `node_modules/@openai/codex-sdk/dist/index.d.ts:36-62` defines structured MCP tool call items and `:88-103` defines todo list items, but `src/main/services/codex/index.ts:1094-1101` flattens MCP calls into generic message text and `:1108` drops unsupported item types such as `todo_list`.
- `src/shared/types.ts:388-402`, `src/main/services/schemas.ts:421-490`, and `src/renderer/src/lib/agentProgress.ts:55-127` define the persisted/rendered Relay event types that must be extended for richer SDK events.
- `node_modules/@openai/codex-sdk/README.md:86-95` and `node_modules/@openai/codex-sdk/dist/index.d.ts:187-195` document structured `local_image` input, and `node_modules/@openai/codex-sdk/dist/index.js:217-220` passes images through as `--image`.
- `src/main/services/codex/index.ts:1390-1411` builds execution prompts as a plain string and `:1629` calls `thread.runStreamed(prompt, ...)`, so Relay never passes local image inputs even though `.relay/attachments` is created at `src/main/services/storage/index.ts:164-168`.
- Inspected tests/ticket-draft.test.ts (Matched terms: read, codex, sdk, identify, draft, createdraft, createticketdraft, ticketdraft; symbols: TicketDraftCodexClient, TicketDraftDependencies, TicketDraftStartDependencies, TicketDraftThread).
- Inspected src/main/services/codex/index.ts (Matched terms: like, read, codex, sdk, draft, createdraft, ticketdraft, ticketdraftschema; symbols: Thread, ThreadEvent, ThreadItem, ThreadOptions).
- Inspected docs/backend-effect-v4-upgrade-plan.md (Matched terms: like, read, through, codex, sdk, any, draft, createdraft; symbols: rather).
- Inspected src/main/services/codex/research.ts (Matched terms: read, codex, draft, createdraft, createticketdraft, ticketdraft, ticketdraftschema, ticket:createdraft; symbols: errorMessage, nowIso, DEFAULT_TICKET_DRAFT_RESEARCH_LIMITS, ResearchUrlExcerpt).
- Inspected src/main/services/schemas.ts (Matched terms: read, through, codex, draft, createdraft, ticketdraft, ticketdraftschema; symbols: RelaySchema, nonEmptyString, numberSchema, unknownRecordSchema).
- Inspected docs/backend-effect-v4-audit.md (Matched terms: read, through, codex, sdk, any, draft, createdraft, createticketdraft; symbols: should).
- Research limitation: Code search stopped after scanning 160 candidate files.

## Requirements

- Align Relay's Codex availability checks with the SDK-managed CLI path so status/preflight matches actual run behavior.
- Expose safe, default-disabled SDK thread options through Relay project config without changing existing default behavior.
- Persist and render important SDK streamed item types instead of losing todo and MCP tool context.
- Pass existing local image references from tickets to the Codex SDK as structured `local_image` input while preserving plain string prompts when no images are present.

## Implementation Plan

- Implement the subtickets in dependency order: CLI status alignment first, SDK thread option plumbing second, event normalization third, image input support fourth.
- Keep defaults behavior-preserving: no network or web search unless project config opts in, no additional directories unless configured, no image entries unless a ticket already references local images.
- Update shared types, schemas, backend services, renderer event text/labels, and focused tests in the subtickets listed below.

## Test Plan

- Run `npm test` after all subtickets are implemented.
- Run `npm run typecheck` after all subtickets are implemented.
- Use existing mocked Codex clients in `tests/backend.test.ts`, `tests/run-events.test.ts`, `tests/agent-progress.test.tsx`, and `tests/schemas.test.ts` for focused coverage without invoking real Codex.

## Acceptance Criteria

- Codex status does not incorrectly report unavailable solely because `codex` is absent from PATH when the SDK-bundled CLI can be resolved.
- Project config can opt into SDK-supported execution options while legacy project configs continue to parse with defaults.
- Relay run logs preserve todo list and MCP tool call activity as structured events and render useful labels/text in the agent activity UI.
- Ticket execution passes local Markdown image references to the SDK as `local_image` entries and ignores remote or out-of-project image URLs.
- All new behavior is covered by focused tests and the full test/typecheck commands pass.

## Assumptions / Open Questions

- No documentation URL was provided and network documentation fetch was unavailable, so this ticket uses the installed `@openai/codex-sdk` v0.130.0 README and type declarations as the documentation source of truth.
- Advanced SDK options should be project-config capabilities for now because Relay does not currently expose a general project settings UI.
- Network access and live web search remain disabled by default and should only apply to implementation runs when explicitly enabled in project config.
- Ticket update runs should stay read-only with network and web search disabled even after execution runs gain opt-in controls.

## Implementation Notes

- Official OpenAI docs MCP tools were not available in this session; local package documentation was used instead.
- Code search in the provided bounded research stopped after 160 candidate files, but additional local reads covered the Codex SDK package, Codex service entry points, schemas, run events, renderer progress helpers, and relevant tests.

## Research Metadata

- File inspected: tests/ticket-draft.test.ts - Matched terms: read, codex, sdk, identify, draft, createdraft, createticketdraft, ticketdraft; characters read: 12000; symbols: TicketDraftCodexClient, TicketDraftDependencies, TicketDraftStartDependencies, TicketDraftThread, readyStatus, createProject
  Matched lines:
  - 7: cancelCodexRun,
  - 8: createTicketDraft,
  - 9: draftToCreateInput,
- File inspected: src/main/services/codex/index.ts - Matched terms: like, read, codex, sdk, draft, createdraft, ticketdraft, ticketdraftschema; characters read: 12000; symbols: Thread, ThreadEvent, ThreadItem, ThreadOptions, AgentTicketUpdate, AgentTicketUpdateInput
  Matched lines:
  - 2: import { Codex, type Thread, type ThreadEvent, type ThreadItem, type ThreadOptions } from "@openai/codex-sdk";
  - 8: type CodexRunStartResult,
  - 9: type CodexRunPreflightResult,
- File inspected: docs/backend-effect-v4-upgrade-plan.md - Matched terms: like, read, through, codex, sdk, any, draft, createdraft; characters read: 12000; symbols: rather
  Matched lines:
  - 9: - `package.json` declares `effect@4.0.0-beta.65`, with matching lockfile changes already present in the worktree.
  - 10: - Backend source imports Effect directly from `src/main/services/effectRuntime.ts`, `src/main/services/codex.ts`, `src/main/services/logger.ts`, and `src/main/services/storage.ts`.
  - 22: - Main Promise-facing boundary for renderer calls. Important channels include project registry, board reads, manual ticket operations, ticket draft creation, ticket update runs,...
- File inspected: src/main/services/codex/research.ts - Matched terms: read, codex, draft, createdraft, createticketdraft, ticketdraft, ticketdraftschema, ticket:createdraft; characters read: 12000; symbols: errorMessage, nowIso, DEFAULT_TICKET_DRAFT_RESEARCH_LIMITS, ResearchUrlExcerpt, TicketDraftResearchContext, CandidateResearchFile
  Matched lines:
  - 2: CreateDraftInput,
  - 3: TicketDraftResearch,
  - 4: TicketDraftResearchFile,
- File inspected: src/main/services/schemas.ts - Matched terms: read, through, codex, draft, createdraft, ticketdraft, ticketdraftschema; characters read: 12000; symbols: RelaySchema, nonEmptyString, numberSchema, unknownRecordSchema, mutableArray, withDefault
  Matched lines:
  - 11: CreateDraftInput,
  - 19: RelayCodexEvent,
  - 27: TicketDraft,
- File inspected: docs/backend-effect-v4-audit.md - Matched terms: read, through, codex, sdk, any, draft, createdraft, createticketdraft; characters read: 7876; symbols: should
  Matched lines:
  - 17: - `src/main/services/codex.ts`
  - 18: - Main migration surface for Codex status, ticket drafting, ticket update runs, execution runs, run event persistence, cancellation, and ticket run state.
  - 19: - Uses service layers for `CodexRunDependencies`, `TicketUpdateDependencies`, and `TicketDraftDependencies`.
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

No Codex run has been started.
