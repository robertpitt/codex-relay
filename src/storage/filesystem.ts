import { Effect, FileSystem, Path } from "effect";
import matter from "gray-matter";
import {
  DEFAULT_COLUMNS,
  RELAY_IN_PROGRESS_STATUS,
  RELAY_NEEDS_CLARIFICATION_STATUS,
  RELAY_READY_STATUS,
  RELAY_REVIEW_STATUS,
  RELAY_SCHEMA_VERSION,
  RELAY_TODO_STATUS,
  type BoardSnapshot,
  type ClarificationQuestion,
  type ClarificationQuestionStore,
  type ClarificationQuestionCreateInput,
  type CreateDraftInput,
  type InvalidTicket,
  type ProjectConfig,
  type ProjectSettings,
  type ProjectSummary,
  type ProjectSwimlaneSummary,
  type RelayActor,
  type RelayColumn,
  type RelayEventSource,
  type RelayAuditEvent,
  type EpicSubticketCreateInput,
  type TicketAttachmentSaveInput,
  type TicketAttachmentSaveResult,
  type TicketCreateInput,
  type TicketDraft,
  type TicketDraftResearch,
  type TicketDraftSubticket,
  type TicketFrontMatter,
  type SubticketCreateInput,
  type TicketMoveInput,
  type TicketReferenceCandidate,
  type TicketRecord,
  type TicketSaveInput,
  type TicketSummary,
  type TicketType
} from "@shared/schemas";
import { imageAttachmentExtension, isSupportedImageAttachment } from "@shared/attachments";
import { uniqueTicketIds } from "@shared/blockers";
import { clarificationStoreSchema, projectConfigSchema, ticketFrontMatterSchema } from "@shared/schemas";
import { extractTicketChecklist } from "@shared/ticketMetadata";
import { BackendClock, type BackendEffect, runBackendEffect } from "../runtime";
import { showElectronItemInFolder } from "../platform/electron";
import { isFileNotFoundError } from "../platform/PlatformError";
import {
  pathBasename,
  pathExtname,
  pathJoin,
  pathRelative
} from "../io";
import { parseSchema } from "../services/schemas";
import { TicketNotFoundError, isTicketNotFoundError } from "./errors";
import { atomicWriteJson, atomicWriteText } from "./files";
import { newId } from "./ids";
import {
  attachmentsPath,
  auditLogPath,
  backupsPath,
  clarificationStorePath,
  clarificationsPath,
  projectConfigPath,
  resolveProjectPath,
  runsPath,
  slashPath,
  ticketPath,
  ticketsPath,
  trashPath
} from "./paths";

const defaultSettings = (): ProjectSettings => ({
  defaultModel: null,
  defaultModelReasoningEffort: null,
  defaultTicketEffort: "medium",
  defaultApprovalPolicy: "on-request",
  defaultSandboxMode: "workspace-write",
  allowNonGitCodexRuns: false,
  ticketDraftingEnabled: true,
  codexExecutionEnabled: true,
  codexNetworkAccessEnabled: false,
  codexWebSearchMode: "disabled",
  codexAdditionalDirectories: [],
  agentConcurrency: 1
});

const nowIso = (): string => new Date().toISOString();

const isSidebarActiveRunStatus = (status: TicketSummary["runStatus"]): boolean =>
  status === "queued" || status === "drafting" || status === "running" || status === "blocked";

const normalizeProjectColumns = (columns: RelayColumn[]): RelayColumn[] => {
  const normalized = columns.map((column) => ({ ...column }));
  const columnIds = new Set(normalized.map((column) => column.id));
  for (const defaultColumn of DEFAULT_COLUMNS) {
    if (columnIds.has(defaultColumn.id)) continue;
    if (defaultColumn.id === RELAY_READY_STATUS) {
      const after = normalized.find((column) => column.id === RELAY_TODO_STATUS)?.position ?? 1000;
      const before = normalized.find((column) => column.id === RELAY_IN_PROGRESS_STATUS)?.position ?? defaultColumn.position;
      normalized.push({
        ...defaultColumn,
        position: before > after ? (after + before) / 2 : defaultColumn.position
      });
    } else if (defaultColumn.id === RELAY_REVIEW_STATUS) {
      const after = normalized.find((column) => column.id === RELAY_NEEDS_CLARIFICATION_STATUS)?.position ?? 4000;
      const before =
        normalized.find((column) => column.id === "not_doing")?.position ??
        normalized.find((column) => column.id === "completed")?.position ??
        defaultColumn.position;
      normalized.push({
        ...defaultColumn,
        position: before > after ? (after + before) / 2 : defaultColumn.position
      });
    } else {
      normalized.push({ ...defaultColumn });
    }
  }
  return normalized.sort((a, b) => a.position - b.position);
};

const normalizeProjectConfig = (config: ProjectConfig): ProjectConfig => ({
  ...config,
  columns: normalizeProjectColumns(config.columns)
});

export const isGitRepository = async (projectPath: string): Promise<boolean> =>
  runBackendEffect(FileSystem.FileSystem.use((fs) => fs.exists(pathJoin(projectPath, ".git"))));

