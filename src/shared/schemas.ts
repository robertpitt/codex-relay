import { Effect, Option, Schema, SchemaGetter } from "effect";
import * as SchemaIssue from "effect/SchemaIssue";
import type {
  AddProjectResult,
  AgentTicketUpdate,
  AgentTicketUpdateInput,
  AgentTicketUpdateStartResult,
  AppRegistry,
  BoardSnapshot,
  CancelRunInput,
  ClarificationAnswerInput,
  ClarificationQuestion,
  ClarificationQuestionStore,
  CodexRunPreflightResult,
  CodexRunStartResult,
  CodexStatus,
  CreateDraftInput,
  DraftIntakeAnswer,
  DraftIntakeInput,
  DraftIntakeQuestion,
  DraftIntakeResult,
  DraftScope,
  EpicSubticketCreateInput,
  EpicSubticketLinkInput,
  GitMetadata,
  GitMetadataOptions,
  InvalidTicket,
  ProjectConfig,
  ProjectEditorId,
  ProjectHealth,
  ProjectOpenInEditorInput,
  ProjectOpenInEditorResult,
  ProjectSettings,
  ProjectSummary,
  ProjectSwimlaneSummary,
  RelayActor,
  RelayApprovalDecision,
  RelayCodexEvent,
  RelayColumn,
  RelayEventSource,
  RendererRunEvent,
  RepositoryChatInput,
  RepositoryChatResponse,
  RunLogLine,
  RunStatus,
  RunSummary,
  RunUsageSummary,
  StartRunInput,
  SubticketCreateInput,
  TicketAttachmentSaveInput,
  TicketAttachmentSaveResult,
  TicketAuthoringState,
  TicketChecklistSummary,
  TicketCreateInput,
  TicketDraft,
  TicketDraftErrorPayload,
  TicketDraftResearch,
  TicketDraftResearchFile,
  TicketDraftResearchLimits,
  TicketDraftResearchUrl,
  TicketDraftStartResult,
  TicketDraftSubticket,
  TicketEffort,
  TicketFrontMatter,
  TicketMoveInput,
  TicketPriority,
  TicketReferenceCandidate,
  TicketRecord,
  TicketRedraftInput,
  TicketSaveInput,
  TicketSuggestion,
  TicketSuggestionsGenerateResult,
  TicketSummary,
  TicketType
} from "./types";

export type RelaySchema<T> = Schema.Schema<T>;

const nonEmptyString = Schema.String.check(Schema.isMinLength(1));
const numberSchema = Schema.Number.check(
  Schema.makeFilter((value) => (Number.isNaN(value) ? "Expected number, got NaN" : undefined))
);
const unknownRecordSchema = Schema.Record(Schema.String, Schema.Unknown) as RelaySchema<Record<string, unknown>>;
const mutableArray = <S extends Schema.Top>(schema: S) => Schema.mutable(Schema.Array(schema));
const withDefault = <S extends Schema.Top>(schema: S, getDefault: () => S["Encoded"]) =>
  schema.pipe(Schema.withDecodingDefault(Effect.sync(getDefault)));
const passthroughSchemaFields = new WeakMap<object, ReadonlySet<string>>();
const strictSchemaFields = new WeakMap<object, ReadonlySet<string>>();

export const passthroughFieldNamesFor = (schema: unknown): ReadonlySet<string> | undefined =>
  typeof schema === "object" && schema !== null ? passthroughSchemaFields.get(schema) : undefined;

export const strictFieldNamesFor = (schema: unknown): ReadonlySet<string> | undefined =>
  typeof schema === "object" && schema !== null ? strictSchemaFields.get(schema) : undefined;

const passthroughStruct = <const Fields extends Schema.Struct.Fields>(fields: Fields) => {
  const schema = Schema.Struct(fields) as RelaySchema<Schema.Struct.Type<Fields> & Record<string, unknown>>;
  passthroughSchemaFields.set(schema as object, new Set(Object.keys(fields)));
  return schema;
};

