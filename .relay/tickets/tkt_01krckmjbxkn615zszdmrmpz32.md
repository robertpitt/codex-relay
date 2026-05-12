---
schemaVersion: 1
id: tkt_01krckmjbxkn615zszdmrmpz32
title: Persist SDK todo-list and MCP tool-call events
ticketType: task
status: completed
position: 44000
priority: medium
labels:
  - codex
  - sdk
  - events
  - ui
parentEpicId: tkt_01krcka112x6zmxsz6416d6hrj
subticketIds: []
blockedByIds: []
createdAt: '2026-05-11T22:48:30.845Z'
updatedAt: '2026-05-11T23:57:28.259Z'
codexThreadId: 019e1965-0429-7020-bbf8-c00501f1e2b5
runStatus: completed
lastRunId: run_01krcnyq15kt93h1w2redh4zep
lastRunStartedAt: null
---
# Persist SDK todo-list and MCP tool-call events

## Parent Epic

Codex SDK integration improvement epic

## Context

The SDK streams structured todo list and MCP tool-call items. Relay currently drops todo lists and flattens MCP calls into generic text, reducing observability in run logs and the agent activity panel.

## Codebase Findings

- `node_modules/@openai/codex-sdk/dist/index.d.ts:36-62` defines `McpToolCallItem` with server, tool, arguments, result/error, and status.
- `node_modules/@openai/codex-sdk/dist/index.d.ts:88-103` defines `TodoListItem` with text/completed items and includes it in `ThreadItem`.
- `src/main/services/codex/index.ts:1094-1101` turns MCP calls into `agent.message.delta` strings like `${server}.${tool} ${status}`.
- `src/main/services/codex/index.ts:1108` returns an empty array for unhandled item types, so `todo_list` activity is lost.
- `src/shared/types.ts:388-402` and `src/main/services/schemas.ts:421-490` are the canonical Relay run event type/schema definitions.
- `src/renderer/src/lib/agentProgress.ts:55-127` maps event types to rendered text, labels, and tones.
- `tests/agent-progress.test.tsx:156-176` covers log viewer event ordering and labels; `tests/run-events.test.ts:14-51` covers persisted run-log summaries.

## Requirements

- Add structured Relay event types for SDK todo list updates and MCP tool calls.
- Persist todo list items as text/completed pairs without storing unnecessary SDK internals.
- Persist MCP call server, tool, status, and optional error message; do not persist full MCP result content by default to avoid large logs.
- Normalize these SDK item types in `normalizeItemEvent()` for `item.started`, `item.updated`, and `item.completed`.
- Render clear labels/text/tones for the new event types in the agent progress utilities.

## Implementation Plan

- Extend `RelayCodexEvent` in `src/shared/types.ts` with `todo.updated` and `mcp.tool_call` event variants.
- Extend `relayCodexEventTypeSchema` and `relayCodexEventSchema` in `src/main/services/schemas.ts` for the new variants.
- Update `src/main/services/codex/index.ts:normalizeItemEvent` to emit `todo.updated` for `item.type === "todo_list"` and `mcp.tool_call` for `item.type === "mcp_tool_call"`.
- Update `src/renderer/src/lib/agentProgress.ts` so `agentEventText`, `agentEventLabel`, and `agentEventTone` handle the new events.
- Ensure `mergeRunEvents()` keys remain stable by relying on the new `agentEventText()` output for these event types.
- Add tests that mocked streamed SDK events produce persisted and renderer-visible structured events.

## Test Plan

- Add backend coverage in `tests/backend.test.ts` with a mocked `runStreamed()` yielding todo-list and MCP tool-call item events; assert emitted events and `readCodexRunEvents()` include the new structured event types.
- Add schema coverage in `tests/schemas.test.ts` for valid and invalid `todo.updated` and `mcp.tool_call` payloads.
- Add renderer utility coverage in `tests/agent-progress.test.tsx` asserting log labels/text for the new events.
- Run `npm test` and `npm run typecheck`.

## Acceptance Criteria

- SDK todo-list events are no longer dropped from Relay run logs.
- SDK MCP tool calls are logged as structured MCP events rather than generic message deltas.
- The agent activity UI displays understandable labels and text for todo and MCP activity.
- Run log parsing remains backward compatible for existing JSONL logs.

## Assumptions / Open Questions

- Full MCP results can be large or sensitive, so Relay should log only summary metadata and error messages in this subticket.
- Todo list updates are useful as activity events but do not need to affect ticket status or acceptance flow.

## Implementation Notes

- Keep event payloads JSON-schema-friendly because `RunLogLine.payload` is persisted as JSONL.

## Codex Handoff

### 5/12/2026, 12:40:29 AM

**Summary**
Implemented structured Relay events for SDK todo-list updates and MCP tool calls. Todo events persist only `{ text, completed }` items, and MCP events persist server/tool/status plus optional error without arguments or result payloads. Renderer progress utilities now show clear labels, text, and tones for both event types.

**Files Changed**
- [types.ts](/Users/robertpitt/Projects/relay/src/shared/types.ts)
- [schemas.ts](/Users/robertpitt/Projects/relay/src/main/services/schemas.ts)
- [index.ts](/Users/robertpitt/Projects/relay/src/main/services/codex/index.ts)
- [agentProgress.ts](/Users/robertpitt/Projects/relay/src/renderer/src/lib/agentProgress.ts)
- [backend.test.ts](/Users/robertpitt/Projects/relay/tests/backend.test.ts)
- [schemas.test.ts](/Users/robertpitt/Projects/relay/tests/schemas.test.ts)
- [agent-progress.test.tsx](/Users/robertpitt/Projects/relay/tests/agent-progress.test.tsx)

**Commands Run**
- `git status --short`
- `grep`/`sed`/`nl` inspections for event types, schemas, normalizer, and tests
- `npm test`
- `npm run typecheck`

**Tests**
- `npm test`: passed, 99 tests
- `npm run typecheck`: passed

**Remaining Risks / Follow-Up**
The worktree already had unrelated dirty files and `.relay` run/ticket artifacts before this change; I left those untouched. No known remaining follow-up for this ticket.


No Codex run has been started.
