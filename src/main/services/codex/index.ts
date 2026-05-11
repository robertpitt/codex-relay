import { Context, Effect, Layer } from "effect";
import { Codex, type Thread, type ThreadEvent, type ThreadItem, type ThreadOptions } from "@openai/codex-sdk";
import { ZodError } from "zod";
import {
  type AgentTicketUpdate,
  type AgentTicketUpdateInput,
  type AgentTicketUpdateStartResult,
  type ClarificationQuestion,
  type CodexRunStartResult,
  type CodexRunPreflightResult,
  type CodexStatus,
  type CreateDraftInput,
  RELAY_COMPLETED_STATUS,
  RELAY_IN_PROGRESS_STATUS,
  RELAY_NEEDS_CLARIFICATION_STATUS,
  RELAY_NOT_DOING_STATUS,
  RELAY_REVIEW_STATUS,
  type RelayCodexEvent,
  type RendererRunEvent,
  type RunStatus,
  type StartRunInput,
  type TicketCreateInput,
  type TicketDraft,
  type TicketDraftSubticket,
  type TicketDraftResearchLimits,
  type TicketDraftErrorCode,
  type TicketDraftErrorPayload
} from "../../../shared/types";
import { extractClarificationRequest } from "../clarificationParser";
import { type BackendEffect, type BackendServices, fromPromise, runBackendEffect } from "../runtime";
import {
  emitRunEvent,
  emitRunEventToRendererSink,
  readRunEvents,
  type RendererRunEventSink
} from "../run-events";
import { agentTicketUpdateSchema, ticketDraftSchema } from "../schemas";
import { logError, logInfo, logWarn } from "../logger";
import { pathResolve } from "../io";
import { fallbackResearchFindings, renderResearchForPrompt, researchTicketDraft } from "./research";
import { getCodexStatus } from "./status";
import {
  appendCodexHandoff,
  createClarificationQuestions,
  isTicketNotFoundError,
  isGitRepository,
  newId,
  readClarificationQuestions,
  readProjectConfig,
  readTicket,
  ticketMarkdownFromDraft,
  ticketMarkdownFromSubticketDraft,
  transitionTicketStatus,
  writeTicket
} from "../storage";

export const TICKET_DRAFT_TIMEOUT_MS = 90_000;

export { getCodexStatus } from "./status";
export { DEFAULT_TICKET_DRAFT_RESEARCH_LIMITS, extractTicketDraftUrls, researchTicketDraft } from "./research";

type ActiveRun = {
  abortController: AbortController;
  ticketId: string;
  projectPath: string;
};

const activeRuns = new Map<string, ActiveRun>();
const activeTicketUpdateRuns = new Map<string, ActiveRun>();
const activeTicketUpdateRunsByTicket = new Map<string, string>();

const nowIso = (): string => new Date().toISOString();

const activeRunIdForTicket = (projectPath: string, ticketId: string): string | null => {
  for (const [runId, run] of activeRuns) {
    if (run.projectPath === projectPath && run.ticketId === ticketId) return runId;
  }
  return null;
};

const codexEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
};

const createCodex = (): Codex => new Codex({ env: codexEnv() });

export type CodexRunThread = Pick<Thread, "id" | "runStreamed">;

export type CodexRunClient = {
  startThread: (options: ThreadOptions) => CodexRunThread;
  resumeThread: (threadId: string, options: ThreadOptions) => CodexRunThread;
};

export type CodexRunDependencies = {
  createCodexClient?: () => CodexRunClient;
  createRunId?: () => string;
  runEventSink?: RendererRunEventSink;
};

const CodexRunDependencyService = Context.Service<CodexRunDependencies>("relay/CodexRunDependencies");
type CodexRunDependencyServices = Context.Service.Identifier<typeof CodexRunDependencyService>;
const codexRunDependencyLayer = (dependencies: CodexRunDependencies = {}): Layer.Layer<CodexRunDependencyServices> =>
  Layer.succeed(CodexRunDependencyService)(dependencies);

export type TicketUpdateThread = Pick<Thread, "id" | "runStreamed">;

export type TicketUpdateCodexClient = {
  startThread: (options: ThreadOptions) => TicketUpdateThread;
};

export type TicketUpdateDependencies = {
  createCodexClient?: () => TicketUpdateCodexClient;
  createRunId?: () => string;
  runEventSink?: RendererRunEventSink;
};

const TicketUpdateDependencyService = Context.Service<TicketUpdateDependencies>("relay/TicketUpdateDependencies");
type TicketUpdateDependencyServices = Context.Service.Identifier<typeof TicketUpdateDependencyService>;
const ticketUpdateDependencyLayer = (
  dependencies: TicketUpdateDependencies = {}
): Layer.Layer<TicketUpdateDependencyServices> => Layer.succeed(TicketUpdateDependencyService)(dependencies);

const threadOptionsForProject = async (projectPath: string): Promise<ThreadOptions> => {
  const config = await readProjectConfig(projectPath);
  const git = await isGitRepository(projectPath);
  return {
    workingDirectory: projectPath,
    model: config.settings.defaultModel ?? undefined,
    approvalPolicy: config.settings.defaultApprovalPolicy,
    sandboxMode: config.settings.defaultSandboxMode,
    skipGitRepoCheck: config.settings.allowNonGitCodexRuns || !git,
    networkAccessEnabled: false,
    webSearchMode: "disabled"
  };
};

const ticketUpdateThreadOptionsForProject = async (projectPath: string): Promise<ThreadOptions> => ({
  ...(await threadOptionsForProject(projectPath)),
  approvalPolicy: "never",
  sandboxMode: "read-only",
  networkAccessEnabled: false,
  webSearchMode: "disabled"
});

const ticketDraftBaseSchemaJson = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "priority",
    "labels",
    "context",
    "researchFindings",
    "requirements",
    "implementationPlan",
    "acceptanceCriteria",
    "clarificationQuestions",
    "implementationNotes"
  ],
  properties: {
    title: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    labels: { type: "array", items: { type: "string" } },
    context: { type: "string" },
    researchFindings: { type: "array", items: { type: "string" } },
    requirements: { type: "array", items: { type: "string" } },
    implementationPlan: { type: "array", items: { type: "string" } },
    acceptanceCriteria: { type: "array", items: { type: "string" } },
    clarificationQuestions: { type: "array", items: { type: "string" } },
    implementationNotes: { type: "array", items: { type: "string" } }
  }
} as const;

