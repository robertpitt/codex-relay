---
schemaVersion: 1
id: tkt_01krch7qa4z9mv2mkag46pny99
title: Migrate Relay validation schemas from Zod to Effect Schema
ticketType: task
status: todo
position: 11000
priority: high
labels:
  - backend
  - effect
  - validation
  - tech-debt
parentEpicId: null
subticketIds: []
blockedByIds: []
createdAt: '2026-05-11T22:06:32.772Z'
updatedAt: '2026-05-11T22:12:19.997Z'
codexThreadId: null
runStatus: draft_complete
lastRunId: run_01krch7q94g9h1zztnzprak6wk
---
# Migrate Relay validation schemas from Zod to Effect Schema

## Context

Relay currently uses Zod for runtime validation in the backend schema module while IPC already uses Effect Schema. Migrate Relay-owned validation schemas to Effect Schema, update all validation call sites, and remove the direct Zod dependency without changing shared data contracts or persisted file formats.

## Codebase Findings

- `src/main/services/schemas.ts:1-440` is the central Zod schema module. It imports `z` at line 1 and defines all Relay-owned validation schemas for project config, ticket front matter, registry, ticket drafts, IPC/domain inputs, Codex run events, and run log lines.
- `src/main/ipc/schema.ts:1-17` already defines IPC payload/result schemas using `Schema` from `effect`; `src/main/ipc/RelayIpc.ts:42-44` decodes payloads and encodes results with `Schema.decodeUnknownEffect` / `Schema.encodeUnknownEffect`. This is the local Effect Schema pattern to align with.
- Zod parse call sites are concentrated outside `schemas.ts`: `src/main/ipc/methods/tickets.ts:50,60,66,74,84,92,130,136,150`, `src/main/ipc/methods/codex.ts:28,34,40,53`, `src/main/ipc/methods/projects.ts:92`, `src/main/services/storage/index.ts:175,279,1072`, `src/main/services/registry/index.ts:22`, `src/main/services/run-events/index.ts:46,56`, and `src/main/services/codex/index.ts:570,1008`.
- `src/main/services/codex/index.ts:3` imports `ZodError`; `normalizeTicketDraftError` treats `ZodError` as an invalid Codex response at `src/main/services/codex/index.ts:351-359`. This must switch to Effect Schema error detection while preserving the `invalid_response` mapping.
- Current schema behaviors to preserve include Date-to-ISO preprocessing in `isoString` (`src/main/services/schemas.ts:38-41`), non-empty string constraints such as ticket IDs/titles/status (`src/main/services/schemas.ts:74-105`), defaults for legacy ticket metadata (`src/main/services/schemas.ts:107-119`), `.passthrough()` persisted objects (`src/main/services/schemas.ts:90-121,129-145,249-365`), `.strict()` structured Codex outputs (`src/main/services/schemas.ts:191-247`), and the custom task/subticket rejection (`src/main/services/schemas.ts:229-236`).
- `src/shared/types.ts:18-39` defines the enum unions mirrored by schemas; `src/shared/types.ts:108-180` defines `TicketFrontMatter`, `TicketDraftSubticket`, and `TicketDraft`. Shared types should remain the source of the public contract and should not be changed for this migration.
- `package.json:27` already depends on `effect@4.0.0-beta.65`; `package.json:33` declares direct dependency `zod`. `package-lock.json:10-23` mirrors that direct dependency and `package-lock.json:3239-3247` contains the only `node_modules/zod` package entry found in the lockfile.
- Effect Schema APIs available in the installed version include `Schema.decodeUnknownSync` (`node_modules/effect/dist/Schema.d.ts:1003`), `Schema.isSchemaError` (`node_modules/effect/dist/Schema.d.ts:740`), `Schema.Literals` (`node_modules/effect/dist/Schema.d.ts:2700`), `Schema.Struct` (`node_modules/effect/dist/Schema.d.ts:1921`), `Schema.Record` (`node_modules/effect/dist/Schema.d.ts:2153`), `Schema.mutable` for mutable array output (`node_modules/effect/dist/Schema.d.ts:2569-2590`), and per-schema `parseOptions` annotations (`node_modules/effect/dist/Schema.d.ts:7525-7564`).
- Effect Schema arrays decode to `ReadonlyArray` by default (`node_modules/effect/dist/Schema.d.ts:2454-2479`), while Relay shared types use mutable arrays such as `string[]`; migrated schemas that must satisfy shared types should wrap arrays with `Schema.mutable(Schema.Array(...))`.
- Effect Schema object excess-property behavior is controlled by parse options: `onExcessProperty` supports `ignore`, `error`, and `preserve` (`node_modules/effect/dist/SchemaAST.d.ts:302-337`). This maps to Zod default object stripping, `.strict()`, and `.passthrough()` respectively.
- `docs/backend-effect-v4-upgrade-plan.md:54-56` explicitly says schemas likely remain Zod unless a later decision replaces them with Effect Schema. This ticket is that later decision; the same document also states `.effect/` is third-party reference source and should not be patched (`docs/backend-effect-v4-upgrade-plan.md:1-4`).
- Tests already cover validation-sensitive paths: draft structured output schema in `tests/ticket-draft.test.ts:109-126`, invalid task-with-subtickets rejection in `tests/ticket-draft.test.ts:724-726`, ticket update invalid output safety in `tests/ticket-update.test.ts:149-183`, IPC invalid payload rejection in `tests/ipc-contract.test.ts:61-87`, and storage legacy ticket defaults beginning at `tests/backend.test.ts:249`.
- `tests/run-tests.mjs:11-27` hard-codes the test entry point list, so adding a new schema-focused test file requires adding it to that array.
- Inspected .effect/packages/ai/openai/test/OpenAiSchema.test.ts (Matched terms: all, effect, schema; symbols: makeResponse, decoded, response, applyPatchItem).
- Inspected docs/backend-effect-v4-upgrade-plan.md (Matched terms: migrate, all, schemas, zod, built, effect, schema; symbols: rather).
- Inspected .effect/packages/ai/anthropic/test/AnthropicLanguageModel.test.ts (Matched terms: all, effect, schema; symbols: HttpClientError, HttpClientRequest, toolParams, layer).
- Inspected .effect/packages/ai/openai/src/OpenAiSchema.ts (Matched terms: all, schemas, effect, schema; symbols: UnknownRecord, JsonObject, MessageRole, ImageDetail).
- Inspected src/main/services/schemas.ts (Matched terms: all, schemas, zod, schema; symbols: isoString, ticketPrioritySchema, ticketTypeSchema, runStatusSchema).
- Inspected .effect/packages/ai/openai/codegen.yaml (Matched terms: all, schemas, effect, schema; symbols: of, identifier).
- Research limitation: Code search stopped after scanning 160 candidate files.

