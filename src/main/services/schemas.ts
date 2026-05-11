import { z } from "zod";
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
  TicketFrontMatter,
  TicketMoveInput,
  TicketPriority,
  TicketRecord,
  TicketSaveInput,
  TicketType
} from "../../shared/types";

const isoString: z.ZodType<string, z.ZodTypeDef, unknown> = z.preprocess((value) => {
  if (value instanceof Date) return value.toISOString();
  return value;
}, z.string().min(1));

export const ticketPrioritySchema = z.enum(["low", "medium", "high", "urgent"]) satisfies z.ZodType<
  TicketPriority,
  z.ZodTypeDef,
  unknown
>;

export const ticketTypeSchema = z.enum(["task", "epic"]) satisfies z.ZodType<TicketType, z.ZodTypeDef, unknown>;

export const runStatusSchema = z.enum([
  "idle",
  "drafting",
  "running",
  "blocked",
  "failed",
  "completed",
  "cancelled"
]) satisfies z.ZodType<RunStatus, z.ZodTypeDef, unknown>;

export const relayActorSchema = z.enum(["user", "codex", "system"]) satisfies z.ZodType<RelayActor, z.ZodTypeDef, unknown>;

export const relayEventSourceSchema = z.enum([
  "manual_board",
  "manual_ticket_edit",
  "agent_execution",
  "clarification_ui",
  "system_reconciliation"
]) satisfies z.ZodType<RelayEventSource, z.ZodTypeDef, unknown>;

export const relayColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  position: z.number(),
  terminal: z.boolean()
}) satisfies z.ZodType<RelayColumn, z.ZodTypeDef, unknown>;

export const projectSettingsSchema = z.object({
  defaultModel: z.string().nullable(),
  defaultApprovalPolicy: z.enum(["untrusted", "on-request", "never"]),
  defaultSandboxMode: z.enum(["read-only", "workspace-write", "danger-full-access"]),
  allowNonGitCodexRuns: z.boolean(),
  ticketDraftingEnabled: z.boolean(),
  codexExecutionEnabled: z.boolean()
}) satisfies z.ZodType<ProjectSettings, z.ZodTypeDef, unknown>;

export const projectConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: z.string().min(1),
    name: z.string().min(1),
    createdAt: isoString,
    updatedAt: isoString,
    columns: z.array(relayColumnSchema).min(1),
    settings: projectSettingsSchema
  })
  .passthrough() satisfies z.ZodType<ProjectConfig, z.ZodTypeDef, unknown>;

export const ticketFrontMatterSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    title: z.string().min(1),
    ticketType: ticketTypeSchema.default("task"),
    status: z.string().min(1),
    position: z.number(),
    priority: ticketPrioritySchema,
    labels: z.array(z.string()).default([]),
    parentEpicId: z.string().nullable().default(null),
    subticketIds: z.array(z.string()).default([]),
    createdAt: isoString,
    updatedAt: isoString,
    codexThreadId: z.string().nullable().default(null),
    runStatus: runStatusSchema,
    lastRunId: z.string().nullable().default(null)
  })
  .passthrough() satisfies z.ZodType<TicketFrontMatter, z.ZodTypeDef, unknown>;

export const ticketRecordSchema = z.object({
  frontMatter: ticketFrontMatterSchema,
  markdown: z.string(),
  filePath: z.string()
}) satisfies z.ZodType<TicketRecord, z.ZodTypeDef, unknown>;

export const appRegistrySchema = z
  .object({
    schemaVersion: z.literal(1),
    projects: z.array(
      z.object({
        path: z.string().min(1),
        pinned: z.boolean(),
        lastOpenedAt: isoString,
        sidebarPosition: z.number()
      })
    ),
    ui: z.object({
      lastProjectPath: z.string().nullable(),
      theme: z.enum(["system", "light", "dark"])
    })
  })
  .passthrough() satisfies z.ZodType<AppRegistry, z.ZodTypeDef, unknown>;

const ticketDraftResearchLimitsSchema = z.object({
  maxResearchMs: z.number(),
  maxUrls: z.number(),
  maxUrlFetchMs: z.number(),
  maxUrlContentChars: z.number(),
  maxFilesToScan: z.number(),
  maxFilesToRead: z.number(),
  maxFileReadChars: z.number(),
  maxMatchesPerFile: z.number()
}) satisfies z.ZodType<TicketDraftResearchLimits, z.ZodTypeDef, unknown>;

const ticketDraftResearchUrlSchema = z.object({
  url: z.string(),
  status: z.enum(["fetched", "failed", "skipped"]),
  title: z.string().nullable().default(null),
  reason: z.string().nullable().default(null),
  charactersRead: z.number().default(0)
}) satisfies z.ZodType<TicketDraftResearchUrl, z.ZodTypeDef, unknown>;