const strictStruct = <const Fields extends Schema.Struct.Fields>(fields: Fields) => {
  const fieldNames = new Set(Object.keys(fields));
  const structSchema = Schema.Struct(fields);
  const schema = Schema.Unknown.pipe(
    Schema.decodeTo(structSchema, {
      decode: SchemaGetter.transformOrFail((input) => {
        if (typeof input !== "object" || input === null || Array.isArray(input)) {
          return Effect.succeed(input as Schema.Struct.Encoded<Fields>);
        }

        const unexpectedKey = Object.keys(input).find((key) => !fieldNames.has(key));
        if (unexpectedKey) {
          return Effect.fail(
            new SchemaIssue.Pointer(
              [unexpectedKey],
              new SchemaIssue.InvalidValue(Option.some((input as Record<string, unknown>)[unexpectedKey]), {
                message: `Unexpected key with value ${String((input as Record<string, unknown>)[unexpectedKey])}`
              })
            )
          );
        }

        return Effect.succeed(input as Schema.Struct.Encoded<Fields>);
      }),
      encode: SchemaGetter.transform((value) => value)
    })
  ) as RelaySchema<Schema.Struct.Type<Fields>>;
  strictSchemaFields.set(schema as object, fieldNames);
  return schema;
};

const dateToIsoString = Schema.Date.pipe(
  Schema.decodeTo(nonEmptyString, {
    decode: SchemaGetter.transform((value: Date) => value.toISOString()),
    encode: SchemaGetter.transform((value: string) => new Date(value))
  })
);

const isoString = Schema.Union([nonEmptyString, dateToIsoString]) satisfies RelaySchema<string>;

const defaultStringArray = () => [] as string[];
const defaultBooleanFalse = () => false;
const defaultDisabledWebSearchMode = () => "disabled" as const;
const nullableStringWithDefault = () => withDefault(Schema.NullOr(Schema.String), () => null);
const stringArrayWithDefault = () => withDefault(mutableArray(Schema.String), defaultStringArray);

export const ticketPrioritySchema: RelaySchema<TicketPriority> = Schema.Literals(["low", "medium", "high", "urgent"]);

export const ticketTypeSchema: RelaySchema<TicketType> = Schema.Literals(["task", "epic"]);

export const ticketEffortSchema: RelaySchema<TicketEffort> = Schema.Literals(["low", "medium", "high", "xhigh"]);

export const draftScopeSchema: RelaySchema<DraftScope> = Schema.Literals([
  "quick_bug",
  "task",
  "product_feature",
  "rewrite",
  "epic"
]);

export const ticketAuthoringStateSchema: RelaySchema<TicketAuthoringState> = Schema.Literals([
  "rough",
  "drafting",
  "reviewing",
  "refining",
  "needs_input",
  "ready"
]);

export const runStatusSchema: RelaySchema<RunStatus> = Schema.Literals([
  "idle",
  "queued",
  "drafting",
  "draft_failed",
  "draft_complete",
  "running",
  "blocked",
  "failed",
  "completed",
  "cancelled"
]);

export const projectHealthSchema: RelaySchema<ProjectHealth> = Schema.Literals(["ok", "warning", "error"]);

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

const agentConcurrencySchema = withDefault(
  Schema.Number.check(
    Schema.makeFilter((value) =>
      Number.isInteger(value) && value >= 1 ? undefined : "Expected an integer greater than or equal to 1"
    )
  ),
  () => 1
);

export const projectSettingsSchema: RelaySchema<ProjectSettings> = Schema.Struct({
  defaultModel: Schema.NullOr(Schema.String),
  defaultModelReasoningEffort: withDefault(
    Schema.NullOr(Schema.Literals(["minimal", "low", "medium", "high", "xhigh"])),
    () => null
  ),
  defaultTicketEffort: withDefault(ticketEffortSchema, () => "medium" as const),
  defaultApprovalPolicy: Schema.Literals(["untrusted", "on-request", "on-failure", "never"]),
  defaultSandboxMode: Schema.Literals(["read-only", "workspace-write", "danger-full-access"]),
  allowNonGitCodexRuns: Schema.Boolean,
  ticketDraftingEnabled: Schema.Boolean,
  codexExecutionEnabled: Schema.Boolean,
  codexNetworkAccessEnabled: withDefault(Schema.Boolean, defaultBooleanFalse),
  codexWebSearchMode: withDefault(Schema.Literals(["disabled", "cached", "live"]), defaultDisabledWebSearchMode),
  codexAdditionalDirectories: stringArrayWithDefault(),
  agentConcurrency: agentConcurrencySchema
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

export const projectSwimlaneSummarySchema: RelaySchema<ProjectSwimlaneSummary> = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  position: numberSchema,
  ticketCount: numberSchema,
  activeRunCount: numberSchema
});

export const projectSummarySchema: RelaySchema<ProjectSummary> = Schema.Struct({
  projectId: Schema.NullOr(Schema.String),
  name: Schema.String,
  path: Schema.String,
  exists: Schema.Boolean,
  isGitRepository: Schema.Boolean,
  relayInitialized: Schema.Boolean,
  health: projectHealthSchema,
  healthMessages: mutableArray(Schema.String),
  activeRunCount: numberSchema,
  swimlanes: mutableArray(projectSwimlaneSummarySchema),
  lastOpenedAt: Schema.optional(Schema.String)
});