const ticketDraftSchemaJson = {
  ...ticketDraftBaseSchemaJson,
  required: [...ticketDraftBaseSchemaJson.required, "ticketType", "subtickets"],
  properties: {
    ...ticketDraftBaseSchemaJson.properties,
    ticketType: { type: "string", enum: ["task", "epic"] },
    subtickets: { type: "array", items: ticketDraftBaseSchemaJson }
  }
} as const;

const agentTicketUpdateSchemaJson = {
  type: "object",
  additionalProperties: false,
  required: ["title", "priority", "labels", "markdown", "clarificationQuestions"],
  properties: {
    title: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    labels: { type: "array", items: { type: "string" } },
    markdown: { type: "string" },
    clarificationQuestions: { type: "array", items: { type: "string" } }
  }
} as const;

const parseJsonResponse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    const first = value.indexOf("{");
    const last = value.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(value.slice(first, last + 1));
    }
    throw new Error("Codex did not return valid JSON.");
  }
};

type DraftTimeoutHandle = ReturnType<typeof setTimeout>;

export type TicketDraftThread = Pick<Thread, "run">;

export type TicketDraftCodexClient = {
  startThread: (options: ThreadOptions) => TicketDraftThread;
};

export type TicketDraftDependencies = {
  getStatus?: () => Promise<CodexStatus>;
  createCodexClient?: () => TicketDraftCodexClient;
  draftTimeoutMs?: number;
  researchLimits?: Partial<TicketDraftResearchLimits>;
  fetchUrl?: typeof fetch;
  disableResearch?: boolean;
  createRequestId?: () => string;
  nowMs?: () => number;
  setTimeoutFn?: (callback: () => void, ms: number) => DraftTimeoutHandle;
  clearTimeoutFn?: (handle: DraftTimeoutHandle) => void;
  unrefTimeout?: boolean;
};

const TicketDraftDependencyService = Context.Service<TicketDraftDependencies>("relay/TicketDraftDependencies");
type TicketDraftDependencyServices = Context.Service.Identifier<typeof TicketDraftDependencyService>;
const ticketDraftDependencyLayer = (
  dependencies: TicketDraftDependencies = {}
): Layer.Layer<TicketDraftDependencyServices> => Layer.succeed(TicketDraftDependencyService)(dependencies);

type TicketDraftServiceErrorOptions = TicketDraftErrorPayload & {
  cause?: unknown;
};

export class TicketDraftServiceError extends Error {
  readonly code: TicketDraftErrorCode;
  readonly recoverable: boolean;
  readonly requestId: string;
  readonly durationMs: number;
  readonly reason: string;
  readonly timeoutMs?: number;

  constructor({ code, message, recoverable, requestId, durationMs, reason, timeoutMs, cause }: TicketDraftServiceErrorOptions) {
    super(message, { cause });
    this.name = "TicketDraftServiceError";
    this.code = code;
    this.recoverable = recoverable;
    this.requestId = requestId;
    this.durationMs = durationMs;
    this.reason = reason;
    this.timeoutMs = timeoutMs;
  }

  toPayload(): TicketDraftErrorPayload {
    return {
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      requestId: this.requestId,
      durationMs: this.durationMs,
      reason: this.reason,
      timeoutMs: this.timeoutMs
    };
  }
}

