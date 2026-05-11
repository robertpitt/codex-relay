import { Effect, Option, Schema, SchemaGetter } from "effect";
import * as SchemaIssue from "effect/SchemaIssue";
import * as SchemaParser from "effect/SchemaParser";
import type {
  AgentTicketUpdate,
  AgentTicketUpdateInput,
  AppRegistry,
  ClarificationAnswerInput,
  ClarificationQuestion,
  ClarificationQuestionStore,
  CreateDraftInput,
  EpicSubticketCreateInput,
  EpicSubticketLinkInput,
  GitMetadataOptions,
  ProjectConfig,
  ProjectSettings,
  RelayActor,
  RelayApprovalDecision,
  RelayCodexEvent,
  RelayColumn,
  RelayEventSource,
  RunLogLine,
  RunStatus,
  StartRunInput,
  SubticketCreateInput,
  TicketCreateInput,
  TicketDraft,
  TicketDraftResearch,
  TicketDraftResearchFile,
  TicketDraftResearchLimits,
  TicketDraftResearchUrl,
  TicketDraftSubticket,
  TicketFrontMatter,
  TicketMoveInput,
  TicketPriority,
  TicketRecord,
  TicketSaveInput,
  TicketType
} from "../../shared/types";

type RelaySchema<T> = Schema.Schema<T>;

const nonEmptyString = Schema.String.check(Schema.isMinLength(1));
const numberSchema = Schema.Number.check(
  Schema.makeFilter((value) => (Number.isNaN(value) ? "Expected number, got NaN" : undefined))
);
const unknownRecordSchema = Schema.Record(Schema.String, Schema.Unknown) as RelaySchema<Record<string, unknown>>;

const mutableArray = <S extends Schema.Top>(schema: S) => Schema.mutable(Schema.Array(schema));
const withDefault = <S extends Schema.Top>(schema: S, getDefault: () => S["Encoded"]) =>
  schema.pipe(Schema.withDecodingDefault(Effect.sync(getDefault)));
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const unexpectedKeyIssue = (key: string, value: unknown): SchemaIssue.Issue =>
  new SchemaIssue.Pointer(
    [key],
    new SchemaIssue.InvalidValue(Option.some(value), { message: `Unexpected key with value ${String(value)}` })
  );

const passthroughStruct = <const Fields extends Schema.Struct.Fields>(fields: Fields) => {
  const struct = Schema.Struct(fields);
  const fieldNames = new Set(Object.keys(fields));
  return Schema.declareConstructor<Schema.Struct.Type<Fields> & Record<string, unknown>, unknown>()(
    [struct],
    ([structCodec]) =>
      (input, _self, options) =>
        SchemaParser.decodeUnknownEffect(structCodec)(input, options).pipe(
          Effect.map((decoded) => {
            if (!isRecord(input)) return decoded as Schema.Struct.Type<Fields> & Record<string, unknown>;
            const extras = Object.fromEntries(Object.entries(input).filter(([key]) => !fieldNames.has(key)));
            return { ...extras, ...decoded };
          })
        )
  );
};

const strictStruct = <const Fields extends Schema.Struct.Fields>(fields: Fields) => {
  const struct = Schema.Struct(fields);
  const fieldNames = new Set(Object.keys(fields));
  return Schema.declareConstructor<Schema.Struct.Type<Fields>, unknown>()(
    [struct],
    ([structCodec]) =>
      (input, _self, options) =>
        SchemaParser.decodeUnknownEffect(structCodec)(input, options).pipe(
          Effect.flatMap((decoded) => {
            if (isRecord(input)) {
              const unexpectedKey = Object.keys(input).find((key) => !fieldNames.has(key));
              if (unexpectedKey) return Effect.fail(unexpectedKeyIssue(unexpectedKey, input[unexpectedKey]));
            }
            return Effect.succeed(decoded);
          })
        )
  );
};

const dateToIsoString = Schema.Date.pipe(
  Schema.decodeTo(nonEmptyString, {
    decode: SchemaGetter.transform((value: Date) => value.toISOString()),
    encode: SchemaGetter.transform((value: string) => new Date(value))
  })
);

const isoString = Schema.Union([nonEmptyString, dateToIsoString]) satisfies RelaySchema<string>;

const defaultStringArray = () => [] as string[];
const nullableStringWithDefault = () => withDefault(Schema.NullOr(Schema.String), () => null);
const stringArrayWithDefault = () => withDefault(mutableArray(Schema.String), defaultStringArray);