const ticketDraftResearchFileSchema = z.object({
  path: z.string(),
  reason: z.string(),
  symbols: z.array(z.string()).default([]),
  matches: z.array(z.string()).default([]),
  charactersRead: z.number().default(0)
}) satisfies z.ZodType<TicketDraftResearchFile, z.ZodTypeDef, unknown>;

const ticketDraftResearchSchema = z.object({
  generatedAt: z.string().default(""),
  checkedUrls: z.array(ticketDraftResearchUrlSchema).default([]),
  inspectedFiles: z.array(ticketDraftResearchFileSchema).default([]),
  limitations: z.array(z.string()).default([]),
  limits: ticketDraftResearchLimitsSchema.default({
    maxResearchMs: 0,
    maxUrls: 0,
    maxUrlFetchMs: 0,
    maxUrlContentChars: 0,
    maxFilesToScan: 0,
    maxFilesToRead: 0,
    maxFileReadChars: 0,
    maxMatchesPerFile: 0
  })
}) satisfies z.ZodType<TicketDraftResearch, z.ZodTypeDef, unknown>;

const ticketDraftBaseSchema = z
  .object({
    title: z.string().min(1),
    priority: ticketPrioritySchema,
    labels: z.array(z.string()).default([]),
    context: z.string().default(""),
    researchFindings: z.array(z.string()).default([]),
    requirements: z.array(z.string()).default([]),
    implementationPlan: z.array(z.string()).default([]),
    acceptanceCriteria: z.array(z.string()).default([]),
    clarificationQuestions: z.array(z.string()).default([]),
    implementationNotes: z.array(z.string()).default([])
  })
  .strict();

export const ticketDraftSchema = ticketDraftBaseSchema.extend({
  ticketType: ticketTypeSchema.default("task"),
  subtickets: z.array(ticketDraftBaseSchema).default([]),
  research: ticketDraftResearchSchema.default({
    generatedAt: "",
    checkedUrls: [],
    inspectedFiles: [],
    limitations: [],
    limits: {
      maxResearchMs: 0,
      maxUrls: 0,
      maxUrlFetchMs: 0,
      maxUrlContentChars: 0,
      maxFilesToScan: 0,
      maxFilesToRead: 0,
      maxFileReadChars: 0,
      maxMatchesPerFile: 0
    }
  })
}).superRefine((draft, context) => {
  if (draft.ticketType === "task" && draft.subtickets.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["subtickets"],
      message: "Only epic ticket drafts can contain subtickets."
    });
  }
}) satisfies z.ZodType<TicketDraft, z.ZodTypeDef, unknown>;

export const agentTicketUpdateSchema = z
  .object({
    title: z.string().min(1),
    priority: ticketPrioritySchema,
    labels: z.array(z.string()).default([]),
    markdown: z.string().min(1),
    clarificationQuestions: z.array(z.string()).default([])
  })
  .strict() satisfies z.ZodType<AgentTicketUpdate, z.ZodTypeDef, unknown>;

export const clarificationQuestionSchema = z
  .object({
    id: z.string().min(1),
    ticketId: z.string().min(1),
    question: z.string().min(1),
    answerType: z.literal("text"),
    answer: z.string().nullable().default(null),
    createdAt: isoString,
    updatedAt: isoString,
    answeredAt: isoString.nullable().default(null),
    createdBy: relayActorSchema,
    source: relayEventSourceSchema,
    runId: z.string().nullable().default(null),
    codexThreadId: z.string().nullable().default(null)
  })
  .passthrough() satisfies z.ZodType<ClarificationQuestion, z.ZodTypeDef, unknown>;

export const clarificationStoreSchema = z
  .object({
    schemaVersion: z.literal(1),
    ticketId: z.string().min(1),
    questions: z.array(clarificationQuestionSchema).default([])
  })
  .passthrough() satisfies z.ZodType<ClarificationQuestionStore, z.ZodTypeDef, unknown>;

export const gitMetadataOptionsSchema = z
  .object({
    force: z.boolean().optional()
  })
  .passthrough() satisfies z.ZodType<GitMetadataOptions, z.ZodTypeDef, unknown>;

export const subticketCreateInputSchema = z
  .object({
    title: z.string(),
    priority: ticketPrioritySchema,
    labels: z.array(z.string()).default([]),
    markdown: z.string(),
    status: z.string().optional()
  })
  .passthrough() satisfies z.ZodType<SubticketCreateInput, z.ZodTypeDef, unknown>;

export const ticketCreateInputSchema = subticketCreateInputSchema
  .extend({
    ticketType: ticketTypeSchema.optional(),
    parentEpicId: z.string().nullable().optional(),
    subticketIds: z.array(z.string()).optional(),
    subtickets: z.array(subticketCreateInputSchema).optional()
  })
  .passthrough() satisfies z.ZodType<TicketCreateInput, z.ZodTypeDef, unknown>;

