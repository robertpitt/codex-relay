import {
  approveCodexAction,
  cancelCodexRun,
  getCodexStatus,
  preflightCodexRun,
  readCodexRunEvents,
  resumeCodexRun,
  startCodexRun
} from "../../services/codex";
import { fromPromise } from "../../services/runtime";
import { relayApprovalDecisionSchema, startRunInputSchema } from "../../services/schemas";
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
    handler: (_event, input) => fromPromise(() => preflightCodexRun(startRunInputSchema.parse(input)))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.codexStartRun,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) => fromPromise(() => startCodexRun(startRunInputSchema.parse(input)))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.codexResumeRun,
    payload: ipcArgs([ipcObject]),
    result: ipcResult(),
    handler: (_event, input) => fromPromise(() => resumeCodexRun(startRunInputSchema.parse(input)))
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
      fromPromise(() => approveCodexAction(approvalId, relayApprovalDecisionSchema.parse(decision)))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.codexReadRunEvents,
    payload: ipcArgs([ipcString, ipcString, ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath: string, ticketId: string, runId: string) =>
      fromPromise(() => readCodexRunEvents(projectPath, ticketId, runId))
  })
] satisfies ReadonlyArray<AnyRelayIpcMethod>;