const formatTimeout = (timeoutMs: number): string =>
  timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)} seconds` : `${timeoutMs}ms`;

const isAbortLikeError = (error: unknown): boolean =>
  error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));

const unrefTimeoutHandle = (handle: DraftTimeoutHandle): void => {
  if (typeof handle === "object" && handle && "unref" in handle && typeof handle.unref === "function") {
    handle.unref();
  }
};

const errorMessage = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const ticketDraftError = (
  code: TicketDraftErrorCode,
  requestId: string,
  durationMs: number,
  message: string,
  reason: string,
  options?: { timeoutMs?: number; recoverable?: boolean; cause?: unknown }
): TicketDraftServiceError =>
  new TicketDraftServiceError({
    code,
    message,
    recoverable: options?.recoverable ?? true,
    requestId,
    durationMs,
    reason,
    timeoutMs: options?.timeoutMs,
    cause: options?.cause
  });

const ticketDraftTimeoutError = (requestId: string, durationMs: number, timeoutMs: number, cause?: unknown): TicketDraftServiceError =>
  ticketDraftError(
    "timeout",
    requestId,
    durationMs,
    `Codex ticket drafting timed out after ${formatTimeout(timeoutMs)}. Your rough idea is still available; retry Codex when ready.`,
    "codex_generation_timeout",
    { timeoutMs, cause }
  );

const normalizeTicketDraftError = (
  error: unknown,
  context: {
    requestId: string;
    durationMs: number;
    timeoutMs: number;
    timedOut: boolean;
    signalAborted: boolean;
  }
): TicketDraftServiceError => {
  if (error instanceof TicketDraftServiceError) return error;
  if (context.timedOut) return ticketDraftTimeoutError(context.requestId, context.durationMs, context.timeoutMs, error);
  if (context.signalAborted || isAbortLikeError(error)) {
    return ticketDraftError(
      "cancelled",
      context.requestId,
      context.durationMs,
      "Codex ticket drafting was cancelled. Your rough idea is still available.",
      "codex_generation_cancelled",
      { timeoutMs: context.timeoutMs, cause: error }
    );
  }
  if (error instanceof ZodError || error instanceof SyntaxError || errorMessage(error, "").includes("valid JSON")) {
    return ticketDraftError(
      "invalid_response",
      context.requestId,
      context.durationMs,
      "Codex returned an invalid ticket draft. Your rough idea is still available; retry Codex when ready.",
      "invalid_codex_response",
      { timeoutMs: context.timeoutMs, cause: error }
    );
  }
  return ticketDraftError(
    "backend_failure",
    context.requestId,
    context.durationMs,
    errorMessage(error, "Ticket drafting failed."),
    "codex_backend_failure",
    { timeoutMs: context.timeoutMs, cause: error }
  );
};

export const ticketDraftErrorToPayload = (error: unknown): TicketDraftErrorPayload => {
  if (error instanceof TicketDraftServiceError) return error.toPayload();
  return {
    code: "backend_failure",
    message: errorMessage(error, "Ticket drafting failed."),
    recoverable: true,
    requestId: "unknown",
    durationMs: 0,
    reason: "unknown_ticket_draft_failure"
  };
};

const createTicketDraftPromise = async (
  { projectPath, idea, preferredTicketType }: CreateDraftInput,
  dependencies: TicketDraftDependencies = {}
): Promise<TicketDraft> => {
  const requestId = dependencies.createRequestId?.() ?? newId("tdr");
  const startedAt = dependencies.nowMs?.() ?? Date.now();
  const nowMs = dependencies.nowMs ?? Date.now;
  const durationMs = (): number => Math.max(0, nowMs() - startedAt);
  const draftTimeoutMs = dependencies.draftTimeoutMs ?? TICKET_DRAFT_TIMEOUT_MS;
  const setTimeoutFn = dependencies.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = dependencies.clearTimeoutFn ?? clearTimeout;
  let timeout: DraftTimeoutHandle | null = null;
  let timedOut = false;
  let abortController: AbortController | null = null;
  const logBase = { requestId, projectPath, ideaLength: idea.length, timeoutMs: draftTimeoutMs };

  await logInfo("codex:draft", "starting ticket draft", logBase);

  try {
    const status = await (dependencies.getStatus ?? getCodexStatus)();
    if (!status.cliAvailable) {
      await logWarn("codex:draft", "codex cli unavailable", { ...logBase, durationMs: durationMs(), status });
      throw ticketDraftError(
        "codex_unavailable",
        requestId,
        durationMs(),
        "Codex CLI was not found on PATH. Install or expose Codex before drafting tickets.",
        "codex_cli_unavailable",
        { timeoutMs: draftTimeoutMs }
      );
    }
    if (status.authenticated === false) {
      await logWarn("codex:draft", "codex auth unavailable", { ...logBase, durationMs: durationMs(), status });
      throw ticketDraftError(
        "codex_unauthenticated",
        requestId,
        durationMs(),
        "Codex is not authenticated. Run `codex login` in your terminal, then try drafting again.",
        "codex_auth_unavailable",
        { timeoutMs: draftTimeoutMs }
      );
    }

    const config = await readProjectConfig(projectPath);
    const research = await researchTicketDraft({ projectPath, idea, preferredTicketType }, dependencies);
    await logInfo("codex:draft", "ticket draft research completed", {
      ...logBase,
      durationMs: durationMs(),
      checkedUrlCount: research.metadata.checkedUrls.length,
      inspectedFileCount: research.metadata.inspectedFiles.length,
      limitationCount: research.metadata.limitations.length,
      limits: research.metadata.limits
    });
    const codex = dependencies.createCodexClient?.() ?? createCodex();
    const thread = codex.startThread(await threadOptionsForProject(projectPath));
    abortController = new AbortController();
    const ticketTypeGuidance =
      preferredTicketType === "epic"
        ? "The user selected Epic mode. Return ticketType \"epic\" and decompose the work into normal task subtickets."
        : "The user selected Task mode unless the idea explicitly asks for an epic. Return ticketType \"task\" with an empty subtickets array for ordinary work.";
    const prompt = `You are helping create a local software implementation ticket for Relay.

The user will provide a rough idea. Convert it into a clear, actionable ticket for a coding agent and human developer.

Use the bounded research context below to ground the ticket. Include concrete source references in researchFindings, such as file paths, function/component names, or URL titles. If research failed or was incomplete, state that limitation in researchFindings or implementationNotes.

Generate implementationPlan as specific engineering steps informed by the research context. Do not include large copied source blocks or long page excerpts.

Relay supports two ticket types: task and epic. ${ticketTypeGuidance}
For epic drafts, the parent epic should describe the overall outcome and subtickets should be independently implementable normal task tickets with their own requirements, implementationPlan, acceptanceCriteria, labels, and priority. Do not create nested epics. For task drafts, subtickets must be an empty array.

Return only data matching the requested schema. Do not implement the task.

Project path: ${projectPath}
Project name: ${config.name}
Current board columns: ${config.columns.map((column) => column.name).join(", ")}

Research context:
${renderResearchForPrompt(research)}