export const gitMetadataOptionsSchema: RelaySchema<GitMetadataOptions> = passthroughStruct({
  force: Schema.optional(Schema.Boolean)
});

export const gitMetadataSchema: RelaySchema<GitMetadata> = Schema.Struct({
  state: Schema.Literals(["loading", "ready", "not_git", "unavailable", "missing", "error"]),
  isGitRepository: Schema.Boolean,
  branchName: Schema.NullOr(Schema.String),
  isDetachedHead: Schema.Boolean,
  commitSha: Schema.NullOr(Schema.String),
  isDirty: Schema.Boolean,
  changedFileCount: Schema.NullOr(numberSchema),
  message: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  updatedAt: isoString
});

export const projectEditorIdSchema: RelaySchema<ProjectEditorId> = Schema.Literals(["vscode", "cursor"]);

export const projectOpenInEditorInputSchema: RelaySchema<ProjectOpenInEditorInput> = passthroughStruct({
  projectPath: Schema.String,
  editorId: projectEditorIdSchema
});

export const projectOpenInEditorResultSchema: RelaySchema<ProjectOpenInEditorResult> = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true) }),
  Schema.Struct({ ok: Schema.Literal(false), message: Schema.String })
]);

const ticketFrontMatterFields = {
  schemaVersion: Schema.Literal(1),
  id: nonEmptyString,
  title: nonEmptyString,
  ticketType: withDefault(ticketTypeSchema, () => "task" as const),
  status: nonEmptyString,
  position: numberSchema,
  priority: ticketPrioritySchema,
  effort: withDefault(ticketEffortSchema, () => "medium" as const),
  labels: stringArrayWithDefault(),
  parentEpicId: nullableStringWithDefault(),
  subticketIds: stringArrayWithDefault(),
  blockedByIds: stringArrayWithDefault(),
  relatedTicketIds: stringArrayWithDefault(),
  createdAt: isoString,
  updatedAt: isoString,
  authoringState: withDefault(ticketAuthoringStateSchema, () => "rough" as const),
  codexThreadId: nullableStringWithDefault(),
  runStatus: runStatusSchema,
  lastRunId: nullableStringWithDefault(),
  lastRunStartedAt: nullableStringWithDefault()
} as const;

export const ticketFrontMatterSchema: RelaySchema<TicketFrontMatter> = passthroughStruct(ticketFrontMatterFields);

export const ticketChecklistSummarySchema: RelaySchema<TicketChecklistSummary> = Schema.Struct({
  total: withDefault(numberSchema, () => 0),
  completed: withDefault(numberSchema, () => 0),
  open: withDefault(numberSchema, () => 0)
});

export const ticketRecordSchema: RelaySchema<TicketRecord> = Schema.Struct({
  frontMatter: ticketFrontMatterSchema,
  markdown: Schema.String,
  filePath: Schema.String,
  checklist: withDefault(ticketChecklistSummarySchema, () => ({ total: 0, completed: 0, open: 0 }))
});

export const ticketSummarySchema: RelaySchema<TicketSummary> = passthroughStruct({
  ...ticketFrontMatterFields,
  excerpt: Schema.String,
  filePath: Schema.String,
  checklist: withDefault(ticketChecklistSummarySchema, () => ({ total: 0, completed: 0, open: 0 }))
});

export const ticketReferenceCandidateSchema: RelaySchema<TicketReferenceCandidate> = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  status: Schema.String,
  columnName: Schema.String,
  relativePath: Schema.String,
  linkPath: Schema.String
});

export const invalidTicketSchema: RelaySchema<InvalidTicket> = Schema.Struct({
  filePath: Schema.String,
  reason: Schema.String
});

export const boardSnapshotSchema: RelaySchema<BoardSnapshot> = Schema.Struct({
  project: projectSummarySchema,
  config: Schema.NullOr(projectConfigSchema),
  columns: mutableArray(relayColumnSchema),
  tickets: mutableArray(ticketSummarySchema),
  invalidTickets: mutableArray(invalidTicketSchema)
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

export const ticketDraftErrorPayloadSchema: RelaySchema<TicketDraftErrorPayload> = Schema.Struct({
  code: Schema.Literals([
    "codex_unavailable",
    "codex_unauthenticated",
    "timeout",
    "cancelled",
    "clarification_required",
    "invalid_response",
    "backend_failure"
  ]),
  message: Schema.String,
  recoverable: Schema.Boolean,
  requestId: Schema.String,
  durationMs: numberSchema,
  reason: Schema.String,
  timeoutMs: Schema.optional(numberSchema)
});

export const ticketDraftStartResultSchema: RelaySchema<TicketDraftStartResult> = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), ticket: ticketRecordSchema, runId: Schema.String }),
  Schema.Struct({ ok: Schema.Literal(false), error: ticketDraftErrorPayloadSchema })
]);

