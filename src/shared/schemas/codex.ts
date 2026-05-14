import { Schema } from "effect";
import { clarificationQuestionSchema } from "./clarification";
import {
  isoString,
  mutableArray,
  numberSchema,
  passthroughStruct,
  unknownRecordSchema,
  type RelaySchema,
  type RelaySchemaTop,
  type SchemaType
} from "./common";
import { relayActorSchema, relayEventSourceSchema, runStatusSchema } from "./primitives";

export const startRunInputSchema = passthroughStruct({
  projectPath: Schema.String,
  ticketId: Schema.String,
  freshThread: Schema.optional(Schema.Boolean)
});
export type StartRunInput = SchemaType<typeof startRunInputSchema>;

export const cancelRunInputSchema = passthroughStruct({
  projectPath: Schema.String,
  ticketId: Schema.String,
  runId: Schema.String
});
export type CancelRunInput = SchemaType<typeof cancelRunInputSchema>;

export const repositoryChatInputSchema = passthroughStruct({
  projectPath: Schema.String,
  message: Schema.String,
  threadId: Schema.optional(Schema.NullOr(Schema.String))
});
export type RepositoryChatInput = SchemaType<typeof repositoryChatInputSchema>;

export const repositoryChatResponseSchema = Schema.Struct({
  threadId: Schema.String,
  message: Schema.String
});
export type RepositoryChatResponse = SchemaType<typeof repositoryChatResponseSchema>;

export const relayApprovalDecisionSchema = Schema.Literals([
  "accept",
  "acceptForSession",
  "decline",
  "cancel"
]);
export type RelayApprovalDecision = SchemaType<typeof relayApprovalDecisionSchema>;

export const codexStatusSchema = Schema.Struct({
  sdkAvailable: Schema.Boolean,
  cliAvailable: Schema.Boolean,
  cliVersion: Schema.NullOr(Schema.String),
  authenticated: Schema.NullOr(Schema.Boolean),
  message: Schema.String
});
export type CodexStatus = SchemaType<typeof codexStatusSchema>;

export const codexRunStartResultSchema = Schema.Struct({
  state: Schema.Literals(["queued", "started"]),
  runId: Schema.String,
  threadId: Schema.NullOr(Schema.String)
});
export type CodexRunStartResult = SchemaType<typeof codexRunStartResultSchema>;

export const codexRunPreflightResultSchema = Schema.Struct({
  ok: Schema.Boolean,
  errors: mutableArray(Schema.String),
  warnings: mutableArray(Schema.String),
  ticketStatus: Schema.NullOr(Schema.String),
  runStatus: Schema.NullOr(runStatusSchema),
  unansweredClarificationCount: numberSchema,
  canStartFreshThread: Schema.Boolean
});
export type CodexRunPreflightResult = SchemaType<typeof codexRunPreflightResultSchema>;

const relayCodexEventTypeSchema = Schema.Literals([
  "run.started",
  "agent.message.delta",
  "agent.message.completed",
  "command.started",
  "command.output",
  "command.completed",
  "file.change",
  "web.search",
  "todo.updated",
  "mcp.tool_call",
  "approval.requested",
  "approval.resolved",
  "ticket.status_changed",
  "clarification.requested",
  "run.completed",
  "run.failed"
]);

