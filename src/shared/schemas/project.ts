import { Schema } from "effect";
import { isoString, mutableArray, nonEmptyString, numberSchema, passthroughStruct, withDefault, type SchemaType } from "./common";
import { projectHealthSchema, relayColumnSchema, ticketEffortSchema } from "./primitives";

const defaultBooleanFalse = () => false;
const defaultDisabledWebSearchMode = () => "disabled" as const;

const agentConcurrencySchema = withDefault(
  Schema.Number.check(
    Schema.makeFilter((value) =>
      Number.isInteger(value) && value >= 1 ? undefined : "Expected an integer greater than or equal to 1"
    )
  ),
  () => 1
);

export const projectSettingsSchema = Schema.Struct({
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
  codexAdditionalDirectories: withDefault(mutableArray(Schema.String), () => [] as string[]),
  agentConcurrency: agentConcurrencySchema
});
export type ProjectSettings = SchemaType<typeof projectSettingsSchema>;

export const projectConfigSchema = passthroughStruct({
  schemaVersion: Schema.Literal(1),
  projectId: nonEmptyString,
  name: nonEmptyString,
  createdAt: isoString,
  updatedAt: isoString,
  columns: mutableArray(relayColumnSchema).check(Schema.isMinLength(1)),
  settings: projectSettingsSchema
});
export type ProjectConfig = SchemaType<typeof projectConfigSchema>;

export const projectSwimlaneSummarySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  position: numberSchema,
  ticketCount: numberSchema,
  activeRunCount: numberSchema
});
export type ProjectSwimlaneSummary = SchemaType<typeof projectSwimlaneSummarySchema>;

export const projectSummarySchema = Schema.Struct({
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
export type ProjectSummary = SchemaType<typeof projectSummarySchema>;

export const projectEditorIdSchema = Schema.Literals(["vscode", "cursor"]);
export type ProjectEditorId = SchemaType<typeof projectEditorIdSchema>;

export const projectOpenInEditorInputSchema = passthroughStruct({
  projectPath: Schema.String,
  editorId: projectEditorIdSchema
});
export type ProjectOpenInEditorInput = SchemaType<typeof projectOpenInEditorInputSchema>;

export const projectOpenInEditorResultSchema = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true) }),
  Schema.Struct({ ok: Schema.Literal(false), message: Schema.String })
]);
export type ProjectOpenInEditorResult = SchemaType<typeof projectOpenInEditorResultSchema>;

export const addProjectResultSchema = Schema.Struct({
  project: projectSummarySchema,
  initialized: Schema.Boolean
});
export type AddProjectResult = SchemaType<typeof addProjectResultSchema>;