const isSchemaIssue = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "~effect/SchemaIssue/Issue" in value;

const normalizeSchemaError = (error: unknown): unknown => {
  if (Schema.isSchemaError(error)) return error;
  if (error instanceof Error && isSchemaIssue(error.cause)) {
    return new Schema.SchemaError(error.cause as ConstructorParameters<typeof Schema.SchemaError>[0]);
  }
  return error;
};

export const parseSchema = <A>(schema: RelaySchema<A>, input: unknown): A => {
  try {
    return Schema.decodeUnknownSync(schema as Schema.Decoder<A>)(input);
  } catch (error) {
    throw normalizeSchemaError(error);
  }
};

export const isRelaySchemaError = (error: unknown): error is Schema.SchemaError => Schema.isSchemaError(error);

export const ticketPrioritySchema: RelaySchema<TicketPriority> = Schema.Literals(["low", "medium", "high", "urgent"]);

export const ticketTypeSchema: RelaySchema<TicketType> = Schema.Literals(["task", "epic"]);

export const runStatusSchema: RelaySchema<RunStatus> = Schema.Literals([
  "idle",
  "drafting",
  "draft_failed",
  "draft_complete",
  "running",
  "blocked",
  "failed",
  "completed",
  "cancelled"
]);

export const relayActorSchema: RelaySchema<RelayActor> = Schema.Literals(["user", "codex", "system"]);

export const relayEventSourceSchema: RelaySchema<RelayEventSource> = Schema.Literals([
  "manual_board",
  "manual_ticket_edit",
  "draft_generation",
  "agent_execution",
  "clarification_ui",
  "system_reconciliation"
]);

export const relayColumnSchema: RelaySchema<RelayColumn> = Schema.Struct({
  id: nonEmptyString,
  name: nonEmptyString,
  position: numberSchema,
  terminal: Schema.Boolean
});

export const projectSettingsSchema: RelaySchema<ProjectSettings> = Schema.Struct({
  defaultModel: Schema.NullOr(Schema.String),
  defaultApprovalPolicy: Schema.Literals(["untrusted", "on-request", "never"]),
  defaultSandboxMode: Schema.Literals(["read-only", "workspace-write", "danger-full-access"]),
  allowNonGitCodexRuns: Schema.Boolean,
  ticketDraftingEnabled: Schema.Boolean,
  codexExecutionEnabled: Schema.Boolean
});

export const projectConfigSchema: RelaySchema<ProjectConfig> = passthroughStruct({
  schemaVersion: Schema.Literal(1),
  projectId: nonEmptyString,
  name: nonEmptyString,
  createdAt: isoString,
  updatedAt: isoString,
  columns: mutableArray(relayColumnSchema).check(Schema.isMinLength(1)),
  settings: projectSettingsSchema
});

export const ticketFrontMatterSchema: RelaySchema<TicketFrontMatter> = passthroughStruct({
  schemaVersion: Schema.Literal(1),
  id: nonEmptyString,
  title: nonEmptyString,
  ticketType: withDefault(ticketTypeSchema, () => "task" as const),
  status: nonEmptyString,
  position: numberSchema,
  priority: ticketPrioritySchema,
  labels: stringArrayWithDefault(),
  parentEpicId: nullableStringWithDefault(),
  subticketIds: stringArrayWithDefault(),
  blockedByIds: stringArrayWithDefault(),
  createdAt: isoString,
  updatedAt: isoString,
  codexThreadId: nullableStringWithDefault(),
  runStatus: runStatusSchema,
  lastRunId: nullableStringWithDefault()
});

export const ticketRecordSchema: RelaySchema<TicketRecord> = Schema.Struct({
  frontMatter: ticketFrontMatterSchema,
  markdown: Schema.String,
  filePath: Schema.String
});

export const appRegistrySchema: RelaySchema<AppRegistry> = passthroughStruct({
  schemaVersion: Schema.Literal(1),
  projects: mutableArray(
    Schema.Struct({
      path: nonEmptyString,
      pinned: Schema.Boolean,
      lastOpenedAt: isoString,
      sidebarPosition: numberSchema
    })
  ),
  ui: Schema.Struct({
    lastProjectPath: Schema.NullOr(Schema.String),
    theme: Schema.Literals(["system", "light", "dark"])
  })
});

