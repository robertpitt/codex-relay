import { Effect } from "effect";
import type { TicketDraftStartResult, TicketSuggestionsGenerateResult } from "../../../shared/types";
import {
  cancelTicketUpdateRun,
  createDraftIntake,
  generateTicketSuggestions,
  maybeResumeTicketDraftAfterClarification,
  reconcileTicketQueueState,
  startTicketDraftRun,
  startTicketRedraftRun,
  startTicketUpdateRun,
  ticketDraftErrorToPayload
} from "../../services/codex";
import { pathResolve } from "../../services/io";
import { logError, logWarn } from "../../services/logger";
import { fromPromise, fromSync } from "../../services/runtime";
import {
  agentTicketUpdateInputSchema,
  clarificationAnswerInputSchema,
  createDraftInputSchema,
  draftIntakeInputSchema,
  epicSubticketCreateInputSchema,
  epicSubticketLinkInputSchema,
  parseSchema,
  ticketAttachmentSaveInputSchema,
  ticketCreateInputSchema,
  ticketMoveInputSchema,
  ticketRedraftInputSchema,
  ticketSaveInputSchema
} from "../../services/schemas";
import { isTicketNotFoundError, Storage } from "../../services/storage";
import { defineRelayIpcMethod, type AnyRelayIpcMethod } from "../RelayIpc";
import { relayIpcChannels } from "../channels";
import { ipcArgs, ipcObject, ipcResult, ipcString, ipcVoid } from "../schema";