User idea:
${idea}`;

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeoutFn(() => {
        timedOut = true;
        abortController?.abort();
        reject(ticketDraftTimeoutError(requestId, durationMs(), draftTimeoutMs));
      }, draftTimeoutMs);
      if (dependencies.unrefTimeout !== false && timeout) unrefTimeoutHandle(timeout);
    });
    const runPromise = thread.run(prompt, { outputSchema: ticketDraftSchemaJson, signal: abortController.signal });
    void runPromise.then(
      () => {
        if (timedOut) {
          void logWarn("codex:draft", "late ticket draft completion ignored", {
            ...logBase,
            durationMs: durationMs(),
            reason: "late_completion_after_timeout"
          });
        }
      },
      (lateError) => {
        if (timedOut) {
          void logWarn("codex:draft", "late ticket draft failure ignored", {
            ...logBase,
            durationMs: durationMs(),
            reason: "late_failure_after_timeout",
            error: errorMessage(lateError, "unknown")
          });
        }
      }
    );

    const turn = await Promise.race([runPromise, timeoutPromise]);
    let parsed: TicketDraft;
    try {
      const parsedDraft = ticketDraftSchema.parse(parseJsonResponse(turn.finalResponse));
      parsed = {
        ...parsedDraft,
        researchFindings:
          parsedDraft.researchFindings.length > 0 ? parsedDraft.researchFindings : fallbackResearchFindings(research.metadata),
        implementationPlan:
          parsedDraft.implementationPlan.length > 0 ? parsedDraft.implementationPlan : parsedDraft.implementationNotes,
        research: research.metadata
      };
    } catch (error) {
      throw ticketDraftError(
        "invalid_response",
        requestId,
        durationMs(),
        "Codex returned an invalid ticket draft. Your rough idea is still available; retry Codex when ready.",
        "invalid_codex_response",
        { timeoutMs: draftTimeoutMs, cause: error }
      );
    }
    await logInfo("codex:draft", "ticket draft completed", {
      ...logBase,
      durationMs: durationMs(),
      title: parsed.title,
      reason: "success"
    });
    return parsed;
  } catch (error) {
    const draftError = normalizeTicketDraftError(error, {
      requestId,
      durationMs: durationMs(),
      timeoutMs: draftTimeoutMs,
      timedOut,
      signalAborted: abortController?.signal.aborted ?? false
    });
    const failureMeta = { ...logBase, ...draftError.toPayload() };
    if (draftError.code === "timeout" || draftError.code === "cancelled") {
      await logWarn("codex:draft", "ticket draft did not complete", failureMeta);
    } else {
      await logError("codex:draft", "ticket draft failed", draftError, failureMeta);
    }
    throw draftError;
  } finally {
    if (timeout) clearTimeoutFn(timeout);
  }
};

const createTicketDraftEffect = (
  input: CreateDraftInput
): BackendEffect<TicketDraft, unknown, BackendServices | TicketDraftDependencyServices> =>
  Effect.gen(function*() {
    const dependencies = yield* TicketDraftDependencyService;
    return yield* fromPromise(() => createTicketDraftPromise(input, dependencies));
  });

export const createTicketDraft = (
  input: CreateDraftInput,
  dependencies: TicketDraftDependencies = {}
): Promise<TicketDraft> => runBackendEffect(Effect.provide(createTicketDraftEffect(input), ticketDraftDependencyLayer(dependencies)));

const emitRunEventForDependencies = (
  runEventSink: RendererRunEventSink | undefined,
  projectPath: string,
  ticketId: string,
  runId: string,
  threadId: string,
  event: RelayCodexEvent
): Promise<void> =>
  runEventSink
    ? emitRunEventToRendererSink(runEventSink, projectPath, ticketId, runId, threadId, event)
    : emitRunEvent(projectPath, ticketId, runId, threadId, event);

const finalTextFromItem = (item: ThreadItem): string | null => {
  if (item.type === "agent_message") return item.text;
  if (item.type === "error") return item.message;
  if (item.type === "reasoning") return item.text;
  return null;
};

const normalizeItemEvent = (
  event: Extract<ThreadEvent, { type: "item.started" | "item.updated" | "item.completed" }>,
  outputOffsets: Map<string, number>
): RelayCodexEvent[] => {
  const timestamp = nowIso();
  const item = event.item;

  if (item.type === "agent_message") {
    const text = item.text ?? "";
    return event.type === "item.completed"
      ? [{ type: "agent.message.completed", text, timestamp }]
      : [{ type: "agent.message.delta", text, timestamp }];
  }

  if (item.type === "reasoning" && item.text) {
    return [{ type: "agent.message.delta", text: item.text, timestamp }];
  }

  if (item.type === "command_execution") {
    const normalized: RelayCodexEvent[] = [];
    if (event.type === "item.started") {
      normalized.push({ type: "command.started", command: item.command, timestamp });
    }
    const offset = outputOffsets.get(item.id) ?? 0;
    const output = item.aggregated_output ?? "";
    if (output.length > offset) {
      normalized.push({ type: "command.output", stream: "stdout", text: output.slice(offset), timestamp });
      outputOffsets.set(item.id, output.length);
    }
    if (event.type === "item.completed") {
      normalized.push({
        type: "command.completed",
        status: item.status === "completed" ? "completed" : "failed",
        timestamp
      });
    }
    return normalized;
  }

  if (item.type === "file_change" && event.type === "item.completed") {
    return item.changes.map((change) => ({
      type: "file.change",
      path: change.path,
      summary: `${change.kind} ${change.path}`,
      timestamp
    }));
  }

  if (item.type === "error") {
    return [{ type: "run.failed", message: item.message, timestamp }];
  }

  if (item.type === "mcp_tool_call") {
    return [
      {
        type: "agent.message.delta",
        text: `${item.server}.${item.tool} ${item.status}`,
        timestamp
      }
    ];
  }

  if (item.type === "web_search") {
    return [{ type: "web.search", query: item.query, timestamp }];
  }

  return [];
};

export const readCodexRunEvents = (projectPath: string, ticketId: string, runId: string): Promise<RendererRunEvent[]> =>
  readRunEvents(projectPath, ticketId, runId);

const formatClarificationsForPrompt = (clarifications: ClarificationQuestion[]): string => {
  if (clarifications.length === 0) return "No clarification questions have been recorded for this ticket.";
  return clarifications
    .map((question) => {
      const status = question.answer ? "answered" : "unanswered";
      const answer = question.answer ? `\nAnswer: ${question.answer}` : "";
      return `- [${status}] ${question.question}${answer}`;
    })
    .join("\n");
};

const ticketUpdateRunKey = (projectPath: string, ticketId: string): string => `${pathResolve(projectPath)}:${ticketId}`;

const parseAgentTicketUpdate = (value: string): AgentTicketUpdate => {
  const parsed = agentTicketUpdateSchema.parse(parseJsonResponse(value));
  const title = normalizeWhitespace(parsed.title);
  const markdown = parsed.markdown.trimStart();
  if (!title) throw new Error("Agent ticket update must include a title.");
  if (!markdown.trim()) throw new Error("Agent ticket update must include markdown content.");
  if (/^---\s*(?:\r?\n|$)/.test(markdown)) {
    throw new Error("Agent ticket update markdown must not include YAML front matter.");
  }

  const labels = [...new Set(parsed.labels.map((label) => normalizeWhitespace(label)).filter(Boolean))];
  const clarificationQuestions = parsed.clarificationQuestions.map((question) => normalizeWhitespace(question)).filter(Boolean);
  return {
    title,
    priority: parsed.priority,
    labels,
    markdown,
    clarificationQuestions
  };
};

const buildTicketUpdatePrompt = (
  ticket: Awaited<ReturnType<typeof readTicket>>,
  clarifications: ClarificationQuestion[],
  request: string,
  projectName: string
): string => `You are helping update one Relay ticket.