const defaultTicketDraftResearchLimits = (): TicketDraftResearchLimits => ({
  maxResearchMs: 0,
  maxUrls: 0,
  maxUrlFetchMs: 0,
  maxUrlContentChars: 0,
  maxFilesToScan: 0,
  maxFilesToRead: 0,
  maxFileReadChars: 0,
  maxMatchesPerFile: 0
});

const defaultTicketDraftResearch = (): TicketDraftResearch => ({
  generatedAt: "",
  checkedUrls: [],
  inspectedFiles: [],
  limitations: [],
  limits: defaultTicketDraftResearchLimits()
});

const ticketDraftResearchLimitsSchema: RelaySchema<TicketDraftResearchLimits> = Schema.Struct({
  maxResearchMs: numberSchema,
  maxUrls: numberSchema,
  maxUrlFetchMs: numberSchema,
  maxUrlContentChars: numberSchema,
  maxFilesToScan: numberSchema,
  maxFilesToRead: numberSchema,
  maxFileReadChars: numberSchema,
  maxMatchesPerFile: numberSchema
});

const ticketDraftResearchUrlSchema: RelaySchema<TicketDraftResearchUrl> = Schema.Struct({
  url: Schema.String,
  status: Schema.Literals(["fetched", "failed", "skipped"]),
  title: nullableStringWithDefault(),
  reason: nullableStringWithDefault(),
  charactersRead: withDefault(numberSchema, () => 0)
});

const ticketDraftResearchFileSchema: RelaySchema<TicketDraftResearchFile> = Schema.Struct({
  path: Schema.String,
  reason: Schema.String,
  symbols: stringArrayWithDefault(),
  matches: stringArrayWithDefault(),
  charactersRead: withDefault(numberSchema, () => 0)
});

const ticketDraftResearchSchema: RelaySchema<TicketDraftResearch> = Schema.Struct({
  generatedAt: withDefault(Schema.String, () => ""),
  checkedUrls: withDefault(mutableArray(ticketDraftResearchUrlSchema), () => []),
  inspectedFiles: withDefault(mutableArray(ticketDraftResearchFileSchema), () => []),
  limitations: stringArrayWithDefault(),
  limits: withDefault(ticketDraftResearchLimitsSchema, defaultTicketDraftResearchLimits)
});

const ticketDraftBaseFields = {
  title: nonEmptyString,
  priority: ticketPrioritySchema,
  labels: stringArrayWithDefault(),
  context: withDefault(Schema.String, () => ""),
  researchFindings: stringArrayWithDefault(),
  requirements: stringArrayWithDefault(),
  implementationPlan: stringArrayWithDefault(),
  testPlan: stringArrayWithDefault(),
  acceptanceCriteria: stringArrayWithDefault(),
  clarificationQuestions: stringArrayWithDefault(),
  assumptions: stringArrayWithDefault(),
  implementationNotes: stringArrayWithDefault()
} as const;

const ticketDraftBaseSchema: RelaySchema<TicketDraftSubticket> = strictStruct(ticketDraftBaseFields);

export const ticketDraftSchema: RelaySchema<TicketDraft> = strictStruct({
  ...ticketDraftBaseFields,
  draftState: withDefault(Schema.Literals(["ready", "needs_clarification"]), () => "ready" as const),
  blockingClarificationQuestions: stringArrayWithDefault(),
  ticketType: withDefault(ticketTypeSchema, () => "task" as const),
  subtickets: withDefault(mutableArray(ticketDraftBaseSchema), () => []),
  research: withDefault(ticketDraftResearchSchema, defaultTicketDraftResearch)
}).check(
  Schema.makeFilter<TicketDraft>((draft) =>
    draft.ticketType === "task" && draft.subtickets.length > 0
      ? { path: ["subtickets"], issue: "Only epic ticket drafts can contain subtickets." }
      : undefined
  )
);

export const agentTicketUpdateSchema: RelaySchema<AgentTicketUpdate> = strictStruct({
  title: nonEmptyString,
  priority: ticketPrioritySchema,
  labels: stringArrayWithDefault(),
  markdown: nonEmptyString,
  clarificationQuestions: stringArrayWithDefault()
});

export const clarificationQuestionSchema: RelaySchema<ClarificationQuestion> = passthroughStruct({
  id: nonEmptyString,
  ticketId: nonEmptyString,
  question: nonEmptyString,
  answerType: Schema.Literal("text"),
  answer: nullableStringWithDefault(),
  createdAt: isoString,
  updatedAt: isoString,
  answeredAt: withDefault(Schema.NullOr(isoString), () => null),
  createdBy: relayActorSchema,
  source: relayEventSourceSchema,
  runId: nullableStringWithDefault(),
  codexThreadId: nullableStringWithDefault()
});

