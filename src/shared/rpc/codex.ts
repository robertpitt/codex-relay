import { Schema } from "effect";
import { Rpc } from "effect/unstable/rpc";
import {
  cancelRunInputSchema,
  codexRunPreflightResultSchema,
  codexRunStartResultSchema,
  codexStatusSchema,
  relayRpcErrorSchema,
  rendererRunEventSchema,
  repositoryChatInputSchema,
  repositoryChatResponseSchema,
  runSummarySchema,
  startRunInputSchema,
  type RelaySchema,
  type RendererRunEvent,
  type RunSummary
} from "../schemas";
import { approveActionPayload, arrayOf, projectTicketPayload, projectTicketRunPayload } from "./common";
import { relayRpcTags } from "./tags";

export class CodexStatus extends Rpc.make(relayRpcTags.codexStatus, {
  success: codexStatusSchema,
  error: relayRpcErrorSchema
}) {}

export class CodexPreflightRun extends Rpc.make(relayRpcTags.codexPreflightRun, {
  payload: startRunInputSchema,
  success: codexRunPreflightResultSchema,
  error: relayRpcErrorSchema
}) {}

export class CodexStartRun extends Rpc.make(relayRpcTags.codexStartRun, {
  payload: startRunInputSchema,
  success: codexRunStartResultSchema,
  error: relayRpcErrorSchema
}) {}

export class CodexResumeRun extends Rpc.make(relayRpcTags.codexResumeRun, {
  payload: startRunInputSchema,
  success: codexRunStartResultSchema,
  error: relayRpcErrorSchema
}) {}

export class CodexCancelRun extends Rpc.make(relayRpcTags.codexCancelRun, {
  payload: cancelRunInputSchema,
  success: Schema.Void,
  error: relayRpcErrorSchema
}) {}

export class CodexApproveAction extends Rpc.make(relayRpcTags.codexApproveAction, {
  payload: approveActionPayload,
  success: Schema.Void,
  error: relayRpcErrorSchema
}) {}

export class CodexSendRepositoryChatMessage extends Rpc.make(relayRpcTags.codexSendRepositoryChatMessage, {
  payload: repositoryChatInputSchema,
  success: repositoryChatResponseSchema,
  error: relayRpcErrorSchema
}) {}

export class CodexReadRunEvents extends Rpc.make(relayRpcTags.codexReadRunEvents, {
  payload: projectTicketRunPayload,
  success: arrayOf<RendererRunEvent>(rendererRunEventSchema),
  error: relayRpcErrorSchema
}) {}

export class CodexReadLatestRunSummary extends Rpc.make(relayRpcTags.codexReadLatestRunSummary, {
  payload: projectTicketPayload,
  success: Schema.NullOr(runSummarySchema) as RelaySchema<RunSummary | null>,
  error: relayRpcErrorSchema
}) {}