export const ticketIpcMethods = [
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketIntakeDraft,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) => fromPromise(() => createDraftIntake(parseSchema(draftIntakeInputSchema, input)))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketCreateDraft,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) =>
      fromPromise(async (): Promise<TicketDraftStartResult> => {
        try {
          return { ok: true, ...(await startTicketDraftRun(parseSchema(createDraftInputSchema, input))) };
        } catch (error) {
          return { ok: false, error: ticketDraftErrorToPayload(error) };
        }
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketRedraft,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) =>
      fromPromise(async (): Promise<TicketDraftStartResult> => {
        try {
          return { ok: true, ...(await startTicketRedraftRun(parseSchema(ticketRedraftInputSchema, input))) };
        } catch (error) {
          return { ok: false, error: ticketDraftErrorToPayload(error) };
        }
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketGenerateSuggestions,
    payload: ipcArgs([ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath: string) =>
      fromPromise(async (): Promise<TicketSuggestionsGenerateResult> => {
        try {
          return { ok: true, suggestions: await generateTicketSuggestions(projectPath) };
        } catch (error) {
          return { ok: false, error: ticketDraftErrorToPayload(error) };
        }
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketCreateManual,
    payload: ipcArgs([ipcString, ipcObject]),
    result: ipcResult(),
    handler: (_event, projectPath, input) =>
      Effect.gen(function*() {
        const parsed = yield* fromSync(() => parseSchema(ticketCreateInputSchema, input));
        const storage = yield* Storage;
        return yield* storage.createTicket(projectPath, parsed);
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketCreateSubticket,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) =>
      Effect.gen(function*() {
        const parsed = yield* fromSync(() => parseSchema(epicSubticketCreateInputSchema, input));
        const storage = yield* Storage;
        return yield* storage.createSubticket(parsed);
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketLinkSubticket,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) =>
      Effect.gen(function*() {
        const parsed = yield* fromSync(() => parseSchema(epicSubticketLinkInputSchema, input));
        const storage = yield* Storage;
        return yield* storage.linkSubticket(parsed.projectPath, parsed.epicId, parsed.ticketId);
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketUnlinkSubticket,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) =>
      Effect.gen(function*() {
        const parsed = yield* fromSync(() => parseSchema(epicSubticketLinkInputSchema, input));
        const storage = yield* Storage;
        return yield* storage.unlinkSubticket(parsed.projectPath, parsed.epicId, parsed.ticketId);
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketStartAgentUpdate,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) => fromPromise(() => startTicketUpdateRun(parseSchema(agentTicketUpdateInputSchema, input)))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketCancelAgentUpdate,
    payload: ipcArgs([ipcString]),
    result: ipcVoid,
    handler: (_event, runId: string) => fromPromise(() => cancelTicketUpdateRun(runId))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketReferences,
    payload: ipcArgs([ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath: string) => Storage.use((storage) => storage.listTicketReferenceCandidates(projectPath))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketRead,
    payload: ipcArgs([ipcString, ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath: string, ticketId: string) =>
      Effect.gen(function*() {
        const resolvedProjectPath = pathResolve(projectPath);
        const storage = yield* Storage;
        return yield* storage.getTicket(resolvedProjectPath, ticketId);
      }).pipe(
        Effect.catch((error: unknown) =>
          Effect.gen(function*() {
            const resolvedProjectPath = pathResolve(projectPath);
            const meta = { projectPath: resolvedProjectPath, ticketId };
            if (isTicketNotFoundError(error)) {
              yield* fromPromise(() => logWarn("ticket:read", "ticket file missing", { ...meta, filePath: error.filePath }));
            } else {
              yield* fromPromise(() => logError("ticket:read", "ticket read failed", error, meta));
            }
            return yield* Effect.fail(error);
          })
        )
      )
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketSave,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) =>
      Effect.gen(function*() {
        const parsed = yield* fromSync(() => parseSchema(ticketSaveInputSchema, input));
        const storage = yield* Storage;
        const saved = yield* storage.saveTicket(parsed);
        return yield* fromPromise(() => reconcileTicketQueueState(parsed.projectPath, saved.frontMatter.id));
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketSaveAttachment,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) =>
      Effect.gen(function*() {
        const parsed = yield* fromSync(() => parseSchema(ticketAttachmentSaveInputSchema, input));
        const storage = yield* Storage;
        return yield* storage.saveTicketAttachment(parsed);
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketMove,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) =>
      Effect.gen(function*() {
        const parsed = yield* fromSync(() => parseSchema(ticketMoveInputSchema, input));
        const storage = yield* Storage;
        yield* storage.moveTicket(parsed);
        yield* fromPromise(() => reconcileTicketQueueState(parsed.projectPath, parsed.ticketId));
        return yield* storage.getBoard(parsed.projectPath);
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketClarifications,
    payload: ipcArgs([ipcString, ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath: string, ticketId: string) =>
      Storage.use((storage) => storage.getClarificationQuestions(projectPath, ticketId))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketAnswerClarification,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) =>
      Effect.gen(function*() {
        const parsed = yield* fromSync(() => parseSchema(clarificationAnswerInputSchema, input));
        const storage = yield* Storage;
        const answer = yield* storage.answerClarificationQuestion(parsed.projectPath, parsed.ticketId, parsed.questionId, parsed.answer);
        void maybeResumeTicketDraftAfterClarification(parsed.projectPath, parsed.ticketId).catch((error) =>
          logError("codex:draft", "auto-resume after clarification failed", error, {
            projectPath: parsed.projectPath,
            ticketId: parsed.ticketId,
            questionId: parsed.questionId
          })
        );
        return answer;
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketDelete,
    payload: ipcArgs([ipcString, ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath: string, ticketId: string) => Storage.use((storage) => storage.deleteTicket(projectPath, ticketId))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketDuplicate,
    payload: ipcArgs([ipcString, ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath: string, ticketId: string) => Storage.use((storage) => storage.duplicateTicket(projectPath, ticketId))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketRevealFile,
    payload: ipcArgs([ipcString, ipcString]),
    result: ipcVoid,
    handler: (_event, projectPath: string, ticketId: string) => Storage.use((storage) => storage.revealTicketFile(projectPath, ticketId))
  })
] satisfies ReadonlyArray<AnyRelayIpcMethod>;