const appendAuditEventEffect = (
  projectPath: string,
  event: Omit<RelayAuditEvent, "schemaVersion" | "timestamp">
): BackendEffect<void> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const clock = yield* BackendClock;
    const record: RelayAuditEvent = {
      schemaVersion: RELAY_SCHEMA_VERSION,
      timestamp: clock.nowIso(),
      ...event
    };
    const target = auditLogPath(projectPath);
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.writeFileString(target, `${JSON.stringify(record)}\n`, { flag: "a" });
  });

const appendAuditEvent = (projectPath: string, event: Omit<RelayAuditEvent, "schemaVersion" | "timestamp">): Promise<void> =>
  runBackendEffect(appendAuditEventEffect(projectPath, event));

const assertDirectory = async (projectPath: string): Promise<void> => {
  const info = await runBackendEffect(FileSystem.FileSystem.use((fs) => fs.stat(projectPath)));
  if (info.type !== "Directory") {
    throw new Error(`Project path is not a directory: ${projectPath}`);
  }
};

export const isRelayInitialized = async (projectPath: string): Promise<boolean> =>
  runBackendEffect(FileSystem.FileSystem.use((fs) => fs.exists(projectConfigPath(projectPath))));

export const initializeProject = async (projectPath: string): Promise<ProjectConfig> => {
  const resolved = resolveProjectPath(projectPath);
  await assertDirectory(resolved);
  const existing = await isRelayInitialized(resolved);
  if (existing) return readProjectConfig(resolved);

  const now = nowIso();
  const config: ProjectConfig = {
    schemaVersion: RELAY_SCHEMA_VERSION,
    projectId: newId("prj"),
    name: pathBasename(resolved),
    createdAt: now,
    updatedAt: now,
    columns: DEFAULT_COLUMNS.map((column) => ({ ...column })),
    settings: defaultSettings()
  };

  await runBackendEffect(
    FileSystem.FileSystem.use((fs) =>
      Effect.gen(function*() {
        yield* fs.makeDirectory(ticketsPath(resolved), { recursive: true });
        yield* fs.makeDirectory(runsPath(resolved), { recursive: true });
        yield* fs.makeDirectory(clarificationsPath(resolved), { recursive: true });
        yield* fs.makeDirectory(attachmentsPath(resolved), { recursive: true });
        yield* fs.makeDirectory(backupsPath(resolved), { recursive: true });
      })
    )
  );
  await atomicWriteJson(projectConfigPath(resolved), config);
  return config;
};

export const readProjectConfig = async (projectPath: string): Promise<ProjectConfig> => {
  const raw = await runBackendEffect(FileSystem.FileSystem.use((fs) => fs.readFileString(projectConfigPath(projectPath), "utf8")));
  return normalizeProjectConfig(parseSchema(projectConfigSchema, JSON.parse(raw)));
};

export const writeProjectConfig = async (projectPath: string, config: ProjectConfig): Promise<ProjectConfig> => {
  const updated = normalizeProjectConfig({ ...config, updatedAt: nowIso() });
  await atomicWriteJson(projectConfigPath(projectPath), updated);
  return updated;
};

const sanitizeAttachmentBaseName = (fileName: string): string => {
  const baseName = pathBasename(fileName.trim() || "image");
  const extension = pathExtname(baseName);
  const withoutExtension = extension ? baseName.slice(0, -extension.length) : baseName;
  const sanitized = withoutExtension
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^\.+/g, "")
    .slice(0, 64);
  return sanitized || "image";
};

const decodeBase64Content = (contentBase64: string): Uint8Array => {
  const normalized = contentBase64.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("Attachment content must be valid base64.");
  }
  const binary = globalThis.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export const saveTicketAttachment = async (input: TicketAttachmentSaveInput): Promise<TicketAttachmentSaveResult> => {
  const projectPath = resolveProjectPath(input.projectPath);
  const mimeType = input.mimeType ?? null;
  if (!isSupportedImageAttachment({ fileName: input.fileName, mimeType })) {
    throw new Error("Only image attachments can be saved.");
  }

  const content = decodeBase64Content(input.contentBase64);
  const extension = imageAttachmentExtension(input.fileName, mimeType);
  const safeBaseName = sanitizeAttachmentBaseName(input.fileName);
  const fileName = `${safeBaseName}-${newId("att")}${extension}`;
  const attachmentDirectory = attachmentsPath(projectPath);
  const absolutePath = pathJoin(attachmentDirectory, fileName);

  await runBackendEffect(
    FileSystem.FileSystem.use((fs) =>
      Effect.gen(function*() {
        yield* fs.makeDirectory(attachmentDirectory, { recursive: true });
        yield* fs.writeFile(absolutePath, content);
      })
    )
  );

  return {
    fileName,
    markdownPath: slashPath(pathRelative(projectPath, absolutePath)),
    absolutePath
  };
};