## Requirements

- Replace all Relay-owned Zod schemas in `src/main/services/schemas.ts` with Effect Schema definitions while preserving the existing exported schema constant names.
- Export a small decode helper from `src/main/services/schemas.ts`, for example `parseSchema(schema, input)`, backed by `Schema.decodeUnknownSync`, and use it at all existing `.parse(...)` call sites.
- Preserve current runtime behavior: non-empty string checks, literal enum checks, nullable fields, optional fields, default values, Date-to-ISO decoding for persisted timestamps, record-of-unknown payloads, stripped default object extras, passthrough persisted object extras, strict Codex output objects, and task drafts rejecting subtickets.
- Use Effect Schema error detection, not `ZodError`, when classifying invalid Codex structured output in `src/main/services/codex/index.ts`.
- Keep `src/shared/types.ts` public types and persisted `.relay` JSON/markdown shapes unchanged.
- Remove the direct `zod` dependency from `package.json` and `package-lock.json`; no Relay source or tests should import `zod`, reference `ZodError`, `ZodType`, or use the `z.` API after the migration.
- Do not modify `.effect/`, `dist/`, `out/`, or `node_modules`; they are reference/generated/vendor artifacts.
- Add focused tests for schema migration behavior, especially defaults, passthrough vs strict excess properties, Date timestamp decoding, invalid task subtickets, and representative input validation failures.

## Implementation Plan