Update the ticket content only. Do not implement the ticket. Do not modify files. Do not move the ticket to another column. Do not change run history or Codex execution metadata.

Return only structured JSON matching the requested schema:
- title: full updated ticket title.
- priority: one of low, medium, high, urgent.
- labels: complete updated label list.
- markdown: complete updated ticket markdown body, without YAML front matter.
- clarificationQuestions: new user-answerable clarification questions to store as formal Relay clarification records. Use an empty array when no new formal clarification records are needed.

The markdown field must be the full replacement body for the ticket. Preserve useful existing sections unless the user's request asks for a rewrite. Keep existing implementation handoff/history content when it is present.

Project: ${projectName}
Ticket front matter, for context only:
${JSON.stringify(ticket.frontMatter, null, 2)}

Clarification records already attached to this ticket:
${formatClarificationsForPrompt(clarifications)}

Current ticket markdown:
${ticket.markdown}

User change request:
${request}`;

const startTicketUpdateRunPromise = async (
  input: AgentTicketUpdateInput,
  dependencies: TicketUpdateDependencies = {}
): Promise<AgentTicketUpdateStartResult> => {
  const projectPath = pathResolve(input.projectPath);
  const ticketId = input.ticketId;
  const request = input.request.trim();
  if (!request) throw new Error("Enter a ticket update request before starting the agent.");

  const updateKey = ticketUpdateRunKey(projectPath, ticketId);
  const runEventSink = dependencies.runEventSink;
  if (activeTicketUpdateRunsByTicket.has(updateKey)) {
    throw new Error("A ticket update agent is already running for this ticket.");
  }

  await logInfo("codex:ticket-update", "starting ticket update run", { projectPath, ticketId, requestLength: request.length });
  const config = await readProjectConfig(projectPath);
  const ticket = await readTicket(projectPath, ticketId);
  const clarifications = await readClarificationQuestions(projectPath, ticketId);
  const runId = dependencies.createRunId?.() ?? newId("run");
  const codex = dependencies.createCodexClient?.() ?? createCodex();
  const thread = codex.startThread(await ticketUpdateThreadOptionsForProject(projectPath));
  const abortController = new AbortController();
  let currentThreadId = thread.id ?? `pending_${runId}`;
  const outputOffsets = new Map<string, number>();
  const prompt = buildTicketUpdatePrompt(ticket, clarifications, request, config.name);

  activeTicketUpdateRuns.set(runId, { abortController, ticketId, projectPath });
  activeTicketUpdateRunsByTicket.set(updateKey, runId);

  let streamed: Awaited<ReturnType<TicketUpdateThread["runStreamed"]>>;
  try {
    streamed = await thread.runStreamed(prompt, { outputSchema: agentTicketUpdateSchemaJson, signal: abortController.signal });
  } catch (error) {
    activeTicketUpdateRuns.delete(runId);
    activeTicketUpdateRunsByTicket.delete(updateKey);
    throw error;
  }

  return new Promise<AgentTicketUpdateStartResult>((resolve) => {
    let started = false;
    const resolveStarted = (): void => {
      if (!started) {
        started = true;
        resolve({ runId, threadId: currentThreadId });
      }
    };

    const emitStarted = async (): Promise<void> => {
      if (started) return;
      await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
        type: "run.started",
        runId,
        threadId: currentThreadId,
        timestamp: nowIso()
      });
      resolveStarted();
    };

    const emitFailure = async (message: string): Promise<void> => {
      await emitStarted();
      await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
        type: "run.failed",
        message,
        timestamp: nowIso()
      });
    };

    void (async () => {
      let finalResponse = "";
      try {
        for await (const event of streamed.events) {
          if (event.type === "thread.started") {
            currentThreadId = event.thread_id;
            await emitStarted();
            continue;
          }

          await emitStarted();

          if (event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed") {
            const text = finalTextFromItem(event.item);
            if (event.item.type === "agent_message" && text) finalResponse = text;
            const normalized = normalizeItemEvent(event, outputOffsets);
            for (const relayEvent of normalized) {
              await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, relayEvent);
            }
            continue;
          }

          if (event.type === "turn.failed" || event.type === "error") {
            const message = event.type === "turn.failed" ? event.error.message : event.message;
            await emitFailure(message);
            return;
          }

          if (event.type === "turn.completed") {
            let update: AgentTicketUpdate;
            try {
              update = parseAgentTicketUpdate(finalResponse);
            } catch (error) {
              await emitFailure(`Agent ticket update was invalid and was not applied: ${errorMessage(error, "Invalid ticket update.")}`);
              await logWarn("codex:ticket-update", "ticket update output rejected", {
                projectPath,
                ticketId,
                runId,
                threadId: currentThreadId,
                error: errorMessage(error, "Invalid ticket update.")
              });
              return;
            }

            try {
              const latest = await readTicket(projectPath, ticketId);
              await writeTicket(projectPath, {
                ...latest,
                markdown: update.markdown,
                frontMatter: {
                  ...latest.frontMatter,
                  title: update.title,
                  priority: update.priority,
                  labels: update.labels
                }
              });

              if (update.clarificationQuestions.length > 0) {
                await createClarificationQuestions(
                  projectPath,
                  ticketId,
                  update.clarificationQuestions.map((question) => ({ question })),
                  {
                    actor: "codex",
                    source: "manual_ticket_edit",
                    runId,
                    codexThreadId: currentThreadId
                  }
                );
              }

              await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
                type: "run.completed",
                finalResponse: `Ticket updated with ${update.clarificationQuestions.length} new clarification question${
                  update.clarificationQuestions.length === 1 ? "" : "s"
                }.`,
                usage: event.usage,
                timestamp: nowIso()
              });
              await logInfo("codex:ticket-update", "ticket update run completed", {
                projectPath,
                ticketId,
                runId,
                threadId: currentThreadId,
                clarificationQuestionCount: update.clarificationQuestions.length
              });
            } catch (error) {
              await emitFailure(`Ticket update could not be persisted: ${errorMessage(error, "Persistence failed.")}`);
              await logError("codex:ticket-update", "ticket update persistence failed", error, {
                projectPath,
                ticketId,
                runId,
                threadId: currentThreadId
              });
            }
            return;
          }
        }
      } catch (error) {
        const message = abortController.signal.aborted ? "Ticket update was cancelled." : errorMessage(error, "Ticket update failed.");
        await emitFailure(message);
        if (abortController.signal.aborted) {
          await logWarn("codex:ticket-update", "ticket update run cancelled", { projectPath, ticketId, runId, threadId: currentThreadId });
        } else {
          await logError("codex:ticket-update", "ticket update run failed", error, { projectPath, ticketId, runId, threadId: currentThreadId });
        }
      } finally {
        activeTicketUpdateRuns.delete(runId);
        activeTicketUpdateRunsByTicket.delete(updateKey);
      }
    })();
  });
};

const startTicketUpdateRunEffect = (
  input: AgentTicketUpdateInput
): BackendEffect<AgentTicketUpdateStartResult, unknown, BackendServices | TicketUpdateDependencyServices> =>
  Effect.gen(function*() {
    const dependencies = yield* TicketUpdateDependencyService;
    return yield* fromPromise(() => startTicketUpdateRunPromise(input, dependencies));
  });

export const startTicketUpdateRun = (
  input: AgentTicketUpdateInput,
  dependencies: TicketUpdateDependencies = {}
): Promise<AgentTicketUpdateStartResult> =>
  runBackendEffect(Effect.provide(startTicketUpdateRunEffect(input), ticketUpdateDependencyLayer(dependencies)));

export const cancelTicketUpdateRun = async (runId: string): Promise<void> => {
  const run = activeTicketUpdateRuns.get(runId);
  if (!run) return;
  run.abortController.abort();
};

const buildExecutionPrompt = (ticketMarkdown: string, clarifications: ClarificationQuestion[]): string => `You are working inside the local project folder for this Relay ticket.

