import { Effect } from "effect";
import { ticketEndpoints } from "@shared/http";
import type { TicketDraftStartResult, TicketSuggestionsGenerateResult } from "@shared/schemas";
import { fromPromise } from "../../runtime";
import { BoardWorkflows, TicketWorkflows } from "../../workflows";
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
import { logError } from "../../runtime/Logging";
import { httpRunEventSink } from "./runEventSink";
import { route, type HttpResourceRoute } from "./types";

export const ticketRoutes = [
  route(ticketEndpoints.intakeDraft, (input) => fromPromise(() => createDraftIntake(input))),
  route(ticketEndpoints.createDraft, (input) =>
    fromPromise(async (): Promise<TicketDraftStartResult> => {
      try {
        return { ok: true, ...(await startTicketDraftRun(input, { runEventSink: httpRunEventSink() })) };
      } catch (error) {
        return { ok: false, error: ticketDraftErrorToPayload(error) };
      }
    })
  ),
  route(ticketEndpoints.redraft, (input) =>
    fromPromise(async (): Promise<TicketDraftStartResult> => {
      try {
        return { ok: true, ...(await startTicketRedraftRun(input, { runEventSink: httpRunEventSink() })) };
      } catch (error) {
        return { ok: false, error: ticketDraftErrorToPayload(error) };
      }
    })
  ),
  route(ticketEndpoints.generateSuggestions, ({ projectPath }) =>
    fromPromise(async (): Promise<TicketSuggestionsGenerateResult> => {
      try {
        return { ok: true, suggestions: await generateTicketSuggestions(projectPath) };
      } catch (error) {
        return { ok: false, error: ticketDraftErrorToPayload(error) };
      }
    })
  ),
  route(ticketEndpoints.createManual, ({ projectPath, input }) => TicketWorkflows.createManualTicket(projectPath, input)),
  route(ticketEndpoints.createSubticket, (input) => TicketWorkflows.createSubticket(input)),
  route(ticketEndpoints.linkSubticket, (input) => TicketWorkflows.linkSubticket(input)),
  route(ticketEndpoints.unlinkSubticket, (input) => TicketWorkflows.unlinkSubticket(input)),
  route(ticketEndpoints.startAgentUpdate, (input) =>
    fromPromise(() => startTicketUpdateRun(input, { runEventSink: httpRunEventSink() }))
  ),
  route(ticketEndpoints.cancelAgentUpdate, ({ runId }) => fromPromise(() => cancelTicketUpdateRun(runId))),
  route(ticketEndpoints.references, ({ projectPath }) => TicketWorkflows.listTicketReferences(projectPath)),
  route(ticketEndpoints.read, ({ projectPath, ticketId }) => TicketWorkflows.readTicket(projectPath, ticketId)),
  route(ticketEndpoints.save, (input) =>
    Effect.gen(function*() {
      const saved = yield* TicketWorkflows.saveTicket(input);
      return yield* fromPromise(() => reconcileTicketQueueState(input.projectPath, saved.frontMatter.id));
    })
  ),
  route(ticketEndpoints.saveAttachment, (input) => TicketWorkflows.saveTicketAttachment(input)),
  route(ticketEndpoints.move, (input) =>
    Effect.gen(function*() {
      yield* TicketWorkflows.moveTicket(input);
      yield* fromPromise(() => reconcileTicketQueueState(input.projectPath, input.ticketId));
      return yield* BoardWorkflows.readBoard(input.projectPath);
    })
  ),
  route(ticketEndpoints.clarifications, ({ projectPath, ticketId }) =>
    TicketWorkflows.listClarifications(projectPath, ticketId)
  ),
  route(ticketEndpoints.answerClarification, (input) =>
    Effect.gen(function*() {
      const answer = yield* TicketWorkflows.answerClarification(input);
      void maybeResumeTicketDraftAfterClarification(input.projectPath, input.ticketId, {
        runEventSink: httpRunEventSink()
      }).catch((error) =>
        logError("codex:draft", "auto-resume after clarification failed", error, {
          projectPath: input.projectPath,
          ticketId: input.ticketId,
          questionId: input.questionId
        })
      );
      return answer;
    })
  ),
  route(ticketEndpoints.delete, ({ projectPath, ticketId }) => TicketWorkflows.deleteTicket(projectPath, ticketId)),
  route(ticketEndpoints.duplicate, ({ projectPath, ticketId }) => TicketWorkflows.duplicateTicket(projectPath, ticketId)),
  route(ticketEndpoints.revealFile, ({ projectPath, ticketId }) => TicketWorkflows.revealTicketFile(projectPath, ticketId))
] satisfies ReadonlyArray<HttpResourceRoute>;
