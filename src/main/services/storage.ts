import { shell } from "electron";
import matter from "gray-matter";
import { access, appendFile, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ulid } from "ulid";
import {
  DEFAULT_COLUMNS,
  RELAY_SCHEMA_VERSION,
  type BoardSnapshot,
  type ClarificationQuestion,
  type ClarificationQuestionCreateInput,
  type InvalidTicket,
  type ProjectConfig,
  type ProjectSettings,
  type ProjectSummary,
  type RelayActor,
  type RelayColumn,
  type RelayEventSource,
  type RelayAuditEvent,
  type TicketCreateInput,
  type TicketDraft,
  type TicketFrontMatter,
  type TicketMoveInput,
  type TicketRecord,
  type TicketSaveInput,
  type TicketSummary
} from "../../shared/types";
import { clarificationStoreSchema, projectConfigSchema, ticketFrontMatterSchema } from "./schemas";

const defaultSettings = (): ProjectSettings => ({
  defaultModel: null,
  defaultApprovalPolicy: "on-request",
  defaultSandboxMode: "workspace-write",
  allowNonGitCodexRuns: false,
  ticketDraftingEnabled: true,
  codexExecutionEnabled: true
});

const nowIso = (): string => new Date().toISOString();
const resolveProjectPath = (projectPath: string): string => path.resolve(projectPath);
const projectRelayPath = (projectPath: string): string => path.join(resolveProjectPath(projectPath), ".relay");
const projectConfigPath = (projectPath: string): string => path.join(projectRelayPath(projectPath), "project.json");
const ticketsPath = (projectPath: string): string => path.join(projectRelayPath(projectPath), "tickets");
export const runsPath = (projectPath: string): string => path.join(projectRelayPath(projectPath), "runs");
const auditLogPath = (projectPath: string): string => path.join(projectRelayPath(projectPath), "audit.jsonl");
const clarificationsPath = (projectPath: string): string => path.join(projectRelayPath(projectPath), "clarifications");
const trashPath = (projectPath: string): string => path.join(projectRelayPath(projectPath), "trash");
const attachmentsPath = (projectPath: string): string => path.join(projectRelayPath(projectPath), "attachments");
const backupsPath = (projectPath: string): string => path.join(projectRelayPath(projectPath), "backups");

export const newId = (prefix: string): string => `${prefix}_${ulid().toLowerCase()}`;

export class TicketNotFoundError extends Error {
  readonly code = "TICKET_NOT_FOUND";
  readonly projectPath: string;
  readonly ticketId: string;
  readonly filePath: string;

  constructor(projectPath: string, ticketId: string, filePath: string, cause?: unknown) {
    super(`Ticket ${ticketId} was not found in project ${projectPath}.`, { cause });
    this.name = "TicketNotFoundError";
    this.projectPath = projectPath;
    this.ticketId = ticketId;
    this.filePath = filePath;
  }
}

export const isTicketNotFoundError = (error: unknown): error is TicketNotFoundError =>
  error instanceof TicketNotFoundError;

const fileExists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

export const isGitRepository = async (projectPath: string): Promise<boolean> => fileExists(path.join(projectPath, ".git"));

const atomicWriteJson = async (target: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, target);
};

const atomicWriteText = async (target: string, value: string): Promise<void> => {
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, value, "utf8");
  await rename(tmp, target);
};

const appendAuditEvent = async (projectPath: string, event: Omit<RelayAuditEvent, "schemaVersion" | "timestamp">): Promise<void> => {
  const record: RelayAuditEvent = {
    schemaVersion: RELAY_SCHEMA_VERSION,
    timestamp: nowIso(),
    ...event
  };
  const target = auditLogPath(projectPath);
  await mkdir(path.dirname(target), { recursive: true });
  await appendFile(target, `${JSON.stringify(record)}\n`, "utf8");
};

const assertDirectory = async (projectPath: string): Promise<void> => {
  const info = await stat(projectPath);
  if (!info.isDirectory()) {
    throw new Error(`Project path is not a directory: ${projectPath}`);
  }
};

export const isRelayInitialized = async (projectPath: string): Promise<boolean> => fileExists(projectConfigPath(projectPath));

