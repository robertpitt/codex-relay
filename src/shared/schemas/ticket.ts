import { Schema } from "effect";
import {
  mutableArray,
  nonEmptyString,
  nullableStringWithDefault,
  numberSchema,
  passthroughStruct,
  strictStruct,
  stringArrayWithDefault,
  withDefault,
  isoString,
  type SchemaType
} from "./common";
import {
  draftScopeSchema,
  runStatusSchema,
  ticketAuthoringStateSchema,
  ticketEffortSchema,
  ticketPrioritySchema,
  ticketTypeSchema
} from "./primitives";

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

export const ticketFrontMatterSchema = passthroughStruct(ticketFrontMatterFields);
export type TicketFrontMatter = SchemaType<typeof ticketFrontMatterSchema>;

export const ticketChecklistSummarySchema = Schema.Struct({
  total: withDefault(numberSchema, () => 0),
  completed: withDefault(numberSchema, () => 0),
  open: withDefault(numberSchema, () => 0)
});
export type TicketChecklistSummary = SchemaType<typeof ticketChecklistSummarySchema>;

export const ticketRecordSchema = Schema.Struct({
  frontMatter: ticketFrontMatterSchema,
  markdown: Schema.String,
  filePath: Schema.String,
  checklist: withDefault(ticketChecklistSummarySchema, () => ({ total: 0, completed: 0, open: 0 }))
});
export type TicketRecord = SchemaType<typeof ticketRecordSchema>;

export const ticketSummarySchema = passthroughStruct({
  ...ticketFrontMatterFields,
  excerpt: Schema.String,
  filePath: Schema.String,
  checklist: withDefault(ticketChecklistSummarySchema, () => ({ total: 0, completed: 0, open: 0 }))
});
export type TicketSummary = SchemaType<typeof ticketSummarySchema>;

export const ticketReferenceCandidateSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  status: Schema.String,
  columnName: Schema.String,
  relativePath: Schema.String,
  linkPath: Schema.String
});
export type TicketReferenceCandidate = SchemaType<typeof ticketReferenceCandidateSchema>;

const defaultTicketDraftResearchLimits = () => ({
  maxResearchMs: 0,
  maxUrls: 0,
  maxUrlFetchMs: 0,
  maxUrlContentChars: 0,
  maxFilesToScan: 0,
  maxFilesToRead: 0,
  maxFileReadChars: 0,
  maxMatchesPerFile: 0
});

const defaultTicketDraftResearch = () => ({
  generatedAt: "",
  checkedUrls: [],
  inspectedFiles: [],
  limitations: [],
  limits: defaultTicketDraftResearchLimits()
});

const ticketDraftResearchLimitsSchema = Schema.Struct({
  maxResearchMs: numberSchema,
  maxUrls: numberSchema,
  maxUrlFetchMs: numberSchema,
  maxUrlContentChars: numberSchema,
  maxFilesToScan: numberSchema,
  maxFilesToRead: numberSchema,
  maxFileReadChars: numberSchema,
  maxMatchesPerFile: numberSchema
});
export type TicketDraftResearchLimits = SchemaType<typeof ticketDraftResearchLimitsSchema>;

const ticketDraftResearchUrlSchema = Schema.Struct({
  url: Schema.String,
  status: Schema.Literals(["fetched", "failed", "skipped"]),
  title: nullableStringWithDefault(),
  reason: nullableStringWithDefault(),
  charactersRead: withDefault(numberSchema, () => 0)
});
export type TicketDraftResearchUrl = SchemaType<typeof ticketDraftResearchUrlSchema>;

const ticketDraftResearchFileSchema = Schema.Struct({
  path: Schema.String,
  reason: Schema.String,
  symbols: stringArrayWithDefault(),
  matches: stringArrayWithDefault(),
  charactersRead: withDefault(numberSchema, () => 0)
});
export type TicketDraftResearchFile = SchemaType<typeof ticketDraftResearchFileSchema>;

