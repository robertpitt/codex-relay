import { Effect, Layer } from "effect";
import { relayRpcGroup, type RelayRpcError } from "@shared/rpc";
import type { TicketDraftStartResult, TicketSuggestionsGenerateResult } from "@shared/schemas";
import { errorMessage } from "../../domain/errors";
import { fromPromise } from "../../runtime";
import { BoardWorkflows, ProjectWorkflows, TicketWorkflows } from "../../workflows";
import {
  approveCodexAction,
  cancelCodexRun,
  cancelTicketUpdateRun,
  createDraftIntake,
  generateTicketSuggestions,
  getCodexStatus,
  maybeResumeTicketDraftAfterClarification,
  preflightCodexRun,
  readCodexLatestRunSummary,
  readCodexRunEvents,
  reconcileTicketQueueState,
  resumeCodexRun,
  sendRepositoryChatMessage,
  startCodexRun,
  startTicketDraftRun,
  startTicketRedraftRun,
  startTicketUpdateRun,
  ticketDraftErrorToPayload
} from "../codex";
import { logError } from "../logger";
import type { RendererRunEventSink } from "../run-events";
import { RelayWindow } from "../window/RelayWindow";

export { openProjectInEditor, projectEditorCommands } from "../../workflows/projects";

export const relayRpcErrorFromUnknown = (error: unknown): RelayRpcError => ({
  code: "relay_rpc_error",
  message: errorMessage(error)
});

const withRpcError = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, RelayRpcError, R> =>
  effect.pipe(Effect.mapError(relayRpcErrorFromUnknown));

const rendererRunEventSink = RelayWindow.use((relayWindow) =>
  Effect.succeed<RendererRunEventSink>({
    emit: (event) => Effect.runPromise(relayWindow.sendRunEvent(event))
  })
);