export const initializeProject = async (projectPath: string): Promise<ProjectConfig> => {
  const resolved = path.resolve(projectPath);
  await assertDirectory(resolved);
  const existing = await isRelayInitialized(resolved);
  if (existing) return readProjectConfig(resolved);

  const now = nowIso();
  const config: ProjectConfig = {
    schemaVersion: RELAY_SCHEMA_VERSION,
    projectId: newId("prj"),
    name: path.basename(resolved),
    createdAt: now,
    updatedAt: now,
    columns: DEFAULT_COLUMNS.map((column) => ({ ...column })),
    settings: defaultSettings()
  };

  await mkdir(ticketsPath(resolved), { recursive: true });
  await mkdir(runsPath(resolved), { recursive: true });
  await mkdir(clarificationsPath(resolved), { recursive: true });
  await mkdir(attachmentsPath(resolved), { recursive: true });
  await mkdir(backupsPath(resolved), { recursive: true });
  await atomicWriteJson(projectConfigPath(resolved), config);
  return config;
};

export const readProjectConfig = async (projectPath: string): Promise<ProjectConfig> => {
  const raw = await readFile(projectConfigPath(projectPath), "utf8");
  return projectConfigSchema.parse(JSON.parse(raw)) as ProjectConfig;
};

export const writeProjectConfig = async (projectPath: string, config: ProjectConfig): Promise<ProjectConfig> => {
  const updated = { ...config, updatedAt: nowIso() };
  await atomicWriteJson(projectConfigPath(projectPath), updated);
  return updated;
};

export const summarizeProject = async (projectPath: string, lastOpenedAt?: string): Promise<ProjectSummary> => {
  const resolved = path.resolve(projectPath);
  const exists = await fileExists(resolved);
  const healthMessages: string[] = [];
  let config: ProjectConfig | null = null;
  let relayInitialized = false;
  let activeRunCount = 0;

  if (!exists) {
    return {
      projectId: null,
      name: path.basename(resolved),
      path: resolved,
      exists: false,
      isGitRepository: false,
      relayInitialized: false,
      health: "error",
      healthMessages: ["Project folder is missing."],
      activeRunCount: 0,
      lastOpenedAt
    };
  }

  relayInitialized = await isRelayInitialized(resolved);
  const git = await isGitRepository(resolved);

  if (!relayInitialized) {
    healthMessages.push("Relay has not initialized this project yet.");
  } else {
    try {
      config = await readProjectConfig(resolved);
      const tickets = await readTickets(resolved, config.columns);
      activeRunCount = tickets.tickets.filter((ticket) => ticket.runStatus === "running" || ticket.runStatus === "blocked").length;
      if (tickets.invalidTickets.length > 0) {
        healthMessages.push(`${tickets.invalidTickets.length} ticket file(s) need attention.`);
      }
    } catch (error) {
      healthMessages.push(error instanceof Error ? error.message : "Project metadata is invalid.");
    }
  }

  if (!git) {
    healthMessages.push("This folder is not a Git repository. Codex execution is disabled by default.");
  }

  const hasError = exists && relayInitialized && !config;
  const health = hasError ? "error" : healthMessages.length > 0 ? "warning" : "ok";

  return {
    projectId: config?.projectId ?? null,
    name: config?.name ?? path.basename(resolved),
    path: resolved,
    exists,
    isGitRepository: git,
    relayInitialized,
    health,
    healthMessages,
    activeRunCount,
    lastOpenedAt
  };
};