Follow the ticket exactly. Ask for clarification if the ticket is missing a required product or implementation decision.

Clarification records already attached to this ticket:
${formatClarificationsForPrompt(clarifications)}

If you cannot continue without user input, stop work and include a fenced relay-clarification JSON block in your final response.
The block must use this shape:
\`\`\`relay-clarification
{"questions":[{"question":"The specific question for the user"}]}
\`\`\`

Do not mark the ticket completed yourself. At the end, provide:
- Summary of changes made
- Files changed
- Commands run
- Tests run and their results
- Any remaining risks or follow-up work

Ticket:
${ticketMarkdown}`;

type TicketRunStatePatch = Partial<{
  codexThreadId: string | null;
  runStatus: RunStatus;
  lastRunId: string | null;
  status: string;
  markdown: string;
}>;

const updateTicketRunStateEffect = (
  projectPath: string,
  ticketId: string,
  patch: TicketRunStatePatch
): BackendEffect<void> =>
  Effect.gen(function*() {
    const ticket = yield* Effect.catch(
      fromPromise(() => readTicket(projectPath, ticketId)),
      (error) =>
        Effect.gen(function*() {
          if (isTicketNotFoundError(error)) {
            yield* fromPromise(() => logWarn("codex:run", "ticket file missing", { projectPath, ticketId, filePath: error.filePath }));
          }
          return yield* Effect.fail(error);
        })
    );
    yield* fromPromise(() =>
      writeTicket(projectPath, {
        ...ticket,
        markdown: patch.markdown ?? ticket.markdown,
        frontMatter: {
          ...ticket.frontMatter,
          codexThreadId: patch.codexThreadId !== undefined ? patch.codexThreadId : ticket.frontMatter.codexThreadId,
          runStatus: patch.runStatus ?? ticket.frontMatter.runStatus,
          lastRunId: patch.lastRunId !== undefined ? patch.lastRunId : ticket.frontMatter.lastRunId,
          status: patch.status ?? ticket.frontMatter.status
        }
      })
    );
  });

const updateTicketRunState = (
  projectPath: string,
  ticketId: string,
  patch: TicketRunStatePatch
): Promise<void> => runBackendEffect(updateTicketRunStateEffect(projectPath, ticketId, patch));