- Replace the `zod` import in `src/main/services/schemas.ts` with Effect imports such as `Effect`, `Schema`, and `SchemaGetter` if needed for transformations.
- In `src/main/services/schemas.ts`, add local helpers for recurring patterns: non-empty strings (`Schema.String.check(Schema.isMinLength(1))`), mutable arrays (`Schema.mutable(Schema.Array(...))`), literal enums (`Schema.Literals([...])`), defaults (`Schema.withDecodingDefault` or `Schema.withDecodingDefaultType` with `Effect.succeed(...)`), passthrough structs (`Schema.Struct(...).annotate({ parseOptions: { onExcessProperty: "preserve" } })` or equivalent), and strict structs (`onExcessProperty: "error"`).
- Rebuild every exported schema in `src/main/services/schemas.ts` with Effect Schema while keeping the same export names and TypeScript target types from `src/shared/types.ts`. Use `Schema.Union` for `relayCodexEventSchema`, `Schema.Record(Schema.String, Schema.Unknown)` for unknown payload maps, `Schema.NullOr(...)` for nullable fields, and mutable array schemas anywhere the shared type expects `T[]`.
- Implement `isoString` as an Effect Schema that accepts non-empty strings and `Date` instances and decodes `Date` values to `toISOString()`, matching the current Zod `preprocess` behavior.
- Recreate the `ticketDraftSchema` task/subticket invariant with an Effect Schema check, e.g. `Schema.makeFilter`, so `ticketType: "task"` with non-empty `subtickets` fails validation with a clear path/message.
- Export `parseSchema` and, if useful, `isRelaySchemaError` from `src/main/services/schemas.ts`; then replace every current `.parse(...)` call in the affected IPC, storage, registry, run-events, and codex files with `parseSchema(schema, value)`.
- Remove `import { ZodError } from "zod"` from `src/main/services/codex/index.ts` and update `normalizeTicketDraftError` to classify `Schema.isSchemaError(error)` the same way `ZodError` is classified today.
- Remove `zod` from `package.json` dependencies and update `package-lock.json` so the root dependency and the standalone `node_modules/zod` package entry are gone unless a new transitive dependency requires it.
- Add schema-focused tests, preferably `tests/schemas.test.ts`, and include it in `tests/run-tests.mjs:11-27`. Cover Effect Schema defaults, passthrough extra property preservation, strict extra property rejection, Date-to-ISO timestamp decoding, and task drafts with subtickets failing validation.
- Update existing tests only where assertions depend on Zod-specific error text; preserve user-facing Relay error classifications and broad `/invalid/i` style assertions where possible.

## Test Plan

- Run `npm run typecheck` to catch Effect Schema type mismatches, especially readonly array output versus mutable shared types.
- Run `npm test` to exercise storage, IPC, draft generation, ticket update, and run-event validation paths through the existing test suite.
- Add and run schema-specific tests covering `projectConfigSchema` or `ticketFrontMatterSchema` passthrough/default behavior, `ticketDraftSchema` strict/root invariant behavior, `agentTicketUpdateSchema` strict behavior, and `runLogLineSchema`/`relayCodexEventSchema` representative event decoding.
- Run `grep -RInE "from ['\"]zod['\"]|ZodError|ZodType|\bz\." src tests package.json package-lock.json` and confirm it returns no Relay-owned matches.
- Run a package-lock check after dependency removal, for example `grep -n '"zod"\|node_modules/zod' package-lock.json`, and confirm no direct lockfile entry remains unless introduced by a transitive dependency.

## Acceptance Criteria

- All schemas previously defined with Zod in `src/main/services/schemas.ts` are implemented with Effect Schema and keep the same exported names.
- All validation call sites compile and use Effect Schema decoding instead of `.parse(...)` from Zod.
- Persisted Relay project config, ticket front matter, registry, clarification store, run log lines, and Codex event validation retain their prior defaults, passthrough/strict behavior, and timestamp handling.
- Codex ticket draft and ticket update invalid structured outputs still fail safely and are classified as invalid responses where they were before.
- `package.json` and `package-lock.json` no longer declare Zod as a direct Relay dependency, and Relay source/tests have no Zod imports or Zod API references.
- Focused schema migration tests are present and included in the local test runner.
- `npm run typecheck` and `npm test` pass.

## Assumptions / Open Questions

