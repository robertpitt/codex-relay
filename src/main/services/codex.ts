import { BrowserWindow } from "electron";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Codex, type Thread, type ThreadEvent, type ThreadItem, type ThreadOptions } from "@openai/codex-sdk";
import { ZodError } from "zod";
import {
  type ClarificationQuestion,
  type CodexStatus,
  type CreateDraftInput,
  type RelayCodexEvent,
  type RendererRunEvent,
  type StartRunInput,
  type TicketDraft,
  type TicketDraftErrorCode,
  type TicketDraftErrorPayload
} from "../../shared/types";
import { extractClarificationRequest } from "./clarificationParser";
import { ticketDraftSchema } from "./schemas";
import { logError, logInfo, logWarn } from "./logger";
import {
  appendCodexHandoff,
  createClarificationQuestions,
  isTicketNotFoundError,
  isGitRepository,
  newId,
  readClarificationQuestions,
  readProjectConfig,
  readTicket,
  runsPath,
  ticketMarkdownFromDraft,
  transitionTicketStatus,
  writeTicket
} from "./storage";

const execFileAsync = promisify(execFile);
export const TICKET_DRAFT_TIMEOUT_MS = 90_000;

type ActiveRun = {
  abortController: AbortController;
  ticketId: string;
  projectPath: string;
};

const activeRuns = new Map<string, ActiveRun>();

const nowIso = (): string => new Date().toISOString();

const codexEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
};

const createCodex = (): Codex => new Codex({ env: codexEnv() });

type CodexRunThread = Pick<Thread, "id" | "runStreamed">;

type CodexRunClient = {
  startThread: (options: ThreadOptions) => CodexRunThread;
  resumeThread: (threadId: string, options: ThreadOptions) => CodexRunThread;
};

export type CodexRunDependencies = {
  createCodexClient?: () => CodexRunClient;
  createRunId?: () => string;
};

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

const ticketDraftSchemaJson = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "priority",
    "labels",
    "context",
    "requirements",
    "acceptanceCriteria",
    "clarificationQuestions",
    "implementationNotes"
  ],
  properties: {
    title: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    labels: { type: "array", items: { type: "string" } },
    context: { type: "string" },
    requirements: { type: "array", items: { type: "string" } },
    acceptanceCriteria: { type: "array", items: { type: "string" } },
    clarificationQuestions: { type: "array", items: { type: "string" } },
    implementationNotes: { type: "array", items: { type: "string" } }
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

export const getCodexStatus = async (): Promise<CodexStatus> => {
  let cliAvailable = false;
  let cliVersion: string | null = null;
  try {
    const { stdout } = await execFileAsync("codex", ["--version"], { timeout: 5000 });
    cliAvailable = true;
    cliVersion = stdout.trim();
  } catch {
    cliAvailable = false;
  }

  let authenticated: boolean | null = null;
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY);
  try {
    await readFile(path.join(os.homedir(), ".codex", "auth.json"), "utf8");
    authenticated = true;
  } catch {
    authenticated = hasApiKey ? true : false;
  }

  return {
    sdkAvailable: true,
    cliAvailable,
    cliVersion,
    authenticated,
    message: cliAvailable
      ? authenticated === true
        ? "Codex is available."
        : "Codex CLI is available, but no Codex auth file or API key was found."
      : "Codex CLI was not found on PATH."
  };
};

type DraftTimeoutHandle = ReturnType<typeof setTimeout>;

type TicketDraftThread = Pick<Thread, "run">;

type TicketDraftCodex = {
  startThread: (options: ThreadOptions) => TicketDraftThread;
};

