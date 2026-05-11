import { z } from "zod";

const isoString = z.preprocess((value) => {
  if (value instanceof Date) return value.toISOString();
  return value;
}, z.string().min(1));

export const relayColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  position: z.number(),
  terminal: z.boolean()
});

export const projectSettingsSchema = z.object({
  defaultModel: z.string().nullable(),
  defaultApprovalPolicy: z.enum(["untrusted", "on-request", "never"]),
  defaultSandboxMode: z.enum(["read-only", "workspace-write", "danger-full-access"]),
  allowNonGitCodexRuns: z.boolean(),
  ticketDraftingEnabled: z.boolean(),
  codexExecutionEnabled: z.boolean()
});

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
  .passthrough();

export const ticketFrontMatterSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    title: z.string().min(1),
    status: z.string().min(1),
    position: z.number(),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    labels: z.array(z.string()).default([]),
    createdAt: isoString,
    updatedAt: isoString,
    codexThreadId: z.string().nullable().default(null),
    runStatus: z.enum(["idle", "drafting", "running", "blocked", "failed", "completed", "cancelled"]),
    lastRunId: z.string().nullable().default(null)
  })
  .passthrough();

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
  .passthrough();

const ticketDraftResearchLimitsSchema = z.object({
  maxResearchMs: z.number(),
  maxUrls: z.number(),
  maxUrlFetchMs: z.number(),
  maxUrlContentChars: z.number(),
  maxFilesToScan: z.number(),
  maxFilesToRead: z.number(),
  maxFileReadChars: z.number(),
  maxMatchesPerFile: z.number()
});

const ticketDraftResearchSchema = z.object({
  generatedAt: z.string().default(""),
  checkedUrls: z
    .array(
      z.object({
        url: z.string(),
        status: z.enum(["fetched", "failed", "skipped"]),
        title: z.string().nullable().default(null),
        reason: z.string().nullable().default(null),
        charactersRead: z.number().default(0)
      })
    )
    .default([]),
  inspectedFiles: z
    .array(
      z.object({
        path: z.string(),
        reason: z.string(),
        symbols: z.array(z.string()).default([]),
        matches: z.array(z.string()).default([]),
        charactersRead: z.number().default(0)
      })
    )
    .default([]),
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
});

export const ticketDraftSchema = z.object({
  title: z.string().min(1),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  labels: z.array(z.string()).default([]),
  context: z.string().default(""),
  researchFindings: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
  implementationPlan: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
  clarificationQuestions: z.array(z.string()).default([]),
  implementationNotes: z.array(z.string()).default([]),
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
});

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
    createdBy: z.enum(["user", "codex", "system"]),
    source: z.enum(["manual_board", "manual_ticket_edit", "agent_execution", "clarification_ui", "system_reconciliation"]),
    runId: z.string().nullable().default(null),
    codexThreadId: z.string().nullable().default(null)
  })
  .passthrough();

export const clarificationStoreSchema = z
  .object({
    schemaVersion: z.literal(1),
    ticketId: z.string().min(1),
    questions: z.array(clarificationQuestionSchema).default([])
  })
  .passthrough();
