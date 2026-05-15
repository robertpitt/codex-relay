import {
  cancelRunInputSchema,
  codexRunPreflightResultSchema,
  codexRunStartResultSchema,
  codexStatusSchema,
  rendererRunEventSchema,
  repositoryChatInputSchema,
  repositoryChatResponseSchema,
  runSummarySchema,
  startRunInputSchema
} from "../schemas";
import { arrayOf, defineEndpoint } from "./contract";
import {
  approveActionRequestSchema,
  projectTicketRequestSchema,
  projectTicketRunRequestSchema
} from "./common";
import { Schema } from "effect";

export const codexEndpoints = {
  status: defineEndpoint({
    method: "GET",
    path: "/api/codex/status",
    response: codexStatusSchema
  }),
  preflightRun: defineEndpoint({
    method: "POST",
    path: "/api/codex/preflight",
    request: { location: "body", schema: startRunInputSchema },
    response: codexRunPreflightResultSchema
  }),
  startRun: defineEndpoint({
    method: "POST",
    path: "/api/codex/runs",
    request: { location: "body", schema: startRunInputSchema },
    response: codexRunStartResultSchema
  }),
  resumeRun: defineEndpoint({
    method: "POST",
    path: "/api/codex/runs/resume",
    request: { location: "body", schema: startRunInputSchema },
    response: codexRunStartResultSchema
  }),
  cancelRun: defineEndpoint({
    method: "POST",
    path: "/api/codex/runs/cancel",
    request: { location: "body", schema: cancelRunInputSchema }
  }),
  approveAction: defineEndpoint({
    method: "POST",
    path: "/api/codex/approvals",
    request: { location: "body", schema: approveActionRequestSchema }
  }),
  sendRepositoryChatMessage: defineEndpoint({
    method: "POST",
    path: "/api/codex/repository-chat",
    request: { location: "body", schema: repositoryChatInputSchema },
    response: repositoryChatResponseSchema
  }),
  readRunEvents: defineEndpoint({
    method: "GET",
    path: "/api/codex/run-events",
    request: { location: "query", schema: projectTicketRunRequestSchema },
    response: arrayOf(rendererRunEventSchema)
  }),
  readLatestRunSummary: defineEndpoint({
    method: "GET",
    path: "/api/codex/run-summary",
    request: { location: "query", schema: projectTicketRequestSchema },
    response: Schema.NullOr(runSummarySchema)
  })
} as const;