export const clarificationStoreSchema: RelaySchema<ClarificationQuestionStore> = passthroughStruct({
  schemaVersion: Schema.Literal(1),
  ticketId: nonEmptyString,
  questions: withDefault(mutableArray(clarificationQuestionSchema), () => [])
});

export const gitMetadataOptionsSchema: RelaySchema<GitMetadataOptions> = passthroughStruct({
  force: Schema.optional(Schema.Boolean)
});

const subticketCreateInputFields = {
  title: Schema.String,
  priority: ticketPrioritySchema,
  labels: stringArrayWithDefault(),
  markdown: Schema.String,
  status: Schema.optional(Schema.String),
  blockedByIds: Schema.optional(mutableArray(Schema.String))
} as const;

export const subticketCreateInputSchema: RelaySchema<SubticketCreateInput> = passthroughStruct(subticketCreateInputFields);

export const ticketCreateInputSchema: RelaySchema<TicketCreateInput> = passthroughStruct({
  ...subticketCreateInputFields,
  ticketType: Schema.optional(ticketTypeSchema),
  parentEpicId: Schema.optional(Schema.NullOr(Schema.String)),
  subticketIds: Schema.optional(mutableArray(Schema.String)),
  subtickets: Schema.optional(mutableArray(subticketCreateInputSchema))
});

export const epicSubticketCreateInputSchema: RelaySchema<EpicSubticketCreateInput> = passthroughStruct({
  projectPath: Schema.String,
  epicId: Schema.String,
  ticket: subticketCreateInputSchema
});

export const epicSubticketLinkInputSchema: RelaySchema<EpicSubticketLinkInput> = passthroughStruct({
  projectPath: Schema.String,
  epicId: Schema.String,
  ticketId: Schema.String
});

export const ticketSaveInputSchema: RelaySchema<TicketSaveInput> = passthroughStruct({
  projectPath: Schema.String,
  ticket: ticketRecordSchema
});

export const ticketMoveInputSchema: RelaySchema<TicketMoveInput> = passthroughStruct({
  projectPath: Schema.String,
  ticketId: Schema.String,
  targetStatus: Schema.String,
  beforeTicketId: Schema.optional(Schema.NullOr(Schema.String)),
  afterTicketId: Schema.optional(Schema.NullOr(Schema.String))
});

export const clarificationAnswerInputSchema: RelaySchema<ClarificationAnswerInput> = passthroughStruct({
  projectPath: Schema.String,
  ticketId: Schema.String,
  questionId: Schema.String,
  answer: Schema.String
});

export const createDraftInputSchema: RelaySchema<CreateDraftInput> = passthroughStruct({
  projectPath: Schema.String,
  idea: Schema.String,
  preferredTicketType: Schema.optional(ticketTypeSchema),
  ticketId: Schema.optional(Schema.String)
});

export const startRunInputSchema: RelaySchema<StartRunInput> = passthroughStruct({
  projectPath: Schema.String,
  ticketId: Schema.String,
  freshThread: Schema.optional(Schema.Boolean)
});

export const agentTicketUpdateInputSchema: RelaySchema<AgentTicketUpdateInput> = passthroughStruct({
  projectPath: Schema.String,
  ticketId: Schema.String,
  request: Schema.String
});

export const relayApprovalDecisionSchema: RelaySchema<RelayApprovalDecision> = Schema.Literals([
  "accept",
  "acceptForSession",
  "decline",
  "cancel"
]);

const relayCodexEventTypeSchema: RelaySchema<RelayCodexEvent["type"]> = Schema.Literals([
  "run.started",
  "agent.message.delta",
  "agent.message.completed",
  "command.started",
  "command.output",
  "command.completed",
  "file.change",
  "web.search",
  "approval.requested",
  "approval.resolved",
  "ticket.status_changed",
  "clarification.requested",
  "run.completed",
  "run.failed"
]);

export const relayCodexEventSchema: RelaySchema<RelayCodexEvent> = Schema.Union([
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
]);

export const runLogLineSchema: RelaySchema<RunLogLine> = Schema.Struct({
  schemaVersion: numberSchema,
  timestamp: isoString,
  ticketId: Schema.String,
  runId: Schema.String,
  threadId: Schema.String,
  type: relayCodexEventTypeSchema,
  payload: unknownRecordSchema
});