export const preflightCodexRun = async (input: StartRunInput): Promise<CodexRunPreflightResult> => {
  const projectPath = pathResolve(input.projectPath);
  const ticketId = input.ticketId;
  const errors: string[] = [];
  const warnings: string[] = [];
  let ticketStatus: string | null = null;
  let runStatus: CodexRunPreflightResult["runStatus"] = null;
  let unansweredClarificationCount = 0;
  let canStartFreshThread = false;

  try {
    const config = await readProjectConfig(projectPath);
    if (!config.settings.codexExecutionEnabled) {
      errors.push("Codex execution is disabled for this project.");
    }

    const git = await isGitRepository(projectPath);
    if (!git && !config.settings.allowNonGitCodexRuns) {
      errors.push("This project is not a Git repository. Enable non-Git Codex runs in project settings first.");
    }

    let ticket: Awaited<ReturnType<typeof readTicket>>;
    try {
      ticket = await readTicket(projectPath, ticketId);
    } catch (error) {
      if (isTicketNotFoundError(error)) {
        await logWarn("codex:preflight", "ticket file missing", { projectPath, ticketId, filePath: error.filePath });
      }
      errors.push(errorMessage(error, "Ticket could not be loaded."));
      return {
        ok: false,
        errors,
        warnings,
        ticketStatus,
        runStatus,
        unansweredClarificationCount,
        canStartFreshThread
      };
    }

    ticketStatus = ticket.frontMatter.status;
    runStatus = ticket.frontMatter.runStatus;
    canStartFreshThread = Boolean(ticket.frontMatter.codexThreadId);

    const currentColumn = config.columns.find((column) => column.id === ticket.frontMatter.status);
    if (!currentColumn) {
      errors.push(`Ticket status "${ticket.frontMatter.status}" does not exist in this project workflow.`);
    } else if (currentColumn.terminal && ticket.frontMatter.status !== RELAY_NOT_DOING_STATUS && ticket.frontMatter.status !== RELAY_COMPLETED_STATUS) {
      errors.push(`Move this ticket out of ${currentColumn.name} before starting Codex.`);
    }

    if (ticket.frontMatter.status === RELAY_NOT_DOING_STATUS) {
      errors.push("Move this ticket out of Not Doing before starting Codex.");
    }
    if (ticket.frontMatter.status === RELAY_COMPLETED_STATUS) {
      errors.push("Completed tickets are human accepted. Reopen this ticket before starting Codex.");
    }
    if (ticket.frontMatter.ticketType === "epic") {
      errors.push("Epics are planning containers. Start Codex from a child task ticket instead.");
    }

    const activeRunId = activeRunIdForTicket(projectPath, ticketId);
    if (activeRunId) {
      errors.push(`Ticket already has an active Codex run: ${activeRunId}.`);
    } else if (ticket.frontMatter.runStatus === "running") {
      errors.push("Ticket is already marked as running. Stop or reconcile the current run before starting Codex again.");
    }

    const clarifications = await readClarificationQuestions(projectPath, ticketId);
    unansweredClarificationCount = clarifications.filter((question) => !question.answer?.trim()).length;
    if (unansweredClarificationCount > 0) {
      errors.push(`Answer ${unansweredClarificationCount} open clarification question(s) before starting Codex.`);
    }

    if (!input.freshThread && ticket.frontMatter.codexThreadId && ticket.frontMatter.runStatus === "completed") {
      warnings.push("Resuming will continue the existing Codex thread from the last completed run.");
    }
  } catch (error) {
    errors.push(errorMessage(error, "Codex run preflight failed."));
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    ticketStatus,
    runStatus,
    unansweredClarificationCount,
    canStartFreshThread
  };
};

const beginRunPromise = async (
  input: StartRunInput,
  resume: boolean,
  dependencies: CodexRunDependencies = {}
): Promise<CodexRunStartResult> => {
  const projectPath = pathResolve(input.projectPath);
  const ticketId = input.ticketId;
  const freshThread = input.freshThread;
  const runEventSink = dependencies.runEventSink;
  await logInfo("codex:run", "starting run", { projectPath, ticketId, resume, freshThread });
  const preflight = await preflightCodexRun(input);
  if (!preflight.ok) {
    throw new Error(preflight.errors.join(" "));
  }
  const config = await readProjectConfig(projectPath);

  let ticket: Awaited<ReturnType<typeof readTicket>>;
  try {
    ticket = await readTicket(projectPath, ticketId);
  } catch (error) {
    if (isTicketNotFoundError(error)) {
      await logWarn("codex:run", "ticket file missing", { projectPath, ticketId, filePath: error.filePath });
    }
    throw error;
  }
  const clarifications = await readClarificationQuestions(projectPath, ticketId);
  const codex = dependencies.createCodexClient?.() ?? createCodex();
  const options = await threadOptionsForProject(projectPath);
  const runId = dependencies.createRunId?.() ?? newId("run");
  const existingThreadId = resume && !freshThread ? ticket.frontMatter.codexThreadId : null;
  const thread = existingThreadId ? codex.resumeThread(existingThreadId, options) : codex.startThread(options);
  const abortController = new AbortController();
  const prompt = buildExecutionPrompt(ticket.markdown, clarifications);
  const outputOffsets = new Map<string, number>();
  const status = config.columns.some((column) => column.id === RELAY_IN_PROGRESS_STATUS) ? RELAY_IN_PROGRESS_STATUS : ticket.frontMatter.status;
  let currentThreadId = existingThreadId ?? thread.id ?? `pending_${runId}`;
  let streamed: Awaited<ReturnType<CodexRunThread["runStreamed"]>>;
  activeRuns.set(runId, {
    abortController,
    ticketId,
    projectPath
  });
  try {
    await updateTicketRunState(projectPath, ticketId, {
      runStatus: "running",
      lastRunId: runId
    });
    const transitioned = await transitionTicketStatus(projectPath, ticketId, status, {
      actor: "codex",
      source: "agent_execution",
      runId
    });

    if (ticket.frontMatter.status !== transitioned.frontMatter.status) {
      await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
        type: "ticket.status_changed",
        fromStatus: ticket.frontMatter.status,
        toStatus: transitioned.frontMatter.status,
        actor: "codex",
        source: "agent_execution",
        timestamp: nowIso()
      });
    }
    streamed = await thread.runStreamed(prompt, { signal: abortController.signal });
  } catch (error) {
    await logError("codex:run", "run failed before streaming started", error, { projectPath, ticketId, runId, threadId: currentThreadId });
    try {
      await updateTicketRunState(projectPath, ticketId, { runStatus: "failed" });
    } catch (cleanupError) {
      await logWarn("codex:run", "failed to persist startup failure state", {
        projectPath,
        ticketId,
        runId,
        error: errorMessage(cleanupError, "State update failed.")
      });
    }
    try {
      await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
        type: "run.failed",
        message: errorMessage(error, "Codex run failed before streaming started."),
        timestamp: nowIso()
      });
    } catch (emitError) {
      await logWarn("codex:run", "failed to emit startup failure event", {
        projectPath,
        ticketId,
        runId,
        error: errorMessage(emitError, "Event emission failed.")
      });
    }
    activeRuns.delete(runId);
    throw error;
  }
  const started = new Promise<CodexRunStartResult>((resolve) => {
    let resolved = false;
    const resolveOnce = (threadId: string): void => {
      if (!resolved) {
        resolved = true;
        resolve({ runId, threadId });
      }
    };

    void (async () => {
      let finalResponse = "";
      try {
        if (existingThreadId) {
          await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
            type: "run.started",
            runId,
            threadId: currentThreadId,
            timestamp: nowIso()
          });
          resolveOnce(currentThreadId);
        }

        for await (const event of streamed.events) {
          if (event.type === "thread.started") {
            currentThreadId = event.thread_id;
            await updateTicketRunState(projectPath, ticketId, {
              codexThreadId: currentThreadId,
              runStatus: "running",
              lastRunId: runId
            });
            await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
              type: "run.started",
              runId,
              threadId: currentThreadId,
              timestamp: nowIso()
            });
            resolveOnce(currentThreadId);
            continue;
          }

          if (event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed") {
            const text = finalTextFromItem(event.item);
            if (event.item.type === "agent_message" && text) finalResponse = text;
            const normalized = normalizeItemEvent(event, outputOffsets);
            for (const relayEvent of normalized) {
              await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, relayEvent);
            }
            continue;
          }

          if (event.type === "turn.failed" || event.type === "error") {
            const message = event.type === "turn.failed" ? event.error.message : event.message;
            await updateTicketRunState(projectPath, ticketId, { runStatus: "failed" });
            await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
              type: "run.failed",
              message,
              timestamp: nowIso()
            });
            resolveOnce(currentThreadId);
            return;
          }

          if (event.type === "turn.completed") {
            const updated = await readTicket(projectPath, ticketId);
            const handoff = finalResponse || "Codex completed the run without a final text response.";
            const clarificationRequest = extractClarificationRequest(handoff);
            if (clarificationRequest.length > 0) {
              const questions = await createClarificationQuestions(projectPath, ticketId, clarificationRequest, {
                actor: "codex",
                source: "agent_execution",
                runId,
                codexThreadId: currentThreadId
              });
              const targetStatus = config.columns.some((column) => column.id === RELAY_NEEDS_CLARIFICATION_STATUS)
                ? RELAY_NEEDS_CLARIFICATION_STATUS
                : updated.frontMatter.status;
              await updateTicketRunState(projectPath, ticketId, {
                runStatus: "blocked",
                lastRunId: runId,
                markdown: appendCodexHandoff(updated.markdown, handoff)
              });
              const blockedTransition = await transitionTicketStatus(projectPath, ticketId, targetStatus, {
                actor: "codex",
                source: "agent_execution",
                runId
              });
              if (updated.frontMatter.status !== blockedTransition.frontMatter.status) {
                await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
                  type: "ticket.status_changed",
                  fromStatus: updated.frontMatter.status,
                  toStatus: blockedTransition.frontMatter.status,
                  actor: "codex",
                  source: "agent_execution",
                  timestamp: nowIso()
                });
              }
              await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
                type: "clarification.requested",
                questions,
                timestamp: nowIso()
              });
              resolveOnce(currentThreadId);
              return;
            }

            const targetStatus = config.columns.some((column) => column.id === RELAY_REVIEW_STATUS)
              ? RELAY_REVIEW_STATUS
              : updated.frontMatter.status;
            await updateTicketRunState(projectPath, ticketId, {
              runStatus: "completed",
              lastRunId: runId,
              markdown: appendCodexHandoff(updated.markdown, handoff)
            });
            const completedTransition = await transitionTicketStatus(projectPath, ticketId, targetStatus, {
              actor: "codex",
              source: "agent_execution",
              runId
            });
            if (updated.frontMatter.status !== completedTransition.frontMatter.status) {
              await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
                type: "ticket.status_changed",
                fromStatus: updated.frontMatter.status,
                toStatus: completedTransition.frontMatter.status,
                actor: "codex",
                source: "agent_execution",
                timestamp: nowIso()
              });
            }
            await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
              type: "run.completed",
              finalResponse: handoff,
              usage: event.usage,
              timestamp: nowIso()
            });
            resolveOnce(currentThreadId);
            return;
          }
        }
      } catch (error) {
        const aborted = abortController.signal.aborted;
        await logError("codex:run", aborted ? "run cancelled" : "run failed", error);
        await updateTicketRunState(projectPath, ticketId, { runStatus: aborted ? "cancelled" : "failed" });
        await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
          type: "run.failed",
          message: error instanceof Error ? error.message : "Codex run failed.",
          timestamp: nowIso()
        });
        resolveOnce(currentThreadId);
      } finally {
        activeRuns.delete(runId);
      }
    })();
  });

  return started;
};

