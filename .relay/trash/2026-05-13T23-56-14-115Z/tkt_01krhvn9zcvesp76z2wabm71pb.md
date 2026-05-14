---
schemaVersion: 1
id: tkt_01krhvn9zcvesp76z2wabm71pb
title: Refactor Relay IPC Methods Onto Rpc/RpcGroup
ticketType: task
status: todo
position: 21000
priority: high
effort: xhigh
labels:
  - architecture
  - ipc
  - rpc
  - backend
parentEpicId: null
subticketIds: []
blockedByIds: []
relatedTicketIds: []
createdAt: '2026-05-13T23:44:55.788Z'
updatedAt: '2026-05-13T23:51:53.276Z'
authoringState: reviewing
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krhvrm0g2k383y8ah2ba7342
lastRunStartedAt: null
---
# Refactor Relay IPC Methods Onto Rpc/RpcGroup

## Context

Make Electron IPC and the local HTTP API transport layers over Relay's typed Rpc/RpcGroup API. Migrate all existing invoke-style Relay IPC methods in one pass while preserving renderer RelayApi signatures, channel strings, HTTP routes, and transport error behavior.

## Goal

Define all 37 existing request/response channels once as effect/unstable/rpc Rpc entries combined by a RpcGroup; IPC-specific contract types must no longer be the source of truth.

## Decisions / Assumptions

- This is intentionally a compatibility-preserving refactor; no channel names, HTTP paths, or renderer-facing RelayApi names should change.
- Tuple payload schemas are acceptable for this migration because they let Rpc own the schema layer without breaking existing positional IPC and HTTP args.
- Use the pinned effect 4.0.0-beta.65 effect/unstable/rpc APIs already present in node_modules; do not add another RPC dependency.
- For fields already typed as unknown in shared types, broad Schema.Unknown fields are acceptable, but whole RPC results should not remain Schema.Unknown.

## Requirements

- Define all 37 existing request/response channels once as effect/unstable/rpc Rpc entries combined by a RpcGroup; IPC-specific contract types must no longer be the source of truth.
- Preserve existing channel strings, renderer RelayApi method signatures, Electron invoke argument order, and HTTP POST /api/:channel { args: [...] } behavior.
- Use Rpc payload schemas and success schemas for boundary decode/encode; add missing result schemas for shared types such as ProjectSummary, BoardSnapshot, GitMetadata, CodexStatus, run results, ticket draft results, and RunSummary.
- Keep existing transport error semantics: invalid payloads map to TransportDecodeError/relay_decode_error, encode failures to relay_encode_error, and handler failures to relay_api_error.
- Leave the current codex:runEvent Electron notification and HTTP /events SSE stream behavior intact; this task migrates invoke-style IPC methods, not the separate push-event subscription transport.

## Acceptance Criteria

- All existing RelayApi calls from the renderer continue to compile and behave with the same arguments and return shapes.
- All 37 existing invoke channels are backed by Rpc/RpcGroup definitions; production method implementations no longer use defineRelayIpcMethod as the typed API layer.
- Electron IPC and HTTP both execute the same RpcGroup-backed handlers and preserve current transport failure codes and status mapping.
- HTTP /events and window.relay.codex.onRunEvent remain functional and unchanged for run event push notifications.
- npm test and npm run typecheck pass.

## Test Plan

- Update tests/ipc-contract.test.ts to assert relayRpcGroup contains exactly the exported 37 channel tags, each with payload and success schemas, and that Electron IPC registration/replacement/scoped cleanup still works.
- Update tests/ipc-contract.test.ts invalid payload coverage to prove a bad legacy arg tuple is rejected before the Rpc handler runs.
- Update tests/http-transport.test.ts to use the Rpc transport adapter and keep existing token, routing, invalid payload, and malformed JSON assertions passing against POST /api/:channel { args }.
- Run npm test and npm run typecheck.

## Implementation Notes

- Codebase finding: src/shared/ipc.ts:41-79 currently makes IPC itself the typed API with a 37-channel RelayIpcContract; src/shared/ipc.ts:85-123 defines the channel constants consumed by preload, HTTP, and tests.
- Codebase finding: src/ipc/RelayIpc.ts:8-16 defines the homegrown RelayIpcMethod shape, and src/ipc/RelayIpc.ts:35-46 decodes tuple args, runs the domain handler, and encodes the result at the transport boundary.
- Codebase finding: src/ipc/methods/index.ts:1-6 aggregates all method arrays; method bodies live in src/ipc/methods/projects.ts:131-182, src/ipc/methods/board.ts:6-13, src/ipc/methods/tickets.ts:36-248, and src/ipc/methods/codex.ts:18-75.
- Codebase finding: src/preload.app.ts:26-86 exposes window.relay by calling ipcRenderer.invoke(channel, ...args); src/shared/types.ts:635-681 defines the renderer-facing RelayApi that should remain stable.
- Codebase finding: src/http/RelayHttpServer.ts:83-145 currently routes POST /api/:channel with JSON { args } through relayIpcMethods; tests/ipc-contract.test.ts:17-95 and tests/http-transport.test.ts:24-140 cover channel coverage, decode failures, registration cleanup, and HTTP compatibility.
- Implementation: Add a new RPC contract module, preferably src/rpc/contract.ts, exporting relayRpcChannels, the individual Rpc.make definitions, and relayRpcGroup. Use Schema.Tuple payloads that mirror the current positional args so the wire shape stays compatible.
- Implementation: Add or move shared request/response schemas into a reusable schema module. Reuse existing schemas from src/services/schemas.ts where present, add missing schemas from src/shared/types.ts, and keep services/schemas.ts exports compatible for current service imports.
- Implementation: Replace src/ipc/RelayIpc.ts internals with an IPC transport adapter that registers every relayRpcGroup request with ElectronIpc, decodes raw invoke args through each Rpc payloadSchema, calls the RpcGroup handler, encodes through successSchema, and wraps errors with the existing transport helpers.
- Implementation: Convert src/ipc/methods/projects.ts, board.ts, tickets.ts, and codex.ts from defineRelayIpcMethod arrays into RpcGroup handler implementations, preserving the current domain calls and error handling in each handler body.
- Implementation: Update src/ipc/RelayIpcHandlers.ts, src/http/RelayHttpServer.ts, src/preload.app.ts, src/ipc/index.ts, and related tests to consume relayRpcGroup/relayRpcChannels instead of relayIpcMethods/RelayIpcContract while keeping compatibility exports only where useful during migration.
- Local grep found no existing project-local RpcGroup usage; the available Rpc/RpcGroup API is from effect/unstable/rpc, with Rpc.make in node_modules/effect/dist/unstable/rpc/Rpc.d.ts:299-306 and RpcGroup.make/toHandlers/accessHandler in node_modules/effect/dist/unstable/rpc/RpcGroup.d.ts:21-73,131.
- The original bounded research noted code search stopped after 90 files; follow-up local grep covered src and tests for IPC/RPC symbols. rg is not installed in this workspace.
- Be careful with import boundaries: shared schema/contract code should stay free of Electron, Node IO, and backend service side effects so preload bundling stays safe.

## Codex Handoff

No Codex run has been started.