export const ticketSuggestionSchema: RelaySchema<TicketSuggestion> = strictStruct({
  title: Schema.String,
  priority: ticketPrioritySchema,
  labels: stringArrayWithDefault(),
  rationale: Schema.String,
  request: Schema.String
});

export const ticketSuggestionsResponseSchema: RelaySchema<{ suggestions: TicketSuggestion[] }> = strictStruct({
  suggestions: withDefault(mutableArray(ticketSuggestionSchema), () => [])
});

export const ticketSuggestionsGenerateResultSchema: RelaySchema<TicketSuggestionsGenerateResult> = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), suggestions: mutableArray(ticketSuggestionSchema) }),
  Schema.Struct({ ok: Schema.Literal(false), error: ticketDraftErrorPayloadSchema })
]);

export const agentTicketUpdateSchema: RelaySchema<AgentTicketUpdate> = strictStruct({
  title: nonEmptyString,
  priority: ticketPrioritySchema,
  labels: stringArrayWithDefault(),
  authoringState: Schema.Literals(["rough", "reviewing", "needs_input", "ready"]),
  patch: strictStruct({
    summary: nonEmptyString,
    fullMarkdown: Schema.optional(Schema.NullOr(Schema.String)),
    appendMarkdown: Schema.optional(Schema.NullOr(Schema.String))
  }),
  clarificationQuestions: stringArrayWithDefault()
});

export const agentTicketUpdateStartResultSchema: RelaySchema<AgentTicketUpdateStartResult> = Schema.Struct({
  runId: Schema.String,
  threadId: Schema.String
});

const draftIntakeQuestionFields = {
  question: nonEmptyString,
  whyItMatters: nonEmptyString,
  recommendedAnswer: nonEmptyString
} as const;

export const draftIntakeQuestionSchema: RelaySchema<DraftIntakeQuestion> = strictStruct(draftIntakeQuestionFields);

export const draftIntakeAnswerSchema: RelaySchema<DraftIntakeAnswer> = passthroughStruct({
  question: nonEmptyString,
  answer: nonEmptyString,
  whyItMatters: Schema.optional(Schema.NullOr(Schema.String)),
  recommendedAnswer: Schema.optional(Schema.NullOr(Schema.String))
});

export const draftIntakeInputSchema: RelaySchema<DraftIntakeInput> = passthroughStruct({
  projectPath: Schema.String,
  idea: Schema.String,
  scopeOverride: Schema.optional(draftScopeSchema),
  effort: Schema.optional(ticketEffortSchema)
});

