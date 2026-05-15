import { codexEndpoints } from "@shared/http";
import { fromPromise } from "../../runtime";
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
import { httpRunEventSink } from "./runEventSink";
import { route, type HttpResourceRoute } from "./types";

export const codexRoutes = [
  route(codexEndpoints.status, () => fromPromise(() => getCodexStatus())),
  route(codexEndpoints.preflightRun, (input) => fromPromise(() => preflightCodexRun(input))),
  route(codexEndpoints.startRun, (input) => fromPromise(() => startCodexRun(input, { runEventSink: httpRunEventSink() }))),
  route(codexEndpoints.resumeRun, (input) => fromPromise(() => resumeCodexRun(input, { runEventSink: httpRunEventSink() }))),
  route(codexEndpoints.cancelRun, (input) => fromPromise(() => cancelCodexRun(input))),
  route(codexEndpoints.approveAction, ({ approvalId, decision }) =>
    fromPromise(() => approveCodexAction(approvalId, decision))
  ),
  route(codexEndpoints.sendRepositoryChatMessage, (input) => fromPromise(() => sendRepositoryChatMessage(input))),
  route(codexEndpoints.readRunEvents, ({ projectPath, ticketId, runId }) =>
    fromPromise(() => readCodexRunEvents(projectPath, ticketId, runId))
  ),
  route(codexEndpoints.readLatestRunSummary, ({ projectPath, ticketId }) =>
    fromPromise(() => readCodexLatestRunSummary(projectPath, ticketId))
  )
] satisfies ReadonlyArray<HttpResourceRoute>;