export const summarizeProject = async (projectPath: string, lastOpenedAt?: string): Promise<ProjectSummary> => {
  const resolved = resolveProjectPath(projectPath);
  const exists = await runBackendEffect(FileSystem.FileSystem.use((fs) => fs.exists(resolved)));
  const healthMessages: string[] = [];
  let config: ProjectConfig | null = null;
  let relayInitialized = false;
  let activeRunCount = 0;
  let swimlanes: ProjectSwimlaneSummary[] = [];

  if (!exists) {
    return {
      projectId: null,
      name: pathBasename(resolved),
      path: resolved,
      exists: false,
      isGitRepository: false,
      relayInitialized: false,
      health: "error",
      healthMessages: ["Project folder is missing."],
      activeRunCount: 0,
      swimlanes,
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
      const ticketCountsByStatus = new Map<string, number>();
      const activeRunCountsByStatus = new Map<string, number>();
      for (const ticket of tickets.tickets) {
        ticketCountsByStatus.set(ticket.status, (ticketCountsByStatus.get(ticket.status) ?? 0) + 1);
        if (isSidebarActiveRunStatus(ticket.runStatus)) {
          activeRunCountsByStatus.set(ticket.status, (activeRunCountsByStatus.get(ticket.status) ?? 0) + 1);
        }
      }
      swimlanes = [...config.columns]
        .sort((a, b) => a.position - b.position)
        .map((column) => ({
          id: column.id,
          name: column.name,
          position: column.position,
          ticketCount: ticketCountsByStatus.get(column.id) ?? 0,
          activeRunCount: activeRunCountsByStatus.get(column.id) ?? 0
        }));
      activeRunCount = tickets.tickets.filter((ticket) => isSidebarActiveRunStatus(ticket.runStatus)).length;
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
    name: config?.name ?? pathBasename(resolved),
    path: resolved,
    exists,
    isGitRepository: git,
    relayInitialized,
    health,
    healthMessages,
    activeRunCount,
    swimlanes,
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

const authoringStateFromLegacyRunStatus = (frontMatter: TicketFrontMatter): TicketFrontMatter["authoringState"] => {
  if (frontMatter.authoringState && frontMatter.authoringState !== "rough") return frontMatter.authoringState;
  switch (frontMatter.runStatus) {
    case "drafting":
      return "drafting";
    case "draft_complete":
    case "completed":
      return "reviewing";
    case "blocked":
      return "needs_input";
    case "queued":
    case "running":
      return "ready";
    default:
      return frontMatter.authoringState ?? "rough";
  }
};

const normalizeFrontMatterForRead = (frontMatter: TicketFrontMatter): TicketFrontMatter => ({
  ...frontMatter,
  authoringState: authoringStateFromLegacyRunStatus(frontMatter),
  relatedTicketIds: uniqueTicketIds(frontMatter.relatedTicketIds ?? [])
});

const readTicketFile = async (filePath: string): Promise<TicketRecord> => {
  const raw = await runBackendEffect(FileSystem.FileSystem.use((fs) => fs.readFileString(filePath, "utf8")));
  const parsed = matter(raw);
  const frontMatter = parseSchema(ticketFrontMatterSchema, parsed.data);
  const markdown = parsed.content.trimStart();
  return {
    frontMatter: normalizeFrontMatterForRead(frontMatter),
    markdown,
    filePath,
    checklist: extractTicketChecklist(markdown)
  };
};

const readTickets = async (
  projectPath: string,
  columns: RelayColumn[]
): Promise<{ tickets: TicketSummary[]; records: TicketRecord[]; invalidTickets: InvalidTicket[] }> => {
  const ticketDirectory = ticketsPath(projectPath);
  const entries = await runBackendEffect(
    FileSystem.FileSystem.use((fs) =>
      Effect.gen(function*() {
        yield* fs.makeDirectory(ticketDirectory, { recursive: true });
        return yield* fs.readDirectory(ticketDirectory);
      })
    )
  );
  const validColumnIds = new Set(columns.map((column) => column.id));
  const tickets: TicketSummary[] = [];
  const records: TicketRecord[] = [];
  const invalidTickets: InvalidTicket[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const filePath = pathJoin(ticketDirectory, entry);
    const info = await runBackendEffect(FileSystem.FileSystem.use((fs) => fs.stat(filePath)));
    if (info.type !== "File") continue;
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
        filePath,
        checklist: record.checklist
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
  const resolved = resolveProjectPath(projectPath);
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

const normalizeFrontMatterRelationships = (frontMatter: TicketFrontMatter): TicketFrontMatter => {
  const ticketType = frontMatter.ticketType ?? "task";
  return {
    ...frontMatter,
    ticketType,
    parentEpicId: ticketType === "epic" ? null : frontMatter.parentEpicId ?? null,
    subticketIds: ticketType === "epic" ? uniqueTicketIds(frontMatter.subticketIds ?? []) : [],
    blockedByIds: uniqueTicketIds(frontMatter.blockedByIds ?? []),
    relatedTicketIds: uniqueTicketIds(frontMatter.relatedTicketIds ?? [])
  };
};

const assertRelationshipShape = (frontMatter: TicketFrontMatter): void => {
  if (frontMatter.parentEpicId && frontMatter.parentEpicId === frontMatter.id) {
    throw new Error("A ticket cannot be linked as its own epic.");
  }
  if (frontMatter.ticketType === "epic" && frontMatter.parentEpicId) {
    throw new Error("Nested epics are not supported.");
  }
  if (frontMatter.ticketType === "task" && frontMatter.subticketIds.length > 0) {
    throw new Error("Only epic tickets can own subtickets.");
  }
  if (frontMatter.ticketType === "epic" && frontMatter.subticketIds.includes(frontMatter.id)) {
    throw new Error("An epic cannot include itself as a subticket.");
  }
  if (frontMatter.blockedByIds.includes(frontMatter.id)) {
    throw new Error("A ticket cannot block itself.");
  }
};

const relativeMarkdownPath = (fromDirectory: string, toFile: string): string => {
  const relativePath = slashPath(pathRelative(fromDirectory, toFile));
  if (relativePath.startsWith(".") || relativePath.startsWith("/")) return relativePath;
  return `./${relativePath}`;
};

export const listTicketReferenceCandidates = async (projectPath: string): Promise<TicketReferenceCandidate[]> => {
  const resolvedProjectPath = resolveProjectPath(projectPath);
  const config = await readProjectConfig(resolvedProjectPath);
  const columnNames = new Map(config.columns.map((column) => [column.id, column.name]));
  const columnPositions = new Map(config.columns.map((column) => [column.id, column.position]));
  const { tickets } = await readTickets(resolvedProjectPath, config.columns);
  const ticketDirectory = ticketsPath(resolvedProjectPath);

  return [...tickets]
    .sort((a, b) => {
      const columnDelta = (columnPositions.get(a.status) ?? Number.MAX_SAFE_INTEGER) - (columnPositions.get(b.status) ?? Number.MAX_SAFE_INTEGER);
      if (columnDelta !== 0) return columnDelta;
      return a.position - b.position;
    })
    .map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      columnName: columnNames.get(ticket.status) ?? ticket.status,
      relativePath: slashPath(pathRelative(resolvedProjectPath, ticket.filePath)),
      linkPath: relativeMarkdownPath(ticketDirectory, ticket.filePath)
    }));
};

export const readTicket = async (projectPath: string, ticketId: string): Promise<TicketRecord> => {
  const resolvedProjectPath = resolveProjectPath(projectPath);
  const target = ticketPath(resolvedProjectPath, ticketId);
  try {
    return await readTicketFile(target);
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new TicketNotFoundError(resolvedProjectPath, ticketId, target, error);
    }
    throw error;
  }
};

const assertEpicTicket = async (projectPath: string, epicId: string): Promise<TicketRecord> => {
  const epic = await readTicket(projectPath, epicId);
  if (epic.frontMatter.ticketType !== "epic") {
    throw new Error(`Ticket ${epicId} is not an epic.`);
  }
  return epic;
};

const addSubticketIdToEpic = async (projectPath: string, epicId: string, ticketId: string): Promise<TicketRecord> => {
  if (epicId === ticketId) {
    throw new Error("An epic cannot include itself as a subticket.");
  }
  const epic = await assertEpicTicket(projectPath, epicId);
  if (epic.frontMatter.subticketIds.includes(ticketId)) return epic;
  return writeTicket(projectPath, {
    ...epic,
    frontMatter: {
      ...epic.frontMatter,
      subticketIds: [...epic.frontMatter.subticketIds, ticketId]
    }
  });
};

const removeSubticketIdFromEpic = async (projectPath: string, epicId: string, ticketId: string): Promise<TicketRecord | null> => {
  try {
    const epic = await assertEpicTicket(projectPath, epicId);
    if (!epic.frontMatter.subticketIds.includes(ticketId)) return epic;
    return writeTicket(projectPath, {
      ...epic,
      frontMatter: {
        ...epic.frontMatter,
        subticketIds: epic.frontMatter.subticketIds.filter((id) => id !== ticketId)
      }
    });
  } catch (error) {
    if (isTicketNotFoundError(error)) return null;
    throw error;
  }
};

const validateParentEpic = async (projectPath: string, frontMatter: TicketFrontMatter): Promise<void> => {
  assertRelationshipShape(frontMatter);
  if (frontMatter.parentEpicId) {
    await assertEpicTicket(projectPath, frontMatter.parentEpicId);
  }
};

const stringifyTicket = (ticket: TicketRecord): string => {
  const body = ticket.markdown.trimStart();
  return matter.stringify(body.endsWith("\n") ? body : `${body}\n`, ticket.frontMatter);
};

export const writeTicket = async (projectPath: string, ticket: TicketRecord): Promise<TicketRecord> => {
  const target = ticketPath(projectPath, ticket.frontMatter.id);
  const frontMatter = normalizeFrontMatterRelationships(ticket.frontMatter);
  assertRelationshipShape(frontMatter);
  const next: TicketRecord = {
    ...ticket,
    filePath: target,
    checklist: extractTicketChecklist(ticket.markdown),
    frontMatter: {
      ...frontMatter,
      updatedAt: nowIso()
    }
  };
  await atomicWriteText(target, stringifyTicket(next));
  return next;
};

type TicketMarkdownDraft = TicketDraftSubticket & { research?: TicketDraft["research"] };

const markdownList = (items: readonly string[] | undefined): string => {
  if (!items) return "- None.";
  const cleaned = items.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.map((item) => `- ${item}`).join("\n") : "- None.";
};

const researchMetadataMarkdown = (research?: TicketDraftResearch): string => {
  if (
    !research ||
    (research.checkedUrls.length === 0 && research.inspectedFiles.length === 0 && research.limitations.length === 0)
  ) {
    return "- No research metadata recorded.";
  }
  const urls = research.checkedUrls.map((source) => {
    const title = source.title ? ` (${source.title})` : "";
    const reason = source.reason ? ` - ${source.reason}` : "";
    return `- URL ${source.status}: ${source.url}${title}; characters read: ${source.charactersRead}${reason}`;
  });
  const files = research.inspectedFiles.map((file) => {
    const symbols = file.symbols.length > 0 ? `; symbols: ${file.symbols.slice(0, 6).join(", ")}` : "";
    const matches =
      file.matches.length > 0 ? `\n  Matched lines:\n${file.matches.map((match) => `  - ${match}`).join("\n")}` : "";
    return `- File inspected: ${file.path} - ${file.reason}; characters read: ${file.charactersRead}${symbols}${matches}`;
  });
  const limitations = research.limitations.map((limitation) => `- Limitation: ${limitation}`);
  return [...urls, ...files, ...limitations].join("\n");
};

const draftGoal = (draft: TicketMarkdownDraft): string =>
  draft.requirements.find((item) => item.trim().length > 0) ?? `Deliver ${draft.title}.`;

const draftDecisionList = (draft: TicketMarkdownDraft): string[] => [
  ...(draft.assumptions ?? []),
  ...(draft.clarificationQuestions ?? [])
];

const draftImplementationNotes = (draft: TicketMarkdownDraft): string[] => [
  ...(draft.researchFindings ?? []).map((finding) => `Codebase finding: ${finding}`),
  ...(draft.implementationPlan ?? []).map((step) => `Implementation: ${step}`),
  ...(draft.implementationNotes ?? [])
];

export const ticketMarkdownFromDraft = (draft: TicketMarkdownDraft): string => {
  return `# ${draft.title}

## Context

${draft.context || "No additional context provided."}

## Goal

${draftGoal(draft)}

## Decisions / Assumptions

${markdownList(draftDecisionList(draft))}

## Requirements

${markdownList(draft.requirements)}

## Acceptance Criteria

${markdownList(draft.acceptanceCriteria)}

## Test Plan

${markdownList(draft.testPlan)}

## Implementation Notes

${markdownList(draftImplementationNotes(draft))}

## Codex Handoff

No Codex run has been started.
`;
};

export const ticketMarkdownFromSubticketDraft = (draft: TicketDraftSubticket, parentTitle: string): string => `# ${draft.title}

## Context

Parent epic: ${parentTitle}

${draft.context || "No additional context provided."}

## Goal

${draftGoal(draft)}

## Decisions / Assumptions

${markdownList(draftDecisionList(draft))}

## Requirements

${markdownList(draft.requirements)}

## Acceptance Criteria

${markdownList(draft.acceptanceCriteria)}

## Test Plan

${markdownList(draft.testPlan)}

## Implementation Notes

${markdownList(draftImplementationNotes(draft))}

## Codex Handoff

No Codex run has been started.
`;

const normalizeDraftIdea = (idea: string): string => idea.replace(/\s+/g, " ").trim();

const truncateTitle = (value: string, maxLength = 80): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
};