const ticketDraftResearchSchema = Schema.Struct({
  generatedAt: withDefault(Schema.String, () => ""),
  checkedUrls: withDefault(mutableArray(ticketDraftResearchUrlSchema), () => []),
  inspectedFiles: withDefault(mutableArray(ticketDraftResearchFileSchema), () => []),
  limitations: stringArrayWithDefault(),
  limits: withDefault(ticketDraftResearchLimitsSchema, defaultTicketDraftResearchLimits)
});
export type TicketDraftResearch = SchemaType<typeof ticketDraftResearchSchema>;

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

const ticketDraftBaseSchema = strictStruct(ticketDraftBaseFields);
export type TicketDraftSubticket = SchemaType<typeof ticketDraftBaseSchema>;

export const ticketDraftSchema = strictStruct({
  ...ticketDraftBaseFields,
  draftState: withDefault(Schema.Literals(["ready", "needs_clarification"]), () => "ready" as const),
  blockingClarificationQuestions: stringArrayWithDefault(),
  ticketType: withDefault(ticketTypeSchema, () => "task" as const),
  subtickets: withDefault(mutableArray(ticketDraftBaseSchema), () => []),
  research: withDefault(ticketDraftResearchSchema, defaultTicketDraftResearch)
}).check(
  Schema.makeFilter((draft: { readonly ticketType: "task" | "epic"; readonly subtickets: readonly unknown[] }) =>
    draft.ticketType === "task" && draft.subtickets.length > 0
      ? { path: ["subtickets"], issue: "Only epic ticket drafts can contain subtickets." }
      : undefined
  )
);
export type TicketDraft = SchemaType<typeof ticketDraftSchema>;
export type TaskPlanDraft = TicketDraftSubticket;
export type EpicPlanDraft = TicketDraft & { ticketType: "epic" };

export const ticketDraftErrorPayloadSchema = Schema.Struct({
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
export type TicketDraftErrorPayload = SchemaType<typeof ticketDraftErrorPayloadSchema>;
export type TicketDraftErrorCode = TicketDraftErrorPayload["code"];

export const ticketDraftResultSchema = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), draft: ticketDraftSchema }),
  Schema.Struct({ ok: Schema.Literal(false), error: ticketDraftErrorPayloadSchema })
]);
export type TicketDraftResult = SchemaType<typeof ticketDraftResultSchema>;

export const ticketDraftStartResultSchema = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), ticket: ticketRecordSchema, runId: Schema.String }),
  Schema.Struct({ ok: Schema.Literal(false), error: ticketDraftErrorPayloadSchema })
]);
export type TicketDraftStartResult = SchemaType<typeof ticketDraftStartResultSchema>;

export const ticketSuggestionSchema = strictStruct({
  title: Schema.String,
  priority: ticketPrioritySchema,
  labels: stringArrayWithDefault(),
  rationale: Schema.String,
  request: Schema.String
});
export type TicketSuggestion = SchemaType<typeof ticketSuggestionSchema>;

export const ticketSuggestionsResponseSchema = strictStruct({
  suggestions: withDefault(mutableArray(ticketSuggestionSchema), () => [])
});

export const ticketSuggestionsGenerateResultSchema = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), suggestions: mutableArray(ticketSuggestionSchema) }),
  Schema.Struct({ ok: Schema.Literal(false), error: ticketDraftErrorPayloadSchema })
]);
export type TicketSuggestionsGenerateResult = SchemaType<typeof ticketSuggestionsGenerateResultSchema>;

