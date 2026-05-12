import type { TicketDraftStartResult } from "../../../shared/types";
import {
  cancelTicketUpdateRun,
  maybeResumeTicketDraftAfterClarification,
  reconcileTicketQueueState,
  startTicketDraftRun,
  startTicketUpdateRun,
  ticketDraftErrorToPayload
} from "../../services/codex";
import { pathResolve } from "../../services/io";
import { logError, logWarn } from "../../services/logger";
import { fromPromise } from "../../services/runtime";
import {
  agentTicketUpdateInputSchema,
  clarificationAnswerInputSchema,
  createDraftInputSchema,
  epicSubticketCreateInputSchema,
  epicSubticketLinkInputSchema,
  parseSchema,
  ticketAttachmentSaveInputSchema,
  ticketCreateInputSchema,
  ticketMoveInputSchema,
  ticketSaveInputSchema
} from "../../services/schemas";
import {
  answerClarificationQuestion,
  createSubticket,
  createTicket,
  deleteTicket,
  duplicateTicket,
  isTicketNotFoundError,
  listTicketReferenceCandidates,
  linkSubticket,
  moveTicket,
  readBoard,
  readClarificationQuestions,
  readTicket,
  revealTicketFile,
  saveTicketAttachment,
  saveTicket,
  unlinkSubticket
} from "../../services/storage";
import { defineRelayIpcMethod, type AnyRelayIpcMethod } from "../RelayIpc";
import { relayIpcChannels } from "../channels";
import { ipcArgs, ipcObject, ipcResult, ipcString, ipcVoid } from "../schema";

export const ticketIpcMethods = [
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
    channel: relayIpcChannels.ticketCreateManual,
    payload: ipcArgs([ipcString, ipcObject]),
    result: ipcResult(),
    handler: (_event, projectPath, input) => fromPromise(() => createTicket(projectPath, parseSchema(ticketCreateInputSchema, input)))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketCreateSubticket,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) => fromPromise(() => createSubticket(parseSchema(epicSubticketCreateInputSchema, input)))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketLinkSubticket,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) =>
      fromPromise(() => {
        const parsed = parseSchema(epicSubticketLinkInputSchema, input);
        return linkSubticket(parsed.projectPath, parsed.epicId, parsed.ticketId);
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketUnlinkSubticket,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) =>
      fromPromise(() => {
        const parsed = parseSchema(epicSubticketLinkInputSchema, input);
        return unlinkSubticket(parsed.projectPath, parsed.epicId, parsed.ticketId);
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
    handler: (_event, projectPath: string) => fromPromise(() => listTicketReferenceCandidates(projectPath))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketRead,
    payload: ipcArgs([ipcString, ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath: string, ticketId: string) =>
      fromPromise(async () => {
        const resolvedProjectPath = pathResolve(projectPath);
        try {
          return await readTicket(resolvedProjectPath, ticketId);
        } catch (error) {
          const meta = { projectPath: resolvedProjectPath, ticketId };
          if (isTicketNotFoundError(error)) {
            await logWarn("ticket:read", "ticket file missing", { ...meta, filePath: error.filePath });
          } else {
            await logError("ticket:read", "ticket read failed", error, meta);
          }
          throw error;
        }
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketSave,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) =>
      fromPromise(async () => {
        const parsed = parseSchema(ticketSaveInputSchema, input);
        const saved = await saveTicket(parsed);
        return reconcileTicketQueueState(parsed.projectPath, saved.frontMatter.id);
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketSaveAttachment,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) => fromPromise(() => saveTicketAttachment(parseSchema(ticketAttachmentSaveInputSchema, input)))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketMove,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) =>
      fromPromise(async () => {
        const parsed = parseSchema(ticketMoveInputSchema, input);
        await moveTicket(parsed);
        await reconcileTicketQueueState(parsed.projectPath, parsed.ticketId);
        return readBoard(parsed.projectPath);
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketClarifications,
    payload: ipcArgs([ipcString, ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath: string, ticketId: string) => fromPromise(() => readClarificationQuestions(projectPath, ticketId))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketAnswerClarification,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) =>
      fromPromise(async () => {
        const parsed = parseSchema(clarificationAnswerInputSchema, input);
        const answer = await answerClarificationQuestion(parsed.projectPath, parsed.ticketId, parsed.questionId, parsed.answer);
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
    handler: (_event, projectPath: string, ticketId: string) => fromPromise(() => deleteTicket(projectPath, ticketId))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketDuplicate,
    payload: ipcArgs([ipcString, ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath: string, ticketId: string) => fromPromise(() => duplicateTicket(projectPath, ticketId))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.ticketRevealFile,
    payload: ipcArgs([ipcString, ipcString]),
    result: ipcVoid,
    handler: (_event, projectPath: string, ticketId: string) => fromPromise(() => revealTicketFile(projectPath, ticketId))
  })
] satisfies ReadonlyArray<AnyRelayIpcMethod>;