- "All schemas" means Relay-owned runtime validation schemas and direct Zod usage in `src/`, `tests/`, `package.json`, and `package-lock.json`; bundled artifacts under `dist/` and third-party/vendor code are out of scope.
- The Codex `outputSchema` JSON objects in `src/main/services/codex/index.ts:157-213` are not Zod schemas and should remain as JSON Schema for the Codex SDK structured output interface.
- Public shared types in `src/shared/types.ts` should not be reshaped to fit Effect Schema readonly defaults; migrated schemas should adapt to existing shared types.
- Low-level validation error wording may differ from Zod, but Relay user-facing classifications and safety behavior must remain stable.

## Implementation Notes

- Initial bounded research reported that code search stopped after 160 candidate files; follow-up local grep over `src`, `tests`, `package.json`, and `package-lock.json` found Zod usage only in the files listed above.
- `rg` was unavailable in the local shell during follow-up research, so `grep`/`find` were used instead.
- Use the installed Effect v4 beta API (`effect@4.0.0-beta.65`) already in this repository; do not vendor code from `.effect/`.
- Be careful with Effect Schema readonly output for arrays; this is the most likely TypeScript migration issue.
- Prefer small local helpers in `src/main/services/schemas.ts` over scattering parse options and default boilerplate across every schema definition.

## Research Metadata

- File inspected: .effect/packages/ai/openai/test/OpenAiSchema.test.ts - Matched terms: all, effect, schema; characters read: 8017; symbols: makeResponse, decoded, response, applyPatchItem, events, event
  Matched lines:
  - 1: import * as OpenAiSchema from "@effect/ai-openai/OpenAiSchema"
  - 2: import { assert, describe, it } from "@effect/vitest"
  - 3: import { Effect, Schema, Stream } from "effect"
- File inspected: docs/backend-effect-v4-upgrade-plan.md - Matched terms: migrate, all, schemas, zod, built, effect, schema; characters read: 12000; symbols: rather
  Matched lines:
  - 1: # Backend Effect v4 Upgrade Plan
  - 3: This is an exploration and planning document only. It does not authorize a broad backend migration in this ticket, and `.effect/` remains third-party reference source that shoul...
  - 7: The current working tree has moved beyond the older audit baseline in `docs/backend-effect-v4-audit.md`:
- File inspected: .effect/packages/ai/anthropic/test/AnthropicLanguageModel.test.ts - Matched terms: all, effect, schema; characters read: 7994; symbols: HttpClientError, HttpClientRequest, toolParams, layer, GlobTool, toolkit
  Matched lines:
  - 1: import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic"
  - 2: import { assert, describe, it } from "@effect/vitest"
  - 3: import { Effect, Layer, Redacted, Schema, Stream } from "effect"
- File inspected: .effect/packages/ai/openai/src/OpenAiSchema.ts - Matched terms: all, schemas, effect, schema; characters read: 12000; symbols: UnknownRecord, JsonObject, MessageRole, ImageDetail, IncludeEnum, MessageStatus
  Matched lines:
  - 2: * Minimal local OpenAI schemas used by the handwritten Responses client path.
  - 6: import * as Predicate from "effect/Predicate"
  - 7: import * as Schema from "effect/Schema"
- File inspected: src/main/services/schemas.ts - Matched terms: all, schemas, zod, schema; characters read: 12000; symbols: isoString, ticketPrioritySchema, ticketTypeSchema, runStatusSchema, relayActorSchema, relayEventSourceSchema
  Matched lines:
  - 1: import { z } from "zod";
  - 38: const isoString: z.ZodType<string, z.ZodTypeDef, unknown> = z.preprocess((value) => {
  - 43: export const ticketPrioritySchema = z.enum(["low", "medium", "high", "urgent"]) satisfies z.ZodType<
- File inspected: .effect/packages/ai/openai/codegen.yaml - Matched terms: all, schemas, effect, schema; characters read: 4721; symbols: of, identifier
  Matched lines:
  - 1: # yaml-language-server: $schema=../../tools/ai-codegen/codegen.schema.json
  - 11: - '[{"op":"add","path":"/components/schemas/ModelResponseProperties/properties/user/nullable","value":true}]'
  - 12: - '[{"op":"add","path":"/components/schemas/ModelResponseProperties/properties/safety_identifier/nullable","value":true}]'
- Limitation: Code search stopped after scanning 160 candidate files.

## Codex Handoff

No Codex run has been started.