const extractExcerpt = (markdown: string): string => {
  const text = markdown
    .replace(/^# .+$/m, "")
    .replace(/^## .+$/gm, "")
    .replace(/[-*]\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
};

const readTicketFile = async (filePath: string): Promise<TicketRecord> => {
  const raw = await readFile(filePath, "utf8");
  const parsed = matter(raw);
  const frontMatter = ticketFrontMatterSchema.parse(parsed.data) as TicketFrontMatter;
  return {
    frontMatter,
    markdown: parsed.content.trimStart(),
    filePath
  };
};

const readTickets = async (
  projectPath: string,
  columns: RelayColumn[]
): Promise<{ tickets: TicketSummary[]; records: TicketRecord[]; invalidTickets: InvalidTicket[] }> => {
  await mkdir(ticketsPath(projectPath), { recursive: true });
  const entries = await readdir(ticketsPath(projectPath), { withFileTypes: true });
  const validColumnIds = new Set(columns.map((column) => column.id));
  const tickets: TicketSummary[] = [];
  const records: TicketRecord[] = [];
  const invalidTickets: InvalidTicket[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const filePath = path.join(ticketsPath(projectPath), entry.name);
    try {
      const record = await readTicketFile(filePath);
      if (!validColumnIds.has(record.frontMatter.status)) {
        invalidTickets.push({ filePath, reason: `Unknown status: ${record.frontMatter.status}` });
        continue;
      }
      records.push(record);
      tickets.push({
        ...record.frontMatter,
        excerpt: extractExcerpt(record.markdown),
        filePath
      });
    } catch (error) {
      invalidTickets.push({
        filePath,
        reason: error instanceof Error ? error.message : "Unable to parse ticket."
      });
    }
  }

  tickets.sort((a, b) => {
    if (a.status !== b.status) return a.status.localeCompare(b.status);
    return a.position - b.position;
  });

  return { tickets, records, invalidTickets };
};

export const readBoard = async (projectPath: string, lastOpenedAt?: string): Promise<BoardSnapshot> => {
  const resolved = path.resolve(projectPath);
  const project = await summarizeProject(resolved, lastOpenedAt);

  if (!project.exists || !project.relayInitialized) {
    return {
      project,
      config: null,
      columns: DEFAULT_COLUMNS.map((column) => ({ ...column })),
      tickets: [],
      invalidTickets: []
    };
  }

  const config = await readProjectConfig(resolved);
  const { tickets, invalidTickets } = await readTickets(resolved, config.columns);
  return {
    project,
    config,
    columns: [...config.columns].sort((a, b) => a.position - b.position),
    tickets,
    invalidTickets
  };
};

const ticketPath = (projectPath: string, ticketId: string): string => path.join(ticketsPath(projectPath), `${ticketId}.md`);

export const readTicket = async (projectPath: string, ticketId: string): Promise<TicketRecord> => {
  const resolvedProjectPath = resolveProjectPath(projectPath);
  const target = ticketPath(resolvedProjectPath, ticketId);
  try {
    return await readTicketFile(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new TicketNotFoundError(resolvedProjectPath, ticketId, target, error);
    }
    throw error;
  }
};

const stringifyTicket = (ticket: TicketRecord): string => {
  const body = ticket.markdown.trimStart();
  return matter.stringify(body.endsWith("\n") ? body : `${body}\n`, ticket.frontMatter);
};

export const writeTicket = async (projectPath: string, ticket: TicketRecord): Promise<TicketRecord> => {
  const target = ticketPath(projectPath, ticket.frontMatter.id);
  const next: TicketRecord = {
    ...ticket,
    filePath: target,
    frontMatter: {
      ...ticket.frontMatter,
      updatedAt: nowIso()
    }
  };
  await atomicWriteText(target, stringifyTicket(next));
  return next;
};

export const ticketMarkdownFromDraft = (draft: TicketDraft): string => {
  const list = (items: string[]): string => (items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None.");
  return `# ${draft.title}

## Context

${draft.context || "No additional context provided."}

## Requirements

${list(draft.requirements)}

## Acceptance Criteria

${list(draft.acceptanceCriteria)}

## Clarification Questions

${list(draft.clarificationQuestions)}

## Implementation Notes

${list(draft.implementationNotes)}

## Codex Handoff

No Codex run has been started.
`;
};

export const createTicket = async (projectPath: string, input: TicketCreateInput): Promise<TicketRecord> => {
  const config = await readProjectConfig(projectPath);
  const status = input.status ?? "todo";
  if (!config.columns.some((column) => column.id === status)) {
    throw new Error(`Unknown ticket status: ${status}`);
  }
  const board = await readBoard(projectPath);
  const lastPosition = Math.max(0, ...board.tickets.filter((ticket) => ticket.status === status).map((ticket) => ticket.position));
  const createdAt = nowIso();
  const frontMatter: TicketFrontMatter = {
    schemaVersion: RELAY_SCHEMA_VERSION,
    id: newId("tkt"),
    title: input.title.trim(),
    status,
    position: lastPosition + 1000,
    priority: input.priority,
    labels: input.labels.map((label) => label.trim()).filter(Boolean),
    createdAt,
    updatedAt: createdAt,
    codexThreadId: null,
    runStatus: "idle",
    lastRunId: null
  };
  const ticket: TicketRecord = {
    frontMatter,
    markdown: input.markdown,
    filePath: ticketPath(projectPath, frontMatter.id)
  };
  return writeTicket(projectPath, ticket);
};

const calculatePosition = (tickets: TicketSummary[], targetStatus: string, beforeId?: string | null, afterId?: string | null): number => {
  const targetTickets = tickets
    .filter((ticket) => ticket.status === targetStatus && ticket.id !== beforeId && ticket.id !== afterId)
    .sort((a, b) => a.position - b.position);
  const before = beforeId ? tickets.find((ticket) => ticket.id === beforeId) : null;
  const after = afterId ? tickets.find((ticket) => ticket.id === afterId) : null;

  if (before && after) return (before.position + after.position) / 2;
  if (before) return before.position - 1000;
  if (after) return after.position + 1000;
  return (targetTickets.at(-1)?.position ?? 0) + 1000;
};

type StatusTransitionOptions = {
  actor: RelayActor;
  source: RelayEventSource;
  runId?: string | null;
  beforeTicketId?: string | null;
  afterTicketId?: string | null;
};

export const transitionTicketStatus = async (
  projectPath: string,
  ticketId: string,
  targetStatus: string,
  options: StatusTransitionOptions
): Promise<TicketRecord> => {
  const config = await readProjectConfig(projectPath);
  if (!config.columns.some((column) => column.id === targetStatus)) {
    throw new Error(`Unknown ticket status: ${targetStatus}`);
  }

  const board = await readBoard(projectPath);
  const record = await readTicket(projectPath, ticketId);
  const fromStatus = record.frontMatter.status;
  const position =
    fromStatus === targetStatus
      ? record.frontMatter.position
      : calculatePosition(board.tickets, targetStatus, options.beforeTicketId, options.afterTicketId);

  const updated = await writeTicket(projectPath, {
    ...record,
    frontMatter: {
      ...record.frontMatter,
      status: targetStatus,
      position
    }
  });

  if (fromStatus !== targetStatus) {
    await appendAuditEvent(projectPath, {
      actor: options.actor,
      source: options.source,
      eventType: "ticket.status_changed",
      ticketId,
      runId: options.runId ?? null,
      payload: {
        fromStatus,
        toStatus: targetStatus,
        position
      }
    });
  }

  return updated;
};

export const saveTicket = async (input: TicketSaveInput): Promise<TicketRecord> => {
  const config = await readProjectConfig(input.projectPath);
  const targetStatus = input.ticket.frontMatter.status;
  if (!config.columns.some((column) => column.id === targetStatus)) {
    throw new Error(`Unknown ticket status: ${targetStatus}`);
  }

  const existing = await readTicket(input.projectPath, input.ticket.frontMatter.id);
  const statusChanged = existing.frontMatter.status !== targetStatus;
  let position = input.ticket.frontMatter.position;
  if (statusChanged) {
    const board = await readBoard(input.projectPath);
    position = calculatePosition(board.tickets, targetStatus);
  }

  const updated = await writeTicket(input.projectPath, {
    ...input.ticket,
    frontMatter: {
      ...input.ticket.frontMatter,
      position
    }
  });

  if (statusChanged) {
    await appendAuditEvent(input.projectPath, {
      actor: "user",
      source: "manual_ticket_edit",
      eventType: "ticket.status_changed",
      ticketId: updated.frontMatter.id,
      runId: updated.frontMatter.lastRunId,
      payload: {
        fromStatus: existing.frontMatter.status,
        toStatus: targetStatus,
        position
      }
    });
  }

  return updated;
};

export const moveTicket = async (input: TicketMoveInput): Promise<BoardSnapshot> => {
  await transitionTicketStatus(input.projectPath, input.ticketId, input.targetStatus, {
    actor: "user",
    source: "manual_board",
    beforeTicketId: input.beforeTicketId,
    afterTicketId: input.afterTicketId
  });
  return readBoard(input.projectPath);
};

const clarificationStorePath = (projectPath: string, ticketId: string): string =>
  path.join(clarificationsPath(projectPath), `${ticketId}.json`);

const writeClarificationQuestions = async (
  projectPath: string,
  ticketId: string,
  questions: ClarificationQuestion[]
): Promise<ClarificationQuestion[]> => {
  await atomicWriteJson(clarificationStorePath(projectPath, ticketId), {
    schemaVersion: RELAY_SCHEMA_VERSION,
    ticketId,
    questions
  });
  return questions;
};

export const readClarificationQuestions = async (projectPath: string, ticketId: string): Promise<ClarificationQuestion[]> => {
  const target = clarificationStorePath(projectPath, ticketId);
  if (!(await fileExists(target))) return [];
  const raw = await readFile(target, "utf8");
  const parsed = clarificationStoreSchema.parse(JSON.parse(raw));
  return parsed.questions as ClarificationQuestion[];
};

export const createClarificationQuestions = async (
  projectPath: string,
  ticketId: string,
  inputs: ClarificationQuestionCreateInput[],
  options: {
    actor: RelayActor;
    source: RelayEventSource;
    runId?: string | null;
    codexThreadId?: string | null;
  }
): Promise<ClarificationQuestion[]> => {
  await readTicket(projectPath, ticketId);
  const existing = await readClarificationQuestions(projectPath, ticketId);
  const now = nowIso();
  const created = inputs
    .map((input) => ({
      question: input.question.trim(),
      answerType: input.answerType ?? "text"
    }))
    .filter((input) => input.question.length > 0)
    .map((input): ClarificationQuestion => ({
      id: newId("clar"),
      ticketId,
      question: input.question,
      answerType: input.answerType,
      answer: null,
      createdAt: now,
      updatedAt: now,
      answeredAt: null,
      createdBy: options.actor,
      source: options.source,
      runId: options.runId ?? null,
      codexThreadId: options.codexThreadId ?? null
    }));

  if (created.length === 0) return [];

  await writeClarificationQuestions(projectPath, ticketId, [...existing, ...created]);
  for (const question of created) {
    await appendAuditEvent(projectPath, {
      actor: options.actor,
      source: options.source,
      eventType: "clarification.question_created",
      ticketId,
      runId: options.runId ?? null,
      payload: {
        questionId: question.id,
        question: question.question,
        answerType: question.answerType
      }
    });
  }
  return created;
};

export const answerClarificationQuestion = async (
  projectPath: string,
  ticketId: string,
  questionId: string,
  answer: string
): Promise<ClarificationQuestion> => {
  const trimmed = answer.trim();
  if (!trimmed) throw new Error("Clarification answer cannot be empty.");

  const questions = await readClarificationQuestions(projectPath, ticketId);
  const target = questions.find((question) => question.id === questionId);
  if (!target) throw new Error(`Unknown clarification question: ${questionId}`);

  const now = nowIso();
  const updated: ClarificationQuestion = {
    ...target,
    answer: trimmed,
    answeredAt: now,
    updatedAt: now
  };
  const nextQuestions = questions.map((question) => (question.id === questionId ? updated : question));
  await writeClarificationQuestions(projectPath, ticketId, nextQuestions);
  await appendAuditEvent(projectPath, {
    actor: "user",
    source: "clarification_ui",
    eventType: "clarification.answer_submitted",
    ticketId,
    runId: target.runId,
    payload: {
      questionId,
      answer: trimmed
    }
  });
  return updated;
};

export const deleteTicket = async (projectPath: string, ticketId: string): Promise<BoardSnapshot> => {
  const source = ticketPath(projectPath, ticketId);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(trashPath(projectPath), stamp, `${ticketId}.md`);
  await mkdir(path.dirname(target), { recursive: true });
  await rename(source, target);
  return readBoard(projectPath);
};

export const duplicateTicket = async (projectPath: string, ticketId: string): Promise<TicketRecord> => {
  const source = await readTicket(projectPath, ticketId);
  return createTicket(projectPath, {
    title: `${source.frontMatter.title} Copy`,
    priority: source.frontMatter.priority,
    labels: source.frontMatter.labels,
    markdown: source.markdown,
    status: source.frontMatter.status
  });
};

export const revealTicketFile = async (projectPath: string, ticketId: string): Promise<void> => {
  shell.showItemInFolder(ticketPath(projectPath, ticketId));
};

export const appendCodexHandoff = (markdown: string, handoff: string): string => {
  const marker = "## Codex Handoff";
  const entry = `\n\n### ${new Date().toLocaleString()}\n\n${handoff.trim()}\n`;
  if (!markdown.includes(marker)) {
    return `${markdown.trimEnd()}\n\n${marker}${entry}`;
  }
  return markdown.replace(marker, `${marker}${entry}`);
};