export const RelayRpcHandlersLive = relayRpcGroup.toLayer({
  "projects:list": () => withRpcError(ProjectWorkflows.listProjects()),
  "projects:addFolder": () => withRpcError(ProjectWorkflows.addProjectFolder()),
  "projects:removeFromSidebar": ({ projectPath }) => withRpcError(ProjectWorkflows.removeProjectFromSidebar(projectPath)),
  "projects:read": ({ projectPath }) => withRpcError(ProjectWorkflows.readProject(projectPath)),
  "projects:gitMetadata": ({ projectPath, options }) =>
    withRpcError(ProjectWorkflows.readProjectGitMetadata(projectPath, options ?? {})),
  "projects:revealInFinder": ({ projectPath }) => withRpcError(ProjectWorkflows.revealProjectInFinder(projectPath)),
  "projects:openInEditor": (input) => withRpcError(ProjectWorkflows.openProjectInEditorWorkflow(input)),

  "board:read": ({ projectPath }) => withRpcError(BoardWorkflows.readBoard(projectPath)),

  "ticket:intakeDraft": (input) => withRpcError(fromPromise(() => createDraftIntake(input))),
  "ticket:createDraft": (input) =>
    withRpcError(
      Effect.gen(function*() {
        const runEventSink = yield* rendererRunEventSink;
        return yield* fromPromise(async (): Promise<TicketDraftStartResult> => {
          try {
            return { ok: true, ...(await startTicketDraftRun(input, { runEventSink })) };
          } catch (error) {
            return { ok: false, error: ticketDraftErrorToPayload(error) };
          }
        });
      })
    ),
  "ticket:redraft": (input) =>
    withRpcError(
      Effect.gen(function*() {
        const runEventSink = yield* rendererRunEventSink;
        return yield* fromPromise(async (): Promise<TicketDraftStartResult> => {
          try {
            return { ok: true, ...(await startTicketRedraftRun(input, { runEventSink })) };
          } catch (error) {
            return { ok: false, error: ticketDraftErrorToPayload(error) };
          }
        });
      })
    ),
  "ticket:generateSuggestions": ({ projectPath }) =>
    withRpcError(
      fromPromise(async (): Promise<TicketSuggestionsGenerateResult> => {
        try {
          return { ok: true, suggestions: await generateTicketSuggestions(projectPath) };
        } catch (error) {
          return { ok: false, error: ticketDraftErrorToPayload(error) };
        }
      })
    ),
  "ticket:createManual": ({ projectPath, input }) =>
    withRpcError(TicketWorkflows.createManualTicket(projectPath, input)),
  "ticket:createSubticket": (input) => withRpcError(TicketWorkflows.createSubticket(input)),
  "ticket:linkSubticket": (input) => withRpcError(TicketWorkflows.linkSubticket(input)),
  "ticket:unlinkSubticket": (input) => withRpcError(TicketWorkflows.unlinkSubticket(input)),
  "ticket:startAgentUpdate": (input) =>
    withRpcError(
      Effect.gen(function*() {
        const runEventSink = yield* rendererRunEventSink;
        return yield* fromPromise(() => startTicketUpdateRun(input, { runEventSink }));
      })
    ),
  "ticket:cancelAgentUpdate": ({ runId }) => withRpcError(fromPromise(() => cancelTicketUpdateRun(runId))),
  "ticket:references": ({ projectPath }) => withRpcError(TicketWorkflows.listTicketReferences(projectPath)),
  "ticket:read": ({ projectPath, ticketId }) => withRpcError(TicketWorkflows.readTicket(projectPath, ticketId)),
  "ticket:save": (input) =>
    withRpcError(
      Effect.gen(function*() {
        const saved = yield* TicketWorkflows.saveTicket(input);
        return yield* fromPromise(() => reconcileTicketQueueState(input.projectPath, saved.frontMatter.id));
      })
    ),
  "ticket:saveAttachment": (input) =>
    withRpcError(TicketWorkflows.saveTicketAttachment(input)),
  "ticket:move": (input) =>
    withRpcError(
      Effect.gen(function*() {
        yield* TicketWorkflows.moveTicket(input);
        yield* fromPromise(() => reconcileTicketQueueState(input.projectPath, input.ticketId));
        return yield* BoardWorkflows.readBoard(input.projectPath);
      })
    ),
  "ticket:clarifications": ({ projectPath, ticketId }) =>
    withRpcError(TicketWorkflows.listClarifications(projectPath, ticketId)),
  "ticket:answerClarification": (input) =>
    withRpcError(
      Effect.gen(function*() {
        const answer = yield* TicketWorkflows.answerClarification(input);
        const runEventSink = yield* rendererRunEventSink;
        void maybeResumeTicketDraftAfterClarification(input.projectPath, input.ticketId, { runEventSink }).catch((error) =>
          logError("codex:draft", "auto-resume after clarification failed", error, {
            projectPath: input.projectPath,
            ticketId: input.ticketId,
            questionId: input.questionId
          })
        );
        return answer;
      })
    ),
  "ticket:delete": ({ projectPath, ticketId }) =>
    withRpcError(TicketWorkflows.deleteTicket(projectPath, ticketId)),
  "ticket:duplicate": ({ projectPath, ticketId }) =>
    withRpcError(TicketWorkflows.duplicateTicket(projectPath, ticketId)),
  "ticket:revealFile": ({ projectPath, ticketId }) =>
    withRpcError(TicketWorkflows.revealTicketFile(projectPath, ticketId)),

  "codex:status": () => withRpcError(fromPromise(() => getCodexStatus())),
  "codex:preflightRun": (input) => withRpcError(fromPromise(() => preflightCodexRun(input))),
  "codex:startRun": (input) =>
    withRpcError(
      Effect.gen(function*() {
        const runEventSink = yield* rendererRunEventSink;
        return yield* fromPromise(() => startCodexRun(input, { runEventSink }));
      })
    ),
  "codex:resumeRun": (input) =>
    withRpcError(
      Effect.gen(function*() {
        const runEventSink = yield* rendererRunEventSink;
        return yield* fromPromise(() => resumeCodexRun(input, { runEventSink }));
      })
    ),
  "codex:cancelRun": (input) => withRpcError(fromPromise(() => cancelCodexRun(input))),
  "codex:approveAction": ({ approvalId, decision }) =>
    withRpcError(fromPromise(() => approveCodexAction(approvalId, decision))),
  "codex:sendRepositoryChatMessage": (input) =>
    withRpcError(fromPromise(() => sendRepositoryChatMessage(input))),
  "codex:readRunEvents": ({ projectPath, ticketId, runId }) =>
    withRpcError(fromPromise(() => readCodexRunEvents(projectPath, ticketId, runId))),
  "codex:readLatestRunSummary": ({ projectPath, ticketId }) =>
    withRpcError(fromPromise(() => readCodexLatestRunSummary(projectPath, ticketId)))
});

export const RelayRpcHandlersLayer = Layer.mergeAll(RelayRpcHandlersLive);