export const epicSubticketCreateInputSchema = z
  .object({
    projectPath: z.string(),
    epicId: z.string(),
    ticket: subticketCreateInputSchema
  })
  .passthrough() satisfies z.ZodType<EpicSubticketCreateInput, z.ZodTypeDef, unknown>;

export const epicSubticketLinkInputSchema = z
  .object({
    projectPath: z.string(),
    epicId: z.string(),
    ticketId: z.string()
  })
  .passthrough() satisfies z.ZodType<EpicSubticketLinkInput, z.ZodTypeDef, unknown>;

export const ticketSaveInputSchema = z
  .object({
    projectPath: z.string(),
    ticket: ticketRecordSchema
  })
  .passthrough() satisfies z.ZodType<TicketSaveInput, z.ZodTypeDef, unknown>;

export const ticketMoveInputSchema = z
  .object({
    projectPath: z.string(),
    ticketId: z.string(),
    targetStatus: z.string(),
    beforeTicketId: z.string().nullable().optional(),
    afterTicketId: z.string().nullable().optional()
  })
  .passthrough() satisfies z.ZodType<TicketMoveInput, z.ZodTypeDef, unknown>;

export const clarificationAnswerInputSchema = z
  .object({
    projectPath: z.string(),
    ticketId: z.string(),
    questionId: z.string(),
    answer: z.string()
  })
  .passthrough() satisfies z.ZodType<ClarificationAnswerInput, z.ZodTypeDef, unknown>;

export const createDraftInputSchema = z
  .object({
    projectPath: z.string(),
    idea: z.string(),
    preferredTicketType: ticketTypeSchema.optional()
  })
  .passthrough() satisfies z.ZodType<CreateDraftInput, z.ZodTypeDef, unknown>;

export const startRunInputSchema = z
  .object({
    projectPath: z.string(),
    ticketId: z.string(),
    freshThread: z.boolean().optional()
  })
  .passthrough() satisfies z.ZodType<StartRunInput, z.ZodTypeDef, unknown>;

export const agentTicketUpdateInputSchema = z
  .object({
    projectPath: z.string(),
    ticketId: z.string(),
    request: z.string()
  })
  .passthrough() satisfies z.ZodType<AgentTicketUpdateInput, z.ZodTypeDef, unknown>;

export const relayApprovalDecisionSchema = z.enum(["accept", "acceptForSession", "decline", "cancel"]) satisfies z.ZodType<
  RelayApprovalDecision,
  z.ZodTypeDef,
  unknown
>;

const relayCodexEventTypeSchema = z.enum([
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
]) satisfies z.ZodType<RelayCodexEvent["type"], z.ZodTypeDef, unknown>;

export const relayCodexEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run.started"), runId: z.string(), threadId: z.string(), timestamp: isoString }),
  z.object({ type: z.literal("agent.message.delta"), text: z.string(), timestamp: isoString }),
  z.object({ type: z.literal("agent.message.completed"), text: z.string(), timestamp: isoString }),
  z.object({ type: z.literal("command.started"), command: z.string(), cwd: z.string().optional(), timestamp: isoString }),
  z.object({ type: z.literal("command.output"), stream: z.enum(["stdout", "stderr"]), text: z.string(), timestamp: isoString }),
  z.object({ type: z.literal("command.completed"), status: z.enum(["completed", "failed", "declined"]), timestamp: isoString }),
  z.object({ type: z.literal("file.change"), path: z.string(), summary: z.string().optional(), timestamp: isoString }),
  z.object({ type: z.literal("web.search"), query: z.string(), timestamp: isoString }),
  z.object({
    type: z.literal("approval.requested"),
    approvalId: z.string(),
    kind: z.enum(["command", "file-change", "network", "other"]),
    payload: z.record(z.unknown()),
    timestamp: isoString
  }),
  z.object({ type: z.literal("approval.resolved"), approvalId: z.string(), decision: z.string(), timestamp: isoString }),
  z.object({
    type: z.literal("ticket.status_changed"),
    fromStatus: z.string(),
    toStatus: z.string(),
    actor: relayActorSchema,
    source: relayEventSourceSchema,
    timestamp: isoString
  }),
  z.object({ type: z.literal("clarification.requested"), questions: z.array(clarificationQuestionSchema), timestamp: isoString }),
  z.object({ type: z.literal("run.completed"), finalResponse: z.string(), usage: z.unknown().optional(), timestamp: isoString }),
  z.object({ type: z.literal("run.failed"), message: z.string(), details: z.unknown().optional(), timestamp: isoString })
]) satisfies z.ZodType<RelayCodexEvent, z.ZodTypeDef, unknown>;

export const runLogLineSchema = z.object({
  schemaVersion: z.number(),
  timestamp: isoString,
  ticketId: z.string(),
  runId: z.string(),
  threadId: z.string(),
  type: relayCodexEventTypeSchema,
  payload: z.record(z.unknown())
}) satisfies z.ZodType<RunLogLine, z.ZodTypeDef, unknown>;
