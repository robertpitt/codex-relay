import { Schema } from "effect";
import { Workflow } from "effect/unstable/workflow";

export const RELAY_EXTERNAL_JOB_WORKFLOW_NAME = "relay.externalJob";

export const ExternalJobWorkflowPayloadSchema = Schema.Struct({
  projectPath: Schema.String,
  commandType: Schema.Literals([
    "codex.implementation",
    "codex.ticketDraft",
    "codex.ticketUpdate",
    "git.sync",
    "remote.sync",
    "worker.dispatch"
  ]),
  idempotencyKey: Schema.String,
  runId: Schema.optional(Schema.NullOr(Schema.String)),
  ticketId: Schema.optional(Schema.NullOr(Schema.String)),
  payload: Schema.Record(Schema.String, Schema.Unknown)
});

export type ExternalJobWorkflowPayload = typeof ExternalJobWorkflowPayloadSchema.Type;

export const RelayExternalJobWorkflow = Workflow.make({
  name: RELAY_EXTERNAL_JOB_WORKFLOW_NAME,
  payload: ExternalJobWorkflowPayloadSchema,
  idempotencyKey: (payload) => `${payload.projectPath}:${payload.commandType}:${payload.idempotencyKey}`,
  success: Schema.Unknown,
  error: Schema.Unknown
});