export type TicketDraftDependencies = {
  getStatus?: () => Promise<CodexStatus>;
  createCodexClient?: () => TicketDraftCodex;
  draftTimeoutMs?: number;
  createRequestId?: () => string;
  nowMs?: () => number;
  setTimeoutFn?: (callback: () => void, ms: number) => DraftTimeoutHandle;
  clearTimeoutFn?: (handle: DraftTimeoutHandle) => void;
  unrefTimeout?: boolean;
};

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
    `Codex ticket drafting timed out after ${formatTimeout(timeoutMs)}. Your ticket idea and manual fields were preserved; retry Codex or save manually.`,
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
      "Codex ticket drafting was cancelled. Your ticket idea and manual fields were preserved.",
      "codex_generation_cancelled",
      { timeoutMs: context.timeoutMs, cause: error }
    );
  }
  if (error instanceof ZodError || error instanceof SyntaxError || errorMessage(error, "").includes("valid JSON")) {
    return ticketDraftError(
      "invalid_response",
      context.requestId,
      context.durationMs,
      "Codex returned an invalid ticket draft. Your ticket idea and manual fields were preserved.",
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

export const createTicketDraft = async (
  { projectPath, idea }: CreateDraftInput,
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
    const codex = dependencies.createCodexClient?.() ?? createCodex();
    const thread = codex.startThread(await threadOptionsForProject(projectPath));
    abortController = new AbortController();
    const prompt = `You are helping create a local software implementation ticket for Relay.

The user will provide a rough idea. Convert it into a clear, actionable ticket for a coding agent and human developer.

Return only data matching the requested schema. Do not implement the task.

Project path: ${projectPath}
Project name: ${config.name}
Current board columns: ${config.columns.map((column) => column.name).join(", ")}

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
      parsed = ticketDraftSchema.parse(parseJsonResponse(turn.finalResponse)) as TicketDraft;
    } catch (error) {
      throw ticketDraftError(
        "invalid_response",
        requestId,
        durationMs(),
        "Codex returned an invalid ticket draft. Your ticket idea and manual fields were preserved.",
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

const writeRunLog = async (
  projectPath: string,
  ticketId: string,
  runId: string,
  threadId: string,
  event: RelayCodexEvent
): Promise<void> => {
  const filePath = path.join(runsPath(projectPath), ticketId, `${runId}.jsonl`);
  await mkdir(path.dirname(filePath), { recursive: true });
  const { type, timestamp, ...payload } = event;
  await appendFile(
    filePath,
    `${JSON.stringify({
      schemaVersion: 1,
      timestamp,
      ticketId,
      runId,
      threadId,
      type,
      payload
    })}\n`,
    "utf8"
  );
};

const emitRunEvent = async (
  browserWindow: BrowserWindow,
  projectPath: string,
  ticketId: string,
  runId: string,
  threadId: string,
  event: RelayCodexEvent
): Promise<void> => {
  await writeRunLog(projectPath, ticketId, runId, threadId, event);
  const rendererEvent: RendererRunEvent = {
    ...event,
    projectPath,
    ticketId,
    runId
  };
  browserWindow.webContents.send("codex:runEvent", rendererEvent);
};

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

export const readCodexRunEvents = async (projectPath: string, ticketId: string, runId: string): Promise<RendererRunEvent[]> => {
  const filePath = path.join(runsPath(projectPath), ticketId, `${runId}.jsonl`);
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parsed = JSON.parse(line) as {
        timestamp: string;
        ticketId: string;
        runId: string;
        threadId: string;
        type: RelayCodexEvent["type"];
        payload: Record<string, unknown>;
      };
      return {
        ...parsed.payload,
        type: parsed.type,
        timestamp: parsed.timestamp,
        projectPath,
        ticketId: parsed.ticketId,
        runId: parsed.runId
      } as RendererRunEvent;
    });
};

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

const updateTicketRunState = async (
  projectPath: string,
  ticketId: string,
  patch: Partial<{
    codexThreadId: string | null;
    runStatus: "idle" | "drafting" | "running" | "blocked" | "failed" | "completed" | "cancelled";
    lastRunId: string | null;
    status: string;
    markdown: string;
  }>
): Promise<void> => {
  let ticket: Awaited<ReturnType<typeof readTicket>>;
  try {
    ticket = await readTicket(projectPath, ticketId);
  } catch (error) {
    if (isTicketNotFoundError(error)) {
      await logWarn("codex:run", "ticket file missing", { projectPath, ticketId, filePath: error.filePath });
    }
    throw error;
  }
  await writeTicket(projectPath, {
    ...ticket,
    markdown: patch.markdown ?? ticket.markdown,
    frontMatter: {
      ...ticket.frontMatter,
      codexThreadId: patch.codexThreadId !== undefined ? patch.codexThreadId : ticket.frontMatter.codexThreadId,
      runStatus: patch.runStatus ?? ticket.frontMatter.runStatus,
      lastRunId: patch.lastRunId !== undefined ? patch.lastRunId : ticket.frontMatter.lastRunId,
      status: patch.status ?? ticket.frontMatter.status
    }
  });
};

const beginRun = async (
  browserWindow: BrowserWindow,
  input: StartRunInput,
  resume: boolean,
  dependencies: CodexRunDependencies = {}
): Promise<{ runId: string; threadId: string }> => {
  const projectPath = path.resolve(input.projectPath);
  const ticketId = input.ticketId;
  const freshThread = input.freshThread;
  await logInfo("codex:run", "starting run", { projectPath, ticketId, resume, freshThread });
  const config = await readProjectConfig(projectPath);
  if (!config.settings.codexExecutionEnabled) {
    throw new Error("Codex execution is disabled for this project.");
  }

  const git = await isGitRepository(projectPath);
  if (!git && !config.settings.allowNonGitCodexRuns) {
    throw new Error("This project is not a Git repository. Enable non-Git Codex runs in project settings first.");
  }

  let ticket: Awaited<ReturnType<typeof readTicket>>;
  try {
    ticket = await readTicket(projectPath, ticketId);
  } catch (error) {
    if (isTicketNotFoundError(error)) {
      await logWarn("codex:run", "ticket file missing", { projectPath, ticketId, filePath: error.filePath });
    }
    throw error;
  }
  if (ticket.frontMatter.status === "not_doing") {
    throw new Error("Move this ticket out of Not Doing before starting Codex.");
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
  activeRuns.set(runId, {
    abortController,
    ticketId,
    projectPath
  });

  const status = config.columns.some((column) => column.id === "in_progress") ? "in_progress" : ticket.frontMatter.status;
  await updateTicketRunState(projectPath, ticketId, {
    runStatus: "running",
    lastRunId: runId
  });
  const transitioned = await transitionTicketStatus(projectPath, ticketId, status, {
    actor: "codex",
    source: "agent_execution",
    runId
  });

  let currentThreadId = existingThreadId ?? thread.id ?? `pending_${runId}`;
  if (ticket.frontMatter.status !== transitioned.frontMatter.status) {
    await emitRunEvent(browserWindow, projectPath, ticketId, runId, currentThreadId, {
      type: "ticket.status_changed",
      fromStatus: ticket.frontMatter.status,
      toStatus: transitioned.frontMatter.status,
      actor: "codex",
      source: "agent_execution",
      timestamp: nowIso()
    });
  }
  const streamed = await thread.runStreamed(prompt, { signal: abortController.signal });
  const started = new Promise<{ runId: string; threadId: string }>((resolve) => {
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
          await emitRunEvent(browserWindow, projectPath, ticketId, runId, currentThreadId, {
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
            await emitRunEvent(browserWindow, projectPath, ticketId, runId, currentThreadId, {
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
              await emitRunEvent(browserWindow, projectPath, ticketId, runId, currentThreadId, relayEvent);
            }
            continue;
          }

          if (event.type === "turn.failed" || event.type === "error") {
            const message = event.type === "turn.failed" ? event.error.message : event.message;
            await updateTicketRunState(projectPath, ticketId, { runStatus: "failed" });
            await emitRunEvent(browserWindow, projectPath, ticketId, runId, currentThreadId, {
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
              const targetStatus = config.columns.some((column) => column.id === "needs_clarification")
                ? "needs_clarification"
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
                await emitRunEvent(browserWindow, projectPath, ticketId, runId, currentThreadId, {
                  type: "ticket.status_changed",
                  fromStatus: updated.frontMatter.status,
                  toStatus: blockedTransition.frontMatter.status,
                  actor: "codex",
                  source: "agent_execution",
                  timestamp: nowIso()
                });
              }
              await emitRunEvent(browserWindow, projectPath, ticketId, runId, currentThreadId, {
                type: "clarification.requested",
                questions,
                timestamp: nowIso()
              });
              resolveOnce(currentThreadId);
              return;
            }

            const targetStatus = config.columns.some((column) => column.id === "completed") ? "completed" : updated.frontMatter.status;
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
              await emitRunEvent(browserWindow, projectPath, ticketId, runId, currentThreadId, {
                type: "ticket.status_changed",
                fromStatus: updated.frontMatter.status,
                toStatus: completedTransition.frontMatter.status,
                actor: "codex",
                source: "agent_execution",
                timestamp: nowIso()
              });
            }
            await emitRunEvent(browserWindow, projectPath, ticketId, runId, currentThreadId, {
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
        await emitRunEvent(browserWindow, projectPath, ticketId, runId, currentThreadId, {
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

export const startCodexRun = (
  browserWindow: BrowserWindow,
  input: StartRunInput,
  dependencies?: CodexRunDependencies
): Promise<{ runId: string; threadId: string }> => beginRun(browserWindow, input, false, dependencies);

export const resumeCodexRun = (
  browserWindow: BrowserWindow,
  input: StartRunInput,
  dependencies?: CodexRunDependencies
): Promise<{ runId: string; threadId: string }> => beginRun(browserWindow, input, true, dependencies);

export const cancelCodexRun = async (runId: string): Promise<void> => {
  const run = activeRuns.get(runId);
  if (!run) return;
  run.abortController.abort();
  await updateTicketRunState(run.projectPath, run.ticketId, { runStatus: "cancelled" });
};

export const approveCodexAction = async (_approvalId?: string, _decision?: string): Promise<void> => {
  throw new Error("The current Codex SDK does not expose interactive approval submission. Keep approval policy on-request in Codex config or use the future app-server adapter for richer approvals.");
};

export const draftToCreateInput = (draft: TicketDraft): { title: string; priority: TicketDraft["priority"]; labels: string[]; markdown: string } => ({
  title: draft.title,
  priority: draft.priority,
  labels: draft.labels,
  markdown: ticketMarkdownFromDraft(draft)
});
