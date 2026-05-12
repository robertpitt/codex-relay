import {
  approveCodexAction,
  cancelCodexRun,
  getCodexStatus,
  preflightCodexRun,
  readCodexLatestRunSummary,
  readCodexRunEvents,
  resumeCodexRun,
  sendRepositoryChatMessage,
  startCodexRun
} from "../../services/codex";
import { fromPromise } from "../../services/runtime";
import { parseSchema, relayApprovalDecisionSchema, repositoryChatInputSchema, startRunInputSchema } from "../../services/schemas";
import { defineRelayIpcMethod, type AnyRelayIpcMethod } from "../RelayIpc";
import { relayIpcChannels } from "../channels";
import { emptyArgs, ipcArgs, ipcObject, ipcResult, ipcString, ipcVoid } from "../schema";

export const codexIpcMethods = [
  defineRelayIpcMethod({
    channel: relayIpcChannels.codexStatus,
    payload: emptyArgs(),
    result: ipcResult(),
    handler: () => fromPromise(() => getCodexStatus())
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.codexPreflightRun,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) => fromPromise(() => preflightCodexRun(parseSchema(startRunInputSchema, input)))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.codexStartRun,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) => fromPromise(() => startCodexRun(parseSchema(startRunInputSchema, input)))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.codexResumeRun,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) => fromPromise(() => resumeCodexRun(parseSchema(startRunInputSchema, input)))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.codexCancelRun,
    payload: ipcArgs([ipcString]),
    result: ipcVoid,
    handler: (_event, runId: string) => fromPromise(() => cancelCodexRun(runId))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.codexApproveAction,
    payload: ipcArgs([ipcString, ipcString]),
    result: ipcVoid,
    handler: (_event, approvalId, decision) =>
      fromPromise(() => approveCodexAction(approvalId, parseSchema(relayApprovalDecisionSchema, decision)))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.codexSendRepositoryChatMessage,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) => fromPromise(() => sendRepositoryChatMessage(parseSchema(repositoryChatInputSchema, input)))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.codexReadRunEvents,
    payload: ipcArgs([ipcString, ipcString, ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath: string, ticketId: string, runId: string) =>
      fromPromise(() => readCodexRunEvents(projectPath, ticketId, runId))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.codexReadLatestRunSummary,
    payload: ipcArgs([ipcString, ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath: string, ticketId: string) => fromPromise(() => readCodexLatestRunSummary(projectPath, ticketId))
  })
] satisfies ReadonlyArray<AnyRelayIpcMethod>;
