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

export const ticketDraftSchema = z.object({
  title: z.string().min(1),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  labels: z.array(z.string()).default([]),
  context: z.string().default(""),
  requirements: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
  clarificationQuestions: z.array(z.string()).default([]),
  implementationNotes: z.array(z.string()).default([])
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