const relayCodexEventMembers = [
  Schema.Struct({ type: Schema.Literal("run.started"), runId: Schema.String, threadId: Schema.String, timestamp: isoString }),
  Schema.Struct({ type: Schema.Literal("agent.message.delta"), text: Schema.String, timestamp: isoString }),
  Schema.Struct({ type: Schema.Literal("agent.message.completed"), text: Schema.String, timestamp: isoString }),
  Schema.Struct({ type: Schema.Literal("command.started"), command: Schema.String, cwd: Schema.optional(Schema.String), timestamp: isoString }),
  Schema.Struct({
    type: Schema.Literal("command.output"),
    stream: Schema.Literals(["stdout", "stderr"]),
    text: Schema.String,
    timestamp: isoString
  }),
  Schema.Struct({
    type: Schema.Literal("command.completed"),
    status: Schema.Literals(["completed", "failed", "declined"]),
    timestamp: isoString
  }),
  Schema.Struct({ type: Schema.Literal("file.change"), path: Schema.String, summary: Schema.optional(Schema.String), timestamp: isoString }),
  Schema.Struct({ type: Schema.Literal("web.search"), query: Schema.String, timestamp: isoString }),
  Schema.Struct({
    type: Schema.Literal("todo.updated"),
    items: mutableArray(Schema.Struct({ text: Schema.String, completed: Schema.Boolean })),
    timestamp: isoString
  }),
  Schema.Struct({
    type: Schema.Literal("mcp.tool_call"),
    server: Schema.String,
    tool: Schema.String,
    status: Schema.Literals(["in_progress", "completed", "failed"]),
    error: Schema.optional(Schema.String),
    timestamp: isoString
  }),
  Schema.Struct({
    type: Schema.Literal("approval.requested"),
    approvalId: Schema.String,
    kind: Schema.Literals(["command", "file-change", "network", "other"]),
    payload: unknownRecordSchema,
    timestamp: isoString
  }),
  Schema.Struct({ type: Schema.Literal("approval.resolved"), approvalId: Schema.String, decision: Schema.String, timestamp: isoString }),
  Schema.Struct({
    type: Schema.Literal("ticket.status_changed"),
    fromStatus: Schema.String,
    toStatus: Schema.String,
    actor: relayActorSchema,
    source: relayEventSourceSchema,
    timestamp: isoString
  }),
  Schema.Struct({
    type: Schema.Literal("clarification.requested"),
    questions: mutableArray(clarificationQuestionSchema),
    timestamp: isoString
  }),
  Schema.Struct({
    type: Schema.Literal("run.completed"),
    finalResponse: Schema.String,
    usage: Schema.optional(Schema.Unknown),
    finalStatus: Schema.optional(runStatusSchema),
    timestamp: isoString
  }),
  Schema.Struct({
    type: Schema.Literal("run.failed"),
    message: Schema.String,
    details: Schema.optional(Schema.Unknown),
    finalStatus: Schema.optional(runStatusSchema),
    timestamp: isoString
  })
] as const;

export const relayCodexEventSchema = Schema.Union(relayCodexEventMembers);
export type RelayCodexEvent = SchemaType<typeof relayCodexEventSchema>;

const rendererRunEventFields = {
  projectPath: Schema.String,
  ticketId: Schema.String,
  runId: Schema.String
} as const;

const rendererRunEventMembers = relayCodexEventMembers.map((member) =>
  member.mapFields((fields) => ({ ...fields, ...rendererRunEventFields }))
) as unknown as readonly RelaySchemaTop[];

export const rendererRunEventSchema = Schema.Union(rendererRunEventMembers) as RelaySchema<RelayCodexEvent & {
  projectPath: string;
  ticketId: string;
  runId: string;
}>;
export type RendererRunEvent = SchemaType<typeof rendererRunEventSchema>;

export const runLogLineSchema = Schema.Struct({
  schemaVersion: numberSchema,
  timestamp: isoString,
  ticketId: Schema.String,
  runId: Schema.String,
  threadId: Schema.String,
  type: relayCodexEventTypeSchema,
  payload: unknownRecordSchema
});
export type RunLogLine = SchemaType<typeof runLogLineSchema>;

export const runUsageSummarySchema = Schema.Struct({
  inputTokens: Schema.NullOr(numberSchema),
  cachedInputTokens: Schema.NullOr(numberSchema),
  outputTokens: Schema.NullOr(numberSchema),
  reasoningOutputTokens: Schema.NullOr(numberSchema),
  totalTokens: Schema.NullOr(numberSchema)
});
export type RunUsageSummary = SchemaType<typeof runUsageSummarySchema>;

export const runSummarySchema = Schema.Struct({
  schemaVersion: numberSchema,
  ticketId: Schema.String,
  runId: Schema.String,
  threadId: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(isoString),
  endedAt: Schema.NullOr(isoString),
  durationMs: Schema.NullOr(numberSchema),
  finalStatus: Schema.NullOr(runStatusSchema),
  usage: Schema.NullOr(runUsageSummarySchema),
  eventCount: numberSchema,
  latestEventAt: Schema.NullOr(isoString)
});
export type RunSummary = SchemaType<typeof runSummarySchema>;