const beginRunEffect = (
  input: StartRunInput,
  resume: boolean
): BackendEffect<CodexRunStartResult, unknown, BackendServices | CodexRunDependencyServices> =>
  Effect.gen(function*() {
    const dependencies = yield* CodexRunDependencyService;
    return yield* fromPromise(() => beginRunPromise(input, resume, dependencies));
  });

export const startCodexRun = (
  input: StartRunInput,
  dependencies?: CodexRunDependencies
): Promise<CodexRunStartResult> =>
  runBackendEffect(Effect.provide(beginRunEffect(input, false), codexRunDependencyLayer(dependencies)));

export const resumeCodexRun = (
  input: StartRunInput,
  dependencies?: CodexRunDependencies
): Promise<CodexRunStartResult> =>
  runBackendEffect(Effect.provide(beginRunEffect(input, true), codexRunDependencyLayer(dependencies)));

export const cancelCodexRun = async (runId: string): Promise<void> => {
  const run = activeRuns.get(runId);
  if (!run) return;
  run.abortController.abort();
  await updateTicketRunState(run.projectPath, run.ticketId, { runStatus: "cancelled" });
};

export const approveCodexAction = async (_approvalId?: string, _decision?: string): Promise<void> => {
  throw new Error("The current Codex SDK does not expose interactive approval submission. Keep approval policy on-request in Codex config or use the future app-server adapter for richer approvals.");
};

const subticketDraftToCreateInput = (draft: TicketDraftSubticket, parentTitle: string): TicketCreateInput => ({
  title: draft.title,
  priority: draft.priority,
  labels: draft.labels,
  markdown: ticketMarkdownFromSubticketDraft(draft, parentTitle),
  ticketType: "task"
});

export const draftToCreateInput = (draft: TicketDraft): TicketCreateInput => ({
  title: draft.title,
  priority: draft.priority,
  labels: draft.labels,
  markdown: ticketMarkdownFromDraft(draft),
  ticketType: draft.ticketType,
  subtickets: draft.ticketType === "epic" ? draft.subtickets.map((subticket) => subticketDraftToCreateInput(subticket, draft.title)) : []
});