const pendingTicketDraftTitle = (idea: string, ticketType?: TicketType): string => {
  const normalized = normalizeDraftIdea(idea).replace(/^#+\s*/, "");
  const fallback = ticketType === "epic" ? "Untitled epic draft" : "Untitled ticket draft";
  return `Draft: ${truncateTitle(normalized || fallback)}`;
};

const ticketMarkdownFromPendingDraft = (title: string, idea: string): string => `# ${title}

## Drafting State

The agent is drafting this ticket. The generated plan will replace this placeholder when the draft run completes.

## Original Idea

${idea.trim() || "No idea was provided."}

## Codex Handoff

Ticket draft generation is in progress.
`;

const ticketMarkdownFromDraftFailure = (title: string, idea: string, message: string): string => `# ${title}

## Drafting State

Agent ticket drafting failed. The original idea is preserved so this ticket can be edited manually or retried later.

## Recoverable Error

${message.trim() || "Ticket drafting failed."}

## Original Idea

${idea.trim() || "No idea was provided."}

## Codex Handoff

Ticket draft generation failed before a generated plan could be applied.
`;

const ticketMarkdownFromDraftClarification = (
  title: string,
  idea: string,
  questions: readonly string[],
  research?: TicketDraftResearch
): string => `# ${title}

## Drafting State

The agent researched this draft but needs user input before it can produce an implementation-ready ticket. Answer the clarification questions below; drafting will resume automatically once every question is answered.

## Original Idea

${idea.trim() || "No idea was provided."}

## Open Clarification Questions

${markdownList(questions)}

## Research Metadata

${researchMetadataMarkdown(research)}

## Codex Handoff

Ticket draft generation is blocked on clarification.
`;

const createSingleTicket = async (projectPath: string, input: TicketCreateInput): Promise<TicketRecord> => {
  const config = await readProjectConfig(projectPath);
  const status = input.status ?? "todo";
  if (!config.columns.some((column) => column.id === status)) {
    throw new Error(`Unknown ticket status: ${status}`);
  }
  const ticketType: TicketType = input.ticketType ?? "task";
  if (ticketType === "epic" && input.parentEpicId) {
    throw new Error("Nested epics are not supported.");
  }
  const board = await readBoard(projectPath);
  const lastPosition = Math.max(0, ...board.tickets.filter((ticket) => ticket.status === status).map((ticket) => ticket.position));
  const createdAt = nowIso();
  const id = newId("tkt");
  const frontMatter: TicketFrontMatter = {
    schemaVersion: RELAY_SCHEMA_VERSION,
    id,
    title: input.title.trim(),
    ticketType,
    status,
    position: lastPosition + 1000,
    priority: input.priority,
    effort: input.effort ?? config.settings.defaultTicketEffort,
    labels: input.labels.map((label) => label.trim()).filter(Boolean),
    parentEpicId: ticketType === "task" ? input.parentEpicId ?? null : null,
    subticketIds: [],
    blockedByIds: uniqueTicketIds(input.blockedByIds ?? []),
    relatedTicketIds: uniqueTicketIds(input.relatedTicketIds ?? []),
    createdAt,
    updatedAt: createdAt,
    authoringState: input.authoringState ?? "rough",
    codexThreadId: null,
    runStatus: "idle",
    lastRunId: null,
    lastRunStartedAt: null
  };
  await validateParentEpic(projectPath, frontMatter);
  const ticket: TicketRecord = {
    frontMatter,
    markdown: input.markdown,
    filePath: ticketPath(projectPath, frontMatter.id),
    checklist: extractTicketChecklist(input.markdown)
  };
  return writeTicket(projectPath, ticket);
};

export const createPendingTicketDraft = async (
  projectPath: string,
  input: CreateDraftInput,
  runId: string
): Promise<TicketRecord> => {
  const idea = input.idea.trim();
  if (!idea) {
    throw new Error("Describe the ticket idea before drafting with the agent.");
  }

  const ticketType = input.preferredTicketType ?? "task";
  const title = pendingTicketDraftTitle(idea, ticketType);
  const placeholder = await createSingleTicket(projectPath, {
    title,
    priority: input.priority ?? "medium",
    effort: input.effort,
    labels: [],
    markdown: ticketMarkdownFromPendingDraft(title, idea),
    status: RELAY_TODO_STATUS,
    ticketType,
    relatedTicketIds: input.relatedTicketIds
  });

  return writeTicket(projectPath, {
    ...placeholder,
    frontMatter: {
      ...placeholder.frontMatter,
      authoringState: "drafting",
      runStatus: "drafting",
      lastRunId: runId
    }
  });
};

const createSubticketRecord = async (
  projectPath: string,
  epicId: string,
  input: SubticketCreateInput
): Promise<TicketRecord> => {
  await assertEpicTicket(projectPath, epicId);
  const child = await createSingleTicket(projectPath, {
    ...input,
    ticketType: "task",
    parentEpicId: epicId,
    subtickets: []
  });
  await addSubticketIdToEpic(projectPath, epicId, child.frontMatter.id);
  return readTicket(projectPath, child.frontMatter.id);
};

export const createTicket = async (projectPath: string, input: TicketCreateInput): Promise<TicketRecord> => {
  const subtickets = input.subtickets ?? [];
  const ticketType: TicketType = input.ticketType ?? "task";
  if (ticketType !== "epic" && subtickets.length > 0) {
    throw new Error("Only epic tickets can be created with subtickets.");
  }
  const ticket = await createSingleTicket(projectPath, {
    ...input,
    ticketType,
    subtickets: [],
    subticketIds: []
  });

  if (ticket.frontMatter.parentEpicId) {
    await addSubticketIdToEpic(projectPath, ticket.frontMatter.parentEpicId, ticket.frontMatter.id);
  }

  for (const subticket of subtickets) {
    await createSubticketRecord(projectPath, ticket.frontMatter.id, subticket);
  }

  return readTicket(projectPath, ticket.frontMatter.id);
};

export const applyTicketDraftToTicket = async (
  projectPath: string,
  ticketId: string,
  draft: TicketDraft,
  runId: string
): Promise<TicketRecord> => {
  const existing = await readTicket(projectPath, ticketId);
  const updated = await writeTicket(projectPath, {
    ...existing,
    markdown: ticketMarkdownFromDraft(draft),
    frontMatter: {
      ...existing.frontMatter,
      title: draft.title.trim(),
      ticketType: draft.ticketType,
      priority: draft.priority,
      labels: draft.labels.map((label) => label.trim()).filter(Boolean),
      parentEpicId: null,
      subticketIds: [],
      authoringState: "reviewing",
      runStatus: "draft_complete",
      lastRunId: runId
    }
  });

  if (draft.ticketType === "epic") {
    for (const subticket of draft.subtickets) {
      await createSubticketRecord(projectPath, updated.frontMatter.id, {
        title: subticket.title,
        priority: subticket.priority,
        effort: updated.frontMatter.effort,
        labels: subticket.labels,
        markdown: ticketMarkdownFromSubticketDraft(subticket, draft.title)
      });
    }
  }

  return readTicket(projectPath, updated.frontMatter.id);
};

export const failPendingTicketDraft = async (
  projectPath: string,
  ticketId: string,
  idea: string,
  runId: string,
  message: string
): Promise<TicketRecord> => {
  const existing = await readTicket(projectPath, ticketId);
  return writeTicket(projectPath, {
    ...existing,
    markdown: ticketMarkdownFromDraftFailure(existing.frontMatter.title, idea, message),
    frontMatter: {
      ...existing.frontMatter,
      authoringState: "rough",
      runStatus: "draft_failed",
      lastRunId: runId
    }
  });
};

export const blockPendingTicketDraftForClarification = async (
  projectPath: string,
  ticketId: string,
  idea: string,
  runId: string,
  questions: readonly string[],
  research?: TicketDraftResearch
): Promise<TicketRecord> => {
  const existing = await readTicket(projectPath, ticketId);
  const config = await readProjectConfig(projectPath);
  const status = config.columns.some((column) => column.id === RELAY_NEEDS_CLARIFICATION_STATUS)
    ? RELAY_NEEDS_CLARIFICATION_STATUS
    : existing.frontMatter.status;
  return writeTicket(projectPath, {
    ...existing,
    markdown: ticketMarkdownFromDraftClarification(existing.frontMatter.title, idea, questions, research),
    frontMatter: {
      ...existing.frontMatter,
      status,
      authoringState: "needs_input",
      runStatus: "blocked",
      lastRunId: runId
    }
  });
};

export const createSubticket = async ({ projectPath, epicId, ticket }: EpicSubticketCreateInput): Promise<TicketRecord> =>
  createSubticketRecord(projectPath, epicId, ticket);

export const linkSubticket = async (projectPath: string, epicId: string, ticketId: string): Promise<BoardSnapshot> => {
  if (epicId === ticketId) {
    throw new Error("An epic cannot include itself as a subticket.");
  }
  await assertEpicTicket(projectPath, epicId);
  const child = await readTicket(projectPath, ticketId);
  if (child.frontMatter.ticketType === "epic") {
    throw new Error("Nested epics are not supported.");
  }
  if (child.frontMatter.parentEpicId && child.frontMatter.parentEpicId !== epicId) {
    await removeSubticketIdFromEpic(projectPath, child.frontMatter.parentEpicId, ticketId);
  }
  await writeTicket(projectPath, {
    ...child,
    frontMatter: {
      ...child.frontMatter,
      parentEpicId: epicId,
      subticketIds: []
    }
  });
  await addSubticketIdToEpic(projectPath, epicId, ticketId);
  return readBoard(projectPath);
};

export const unlinkSubticket = async (projectPath: string, epicId: string, ticketId: string): Promise<BoardSnapshot> => {
  await assertEpicTicket(projectPath, epicId);
  const child = await readTicket(projectPath, ticketId);
  if (child.frontMatter.parentEpicId === epicId) {
    await writeTicket(projectPath, {
      ...child,
      frontMatter: {
        ...child.frontMatter,
        parentEpicId: null
      }
    });
  }
  await removeSubticketIdFromEpic(projectPath, epicId, ticketId);
  return readBoard(projectPath);
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

export type StatusTransitionOptions = {
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

export const setTicketQueued = async (projectPath: string, ticketId: string, runId: string): Promise<TicketRecord> => {
  const config = await readProjectConfig(projectPath);
  const current = await readTicket(projectPath, ticketId);
  const targetStatus = config.columns.some((column) => column.id === RELAY_READY_STATUS)
    ? RELAY_READY_STATUS
    : current.frontMatter.status;
  const queuedInLane =
    current.frontMatter.status === targetStatus
      ? current
      : await transitionTicketStatus(projectPath, ticketId, targetStatus, {
          actor: "codex",
          source: "agent_execution",
          runId
        });

  return writeTicket(projectPath, {
    ...queuedInLane,
    frontMatter: {
      ...queuedInLane.frontMatter,
      authoringState: "ready",
      runStatus: "queued",
      lastRunId: runId
    }
  });
};

export const clearQueuedTicket = async (
  projectPath: string,
  ticketId: string,
  targetStatus?: string | null,
  expectedRunId?: string | null
): Promise<TicketRecord> => {
  const current = await readTicket(projectPath, ticketId);
  if (current.frontMatter.runStatus !== "queued") return current;
  if (expectedRunId && current.frontMatter.lastRunId !== expectedRunId) return current;

  const runId = current.frontMatter.lastRunId;
  const cleared = await writeTicket(projectPath, {
    ...current,
    frontMatter: {
      ...current.frontMatter,
      authoringState: "reviewing",
      runStatus: "idle",
      lastRunId: null
    }
  });

  if (!targetStatus || cleared.frontMatter.status === targetStatus) return cleared;
  const config = await readProjectConfig(projectPath);
  if (!config.columns.some((column) => column.id === targetStatus)) return cleared;
  return transitionTicketStatus(projectPath, ticketId, targetStatus, {
    actor: "system",
    source: "system_reconciliation",
    runId
  });
};

export const listQueuedReadyTickets = async (projectPath: string): Promise<TicketSummary[]> => {
  const board = await readBoard(projectPath);
  return board.tickets
    .filter((ticket) => ticket.status === RELAY_READY_STATUS && ticket.runStatus === "queued" && Boolean(ticket.lastRunId))
    .sort((a, b) => a.position - b.position);
};

export const saveTicket = async (input: TicketSaveInput): Promise<TicketRecord> => {
  const config = await readProjectConfig(input.projectPath);
  const targetStatus = input.ticket.frontMatter.status;
  if (!config.columns.some((column) => column.id === targetStatus)) {
    throw new Error(`Unknown ticket status: ${targetStatus}`);
  }

  const existing = await readTicket(input.projectPath, input.ticket.frontMatter.id);
  const normalizedFrontMatter = normalizeFrontMatterRelationships(input.ticket.frontMatter);
  await validateParentEpic(input.projectPath, normalizedFrontMatter);
  const statusChanged = existing.frontMatter.status !== targetStatus;
  let position = input.ticket.frontMatter.position;
  if (statusChanged) {
    const board = await readBoard(input.projectPath);
    position = calculatePosition(board.tickets, targetStatus);
  }

  const updated = await writeTicket(input.projectPath, {
    ...input.ticket,
    frontMatter: {
      ...normalizedFrontMatter,
      position
    }
  });

  if (existing.frontMatter.parentEpicId && existing.frontMatter.parentEpicId !== updated.frontMatter.parentEpicId) {
    await removeSubticketIdFromEpic(input.projectPath, existing.frontMatter.parentEpicId, updated.frontMatter.id);
  }
  if (updated.frontMatter.parentEpicId && existing.frontMatter.parentEpicId !== updated.frontMatter.parentEpicId) {
    await addSubticketIdToEpic(input.projectPath, updated.frontMatter.parentEpicId, updated.frontMatter.id);
  }

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

const writeClarificationQuestions = async (
  projectPath: string,
  ticketId: string,
  questions: ClarificationQuestion[]
): Promise<ClarificationQuestion[]> => {
  const store: ClarificationQuestionStore = {
    schemaVersion: RELAY_SCHEMA_VERSION,
    ticketId,
    questions
  };
  await atomicWriteJson(clarificationStorePath(projectPath, ticketId), store);
  return questions;
};

export const readClarificationQuestions = async (projectPath: string, ticketId: string): Promise<ClarificationQuestion[]> => {
  const target = clarificationStorePath(projectPath, ticketId);
  const raw = await runBackendEffect(
    FileSystem.FileSystem.use((fs) =>
      fs.readFileString(target, "utf8").pipe(
        Effect.catchIf(isFileNotFoundError, () => Effect.succeed(null as string | null))
      )
    )
  );
  if (raw === null) return [];
  const parsed = parseSchema(clarificationStoreSchema, JSON.parse(raw));
  return parsed.questions;
};

export type ClarificationQuestionCreateOptions = {
  readonly actor: RelayActor;
  readonly source: RelayEventSource;
  readonly runId?: string | null;
  readonly codexThreadId?: string | null;
};

export const createClarificationQuestions = async (
  projectPath: string,
  ticketId: string,
  inputs: ClarificationQuestionCreateInput[],
  options: ClarificationQuestionCreateOptions
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
  if (nextQuestions.every((question) => question.answer?.trim())) {
    const ticket = await readTicket(projectPath, ticketId);
    if (ticket.frontMatter.authoringState === "needs_input") {
      await writeTicket(projectPath, {
        ...ticket,
        frontMatter: {
          ...ticket.frontMatter,
          authoringState: "reviewing"
        }
      });
    }
  }
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

const unlinkTicketRelationshipsBeforeDelete = async (projectPath: string, ticket: TicketRecord): Promise<void> => {
  if (ticket.frontMatter.parentEpicId) {
    await removeSubticketIdFromEpic(projectPath, ticket.frontMatter.parentEpicId, ticket.frontMatter.id);
  }

  if (ticket.frontMatter.ticketType !== "epic") return;

  const config = await readProjectConfig(projectPath);
  const { records } = await readTickets(projectPath, config.columns);
  const childIds = uniqueTicketIds([
    ...ticket.frontMatter.subticketIds,
    ...records
      .filter((record) => record.frontMatter.parentEpicId === ticket.frontMatter.id)
      .map((record) => record.frontMatter.id)
  ]);

  for (const childId of childIds) {
    if (childId === ticket.frontMatter.id) continue;
    try {
      const child = await readTicket(projectPath, childId);
      if (child.frontMatter.parentEpicId !== ticket.frontMatter.id) continue;
      await writeTicket(projectPath, {
        ...child,
        frontMatter: {
          ...child.frontMatter,
          parentEpicId: null
        }
      });
    } catch (error) {
      if (!isTicketNotFoundError(error)) throw error;
    }
  }
};

export const deleteTicket = async (projectPath: string, ticketId: string): Promise<BoardSnapshot> => {
  const ticket = await readTicket(projectPath, ticketId);
  await unlinkTicketRelationshipsBeforeDelete(projectPath, ticket);
  const source = ticketPath(projectPath, ticketId);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = pathJoin(trashPath(projectPath), stamp, `${ticketId}.md`);
  await runBackendEffect(
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* fs.rename(source, target);
    })
  );
  return readBoard(projectPath);
};

export const duplicateTicket = async (projectPath: string, ticketId: string): Promise<TicketRecord> => {
  const source = await readTicket(projectPath, ticketId);
  return createTicket(projectPath, {
    title: `${source.frontMatter.title} Copy`,
    priority: source.frontMatter.priority,
    effort: source.frontMatter.effort,
    labels: source.frontMatter.labels,
    markdown: source.markdown,
    status: source.frontMatter.status,
    ticketType: source.frontMatter.ticketType,
    blockedByIds: source.frontMatter.blockedByIds
  });
};

export const revealTicketFile = async (projectPath: string, ticketId: string): Promise<void> => {
  showElectronItemInFolder(ticketPath(projectPath, ticketId));
};

export const appendCodexHandoff = (markdown: string, handoff: string): string => {
  const marker = "## Codex Handoff";
  const entry = `\n\n### ${new Date().toLocaleString()}\n\n${handoff.trim()}\n`;
  if (!markdown.includes(marker)) {
    return `${markdown.trimEnd()}\n\n${marker}${entry}`;
  }
  return markdown.replace(marker, `${marker}${entry}`);
};