export const draftIntakeResultSchema: RelaySchema<DraftIntakeResult> = strictStruct({
  scope: draftScopeSchema,
  confidence: numberSchema,
  knownFacts: stringArrayWithDefault(),
  relatedTicketIds: stringArrayWithDefault(),
  questions: withDefault(mutableArray(draftIntakeQuestionSchema), () => [])
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

const subticketCreateInputFields = {
  title: Schema.String,
  priority: ticketPrioritySchema,
  effort: Schema.optional(ticketEffortSchema),
  labels: stringArrayWithDefault(),
  markdown: Schema.String,
  status: Schema.optional(Schema.String),
  blockedByIds: Schema.optional(mutableArray(Schema.String)),
  relatedTicketIds: Schema.optional(mutableArray(Schema.String)),
  authoringState: Schema.optional(ticketAuthoringStateSchema)
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

export const ticketAttachmentSaveInputSchema: RelaySchema<TicketAttachmentSaveInput> = passthroughStruct({
  projectPath: Schema.String,
  fileName: Schema.String,
  mimeType: Schema.optional(Schema.NullOr(Schema.String)),
  contentBase64: Schema.String
});

export const ticketAttachmentSaveResultSchema: RelaySchema<TicketAttachmentSaveResult> = Schema.Struct({
  fileName: Schema.String,
  markdownPath: Schema.String,
  absolutePath: Schema.String
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
  priority: Schema.optional(ticketPrioritySchema),
  effort: Schema.optional(ticketEffortSchema),
  preferredTicketType: Schema.optional(ticketTypeSchema),
  ticketId: Schema.optional(Schema.String),
  draftScope: Schema.optional(draftScopeSchema),
  runIntake: Schema.optional(Schema.Boolean),
  intakeAnswers: Schema.optional(mutableArray(draftIntakeAnswerSchema)),
  intakeKnownFacts: Schema.optional(mutableArray(Schema.String)),
  relatedTicketIds: Schema.optional(mutableArray(Schema.String))
});

export const ticketRedraftInputSchema: RelaySchema<TicketRedraftInput> = passthroughStruct({
  projectPath: Schema.String,
  ticketId: Schema.String,
  idea: Schema.optional(Schema.String),
  priority: Schema.optional(ticketPrioritySchema),
  effort: Schema.optional(ticketEffortSchema),
  preferredTicketType: Schema.optional(ticketTypeSchema),
  draftScope: Schema.optional(draftScopeSchema),
  runIntake: Schema.optional(Schema.Boolean),
  intakeAnswers: Schema.optional(mutableArray(draftIntakeAnswerSchema)),
  intakeKnownFacts: Schema.optional(mutableArray(Schema.String)),
  relatedTicketIds: Schema.optional(mutableArray(Schema.String))
});

export const startRunInputSchema: RelaySchema<StartRunInput> = passthroughStruct({
  projectPath: Schema.String,
  ticketId: Schema.String,
  freshThread: Schema.optional(Schema.Boolean)
});

export const cancelRunInputSchema: RelaySchema<CancelRunInput> = passthroughStruct({
  projectPath: Schema.String,
  ticketId: Schema.String,
  runId: Schema.String
});

export const repositoryChatInputSchema: RelaySchema<RepositoryChatInput> = passthroughStruct({
  projectPath: Schema.String,
  message: Schema.String,
  threadId: Schema.optional(Schema.NullOr(Schema.String))
});

export const repositoryChatResponseSchema: RelaySchema<RepositoryChatResponse> = Schema.Struct({
  threadId: Schema.String,
  message: Schema.String
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

export const codexStatusSchema: RelaySchema<CodexStatus> = Schema.Struct({
  sdkAvailable: Schema.Boolean,
  cliAvailable: Schema.Boolean,
  cliVersion: Schema.NullOr(Schema.String),
  authenticated: Schema.NullOr(Schema.Boolean),
  message: Schema.String
});

export const codexRunStartResultSchema: RelaySchema<CodexRunStartResult> = Schema.Struct({
  state: Schema.Literals(["queued", "started"]),
  runId: Schema.String,
  threadId: Schema.NullOr(Schema.String)
});

export const codexRunPreflightResultSchema: RelaySchema<CodexRunPreflightResult> = Schema.Struct({
  ok: Schema.Boolean,
  errors: mutableArray(Schema.String),
  warnings: mutableArray(Schema.String),
  ticketStatus: Schema.NullOr(Schema.String),
  runStatus: Schema.NullOr(runStatusSchema),
  unansweredClarificationCount: numberSchema,
  canStartFreshThread: Schema.Boolean
});

const relayCodexEventTypeSchema: RelaySchema<RelayCodexEvent["type"]> = Schema.Literals([
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
]);

export const rendererRunEventSchema: RelaySchema<RendererRunEvent> = passthroughStruct({
  type: relayCodexEventTypeSchema,
  timestamp: isoString,
  projectPath: Schema.String,
  ticketId: Schema.String,
  runId: Schema.String
}) as RelaySchema<RendererRunEvent>;

export const runLogLineSchema: RelaySchema<RunLogLine> = Schema.Struct({
  schemaVersion: numberSchema,
  timestamp: isoString,
  ticketId: Schema.String,
  runId: Schema.String,
  threadId: Schema.String,
  type: relayCodexEventTypeSchema,
  payload: unknownRecordSchema
});

export const runUsageSummarySchema: RelaySchema<RunUsageSummary> = Schema.Struct({
  inputTokens: Schema.NullOr(numberSchema),
  cachedInputTokens: Schema.NullOr(numberSchema),
  outputTokens: Schema.NullOr(numberSchema),
  reasoningOutputTokens: Schema.NullOr(numberSchema),
  totalTokens: Schema.NullOr(numberSchema)
});

export const runSummarySchema: RelaySchema<RunSummary> = Schema.Struct({
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

export const relayRpcErrorSchema = Schema.Struct({
  code: Schema.Literal("relay_rpc_error"),
  message: Schema.String
});

export type RelayRpcError = typeof relayRpcErrorSchema.Type;