export const agentTicketUpdateSchema = strictStruct({
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
export type AgentTicketUpdate = SchemaType<typeof agentTicketUpdateSchema>;

export const agentTicketUpdateStartResultSchema = Schema.Struct({
  runId: Schema.String,
  threadId: Schema.String
});
export type AgentTicketUpdateStartResult = SchemaType<typeof agentTicketUpdateStartResultSchema>;

const draftIntakeQuestionFields = {
  question: nonEmptyString,
  whyItMatters: nonEmptyString,
  recommendedAnswer: nonEmptyString
} as const;

export const draftIntakeQuestionSchema = strictStruct(draftIntakeQuestionFields);
export type DraftIntakeQuestion = SchemaType<typeof draftIntakeQuestionSchema>;

export const draftIntakeAnswerSchema = passthroughStruct({
  question: nonEmptyString,
  answer: nonEmptyString,
  whyItMatters: Schema.optional(Schema.NullOr(Schema.String)),
  recommendedAnswer: Schema.optional(Schema.NullOr(Schema.String))
});
export type DraftIntakeAnswer = SchemaType<typeof draftIntakeAnswerSchema>;

export const draftIntakeInputSchema = passthroughStruct({
  projectPath: Schema.String,
  idea: Schema.String,
  scopeOverride: Schema.optional(draftScopeSchema),
  effort: Schema.optional(ticketEffortSchema)
});
export type DraftIntakeInput = SchemaType<typeof draftIntakeInputSchema>;

export const draftIntakeResultSchema = strictStruct({
  scope: draftScopeSchema,
  confidence: numberSchema,
  knownFacts: stringArrayWithDefault(),
  relatedTicketIds: stringArrayWithDefault(),
  questions: withDefault(mutableArray(draftIntakeQuestionSchema), () => [])
});
export type DraftIntakeResult = SchemaType<typeof draftIntakeResultSchema>;

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

export const subticketCreateInputSchema = passthroughStruct(subticketCreateInputFields);
export type SubticketCreateInput = SchemaType<typeof subticketCreateInputSchema>;

export const ticketCreateInputSchema = passthroughStruct({
  ...subticketCreateInputFields,
  ticketType: Schema.optional(ticketTypeSchema),
  parentEpicId: Schema.optional(Schema.NullOr(Schema.String)),
  subticketIds: Schema.optional(mutableArray(Schema.String)),
  subtickets: Schema.optional(mutableArray(subticketCreateInputSchema))
});
export type TicketCreateInput = SchemaType<typeof ticketCreateInputSchema>;

export const epicSubticketCreateInputSchema = passthroughStruct({
  projectPath: Schema.String,
  epicId: Schema.String,
  ticket: subticketCreateInputSchema
});
export type EpicSubticketCreateInput = SchemaType<typeof epicSubticketCreateInputSchema>;

export const epicSubticketLinkInputSchema = passthroughStruct({
  projectPath: Schema.String,
  epicId: Schema.String,
  ticketId: Schema.String
});
export type EpicSubticketLinkInput = SchemaType<typeof epicSubticketLinkInputSchema>;
export type EpicSubticketUnlinkInput = EpicSubticketLinkInput;

export const ticketSaveInputSchema = passthroughStruct({
  projectPath: Schema.String,
  ticket: ticketRecordSchema
});
export type TicketSaveInput = SchemaType<typeof ticketSaveInputSchema>;

export const ticketAttachmentSaveInputSchema = passthroughStruct({
  projectPath: Schema.String,
  fileName: Schema.String,
  mimeType: Schema.optional(Schema.NullOr(Schema.String)),
  contentBase64: Schema.String
});
export type TicketAttachmentSaveInput = SchemaType<typeof ticketAttachmentSaveInputSchema>;

export const ticketAttachmentSaveResultSchema = Schema.Struct({
  fileName: Schema.String,
  markdownPath: Schema.String,
  absolutePath: Schema.String
});
export type TicketAttachmentSaveResult = SchemaType<typeof ticketAttachmentSaveResultSchema>;

export const ticketMoveInputSchema = passthroughStruct({
  projectPath: Schema.String,
  ticketId: Schema.String,
  targetStatus: Schema.String,
  beforeTicketId: Schema.optional(Schema.NullOr(Schema.String)),
  afterTicketId: Schema.optional(Schema.NullOr(Schema.String))
});
export type TicketMoveInput = SchemaType<typeof ticketMoveInputSchema>;

export const createDraftInputSchema = passthroughStruct({
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
export type CreateDraftInput = SchemaType<typeof createDraftInputSchema>;

export const ticketRedraftInputSchema = passthroughStruct({
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
export type TicketRedraftInput = SchemaType<typeof ticketRedraftInputSchema>;

export const agentTicketUpdateInputSchema = passthroughStruct({
  projectPath: Schema.String,
  ticketId: Schema.String,
  request: Schema.String
});
export type AgentTicketUpdateInput = SchemaType<typeof agentTicketUpdateInputSchema>;
