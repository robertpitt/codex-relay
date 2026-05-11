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
  RELAY_TODO_STATUS,
  type RelayCodexEvent,
  type RendererRunEvent,
  type RunSummary,
  type RunStatus,
  type StartRunInput,
  type TicketCreateInput,
  type TicketDraft,
  type TicketDraftSubticket,
  type TicketDraftResearchLimits,
  type TicketDraftErrorCode,
  type TicketDraftErrorPayload,
  type TicketRecord
} from "../../../shared/types";
import { resolvedBlockerLabel, resolveTicketBlockers } from "../../../shared/blockers";
import { extractClarificationRequest } from "../clarificationParser";
import { type BackendEffect, type BackendServices, fromPromise, runBackendEffect } from "../runtime";
import {
  emitRunEvent,
  emitRunEventToRendererSink,
  readRunEvents,
  readRunSummary,
  type RendererRunEventSink
} from "../run-events";
import { agentTicketUpdateSchema, ticketDraftSchema } from "../schemas";
import { logError, logInfo, logWarn } from "../logger";
import { pathResolve } from "../io";
import { fallbackResearchFindings, renderResearchForPrompt, researchTicketDraft } from "./research";
import { getCodexStatus } from "./status";
import {
  appendCodexHandoff,
  applyTicketDraftToTicket,
  blockPendingTicketDraftForClarification,
  createClarificationQuestions,
  createPendingTicketDraft,
  failPendingTicketDraft,
  isTicketNotFoundError,
  isGitRepository,
  newId,
  readClarificationQuestions,
  readBoard,
  readProjectConfig,
  readTicket,
  ticketMarkdownFromDraft,
  ticketMarkdownFromSubticketDraft,
  transitionTicketStatus,
  writeTicket
} from "../storage";

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
    "testPlan",
    "acceptanceCriteria",
    "clarificationQuestions",
    "assumptions",
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
    testPlan: { type: "array", items: { type: "string" } },
    acceptanceCriteria: { type: "array", items: { type: "string" } },
    clarificationQuestions: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    implementationNotes: { type: "array", items: { type: "string" } }
  }
} as const;

const ticketDraftSchemaJson = {
  ...ticketDraftBaseSchemaJson,
  required: [...ticketDraftBaseSchemaJson.required, "draftState", "blockingClarificationQuestions", "ticketType", "subtickets"],
  properties: {
    ...ticketDraftBaseSchemaJson.properties,
    draftState: { type: "string", enum: ["ready", "needs_clarification"] },
    blockingClarificationQuestions: { type: "array", items: { type: "string" } },
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
type DraftProgressIntervalHandle = ReturnType<typeof setInterval>;
type TicketDraftProgressReporter = (message: string) => void | Promise<void>;

export type TicketDraftThread = Pick<Thread, "run"> & Partial<Pick<Thread, "id">>;

export type TicketDraftCodexClient = {
  startThread: (options: ThreadOptions) => TicketDraftThread;
};

export type TicketDraftDependencies = {
  getStatus?: () => Promise<CodexStatus>;
  createCodexClient?: () => TicketDraftCodexClient;
  /** @deprecated Draft generation no longer has an internal timeout. */
  draftTimeoutMs?: number;
  researchLimits?: Partial<TicketDraftResearchLimits>;
  fetchUrl?: typeof fetch;
  disableResearch?: boolean;
  createRequestId?: () => string;
  nowMs?: () => number;
  abortController?: AbortController;
  onProgress?: TicketDraftProgressReporter;
  draftProgressIntervalMs?: number;
  /** @deprecated Draft generation no longer starts an internal timeout. */
  setTimeoutFn?: (callback: () => void, ms: number) => DraftTimeoutHandle;
  /** @deprecated Draft generation no longer starts an internal timeout. */
  clearTimeoutFn?: (handle: DraftTimeoutHandle) => void;
  /** @deprecated Draft generation no longer starts an internal timeout. */
  unrefTimeout?: boolean;
};

export type TicketDraftStartDependencies = TicketDraftDependencies & {
  createRunId?: () => string;
  runEventSink?: RendererRunEventSink;
};

export type TicketDraftStart = {
  ticket: TicketRecord;
  runId: string;
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

const isAbortLikeError = (error: unknown): boolean =>
  error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));

const unrefTimerHandle = (handle: DraftTimeoutHandle | DraftProgressIntervalHandle): void => {
  if (typeof handle === "object" && handle && "unref" in handle && typeof handle.unref === "function") {
    handle.unref();
  }
};

const errorMessage = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const formatDraftWait = (durationMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};

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

const normalizeTicketDraftError = (
  error: unknown,
  context: {
    requestId: string;
    durationMs: number;
    signalAborted: boolean;
  }
): TicketDraftServiceError => {
  if (error instanceof TicketDraftServiceError) return error;
  if (context.signalAborted || isAbortLikeError(error)) {
    return ticketDraftError(
      "cancelled",
      context.requestId,
      context.durationMs,
      "Codex ticket drafting was cancelled. Your rough idea is still available.",
      "codex_generation_cancelled",
      { cause: error }
    );
  }
  if (error instanceof ZodError || error instanceof SyntaxError || errorMessage(error, "").includes("valid JSON")) {
    return ticketDraftError(
      "invalid_response",
      context.requestId,
      context.durationMs,
      "Codex returned an invalid ticket draft. Your rough idea is still available; retry Codex when ready.",
      "invalid_codex_response",
      { cause: error }
    );
  }
  return ticketDraftError(
    "backend_failure",
    context.requestId,
    context.durationMs,
    errorMessage(error, "Ticket drafting failed."),
    "codex_backend_failure",
    { cause: error }
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

type TicketDraftOutcome =
  | { status: "ready"; draft: TicketDraft }
  | { status: "needs_clarification"; draft: TicketDraft; questions: string[] };

const cleanStringList = (items: readonly string[] | undefined): string[] =>
  [...new Set((items ?? []).map((item) => normalizeWhitespace(item)).filter(Boolean))];

const DEFERRED_RESEARCH_STEP_PATTERN = /^\s*(?:inspect|find|trace|audit|look for|search|review)\b/i;

const normalizeSubticketDraft = (draft: TicketDraftSubticket): TicketDraftSubticket => ({
  ...draft,
  labels: cleanStringList(draft.labels),
  researchFindings: cleanStringList(draft.researchFindings),
  requirements: cleanStringList(draft.requirements),
  implementationPlan: cleanStringList(draft.implementationPlan),
  testPlan: cleanStringList(draft.testPlan),
  acceptanceCriteria: cleanStringList(draft.acceptanceCriteria),
  clarificationQuestions: cleanStringList(draft.clarificationQuestions),
  assumptions: cleanStringList(draft.assumptions),
  implementationNotes: cleanStringList(draft.implementationNotes)
});

const fallbackTestPlan = (): string[] => ["Run the project's standard validation command plus focused tests for the files changed by this ticket."];

const normalizeTicketDraftOutcome = (parsedDraft: TicketDraft, research: Awaited<ReturnType<typeof researchTicketDraft>>): TicketDraftOutcome => {
  const normalizedBase = normalizeSubticketDraft(parsedDraft);
  const metadataFindings = fallbackResearchFindings(research.metadata);
  const researchFindings = cleanStringList([...normalizedBase.researchFindings, ...metadataFindings]);
  const implementationPlan =
    normalizedBase.implementationPlan.length > 0 ? normalizedBase.implementationPlan : normalizedBase.implementationNotes;
  const testPlan = normalizedBase.testPlan && normalizedBase.testPlan.length > 0 ? normalizedBase.testPlan : fallbackTestPlan();
  const blockingQuestions = cleanStringList([
    ...(parsedDraft.blockingClarificationQuestions ?? []),
    ...(parsedDraft.draftState === "needs_clarification" ? parsedDraft.clarificationQuestions : [])
  ]);
  const readyQuestions = parsedDraft.draftState === "ready" ? cleanStringList(parsedDraft.clarificationQuestions) : [];
  const draft: TicketDraft = {
    ...parsedDraft,
    ...normalizedBase,
    draftState: parsedDraft.draftState ?? "ready",
    blockingClarificationQuestions: blockingQuestions,
    researchFindings:
      researchFindings.length > 0
        ? researchFindings
        : ["No matching source files or URLs were identified during bounded draft research."],
    implementationPlan,
    testPlan,
    clarificationQuestions: parsedDraft.draftState === "needs_clarification" ? [] : readyQuestions,
    assumptions: normalizedBase.assumptions,
    implementationNotes: normalizedBase.implementationNotes,
    subtickets: parsedDraft.subtickets.map((subticket) => {
      const normalizedSubticket = normalizeSubticketDraft(subticket);
      return {
        ...normalizedSubticket,
        testPlan: normalizedSubticket.testPlan && normalizedSubticket.testPlan.length > 0 ? normalizedSubticket.testPlan : fallbackTestPlan()
      };
    }),
    research: research.metadata
  };

  const needsClarification = draft.draftState === "needs_clarification" || blockingQuestions.length > 0 || readyQuestions.length > 0;
  if (needsClarification) {
    const questions = cleanStringList([...blockingQuestions, ...readyQuestions]);
    if (questions.length === 0) {
      throw new Error("Draft requested clarification but did not include any blocking questions.");
    }
    return { status: "needs_clarification", draft: { ...draft, draftState: "needs_clarification" }, questions };
  }

  if (draft.requirements.length === 0) throw new Error("Ready draft must include concrete requirements.");
  if (draft.implementationPlan.length === 0) throw new Error("Ready draft must include a concrete implementation plan.");
  if (draft.acceptanceCriteria.length === 0) throw new Error("Ready draft must include acceptance criteria.");
  if (!draft.testPlan || draft.testPlan.length === 0) throw new Error("Ready draft must include a test plan.");
  const deferredStep = draft.implementationPlan.find((step) => DEFERRED_RESEARCH_STEP_PATTERN.test(step));
  if (deferredStep) {
    throw new Error(`Ready draft defers core research to implementation: ${deferredStep}`);
  }

  return { status: "ready", draft: { ...draft, draftState: "ready", blockingClarificationQuestions: [], clarificationQuestions: [] } };
};

const reportTicketDraftProgress = async (dependencies: TicketDraftDependencies, message: string): Promise<void> => {
  try {
    await dependencies.onProgress?.(message);
  } catch (error) {
    await logWarn("codex:draft", "ticket draft progress callback failed", { error: errorMessage(error, "Progress callback failed.") });
  }
};

const createTicketDraftPromise = async (
  { projectPath, idea, preferredTicketType, ticketId }: CreateDraftInput,
  dependencies: TicketDraftDependencies = {}
): Promise<TicketDraftOutcome> => {
  const requestId = dependencies.createRequestId?.() ?? newId("tdr");
  const startedAt = dependencies.nowMs?.() ?? Date.now();
  const nowMs = dependencies.nowMs ?? Date.now;
  const durationMs = (): number => Math.max(0, nowMs() - startedAt);
  const abortController = dependencies.abortController ?? new AbortController();
  let progressInterval: DraftProgressIntervalHandle | null = null;
  const logBase = { requestId, projectPath, ideaLength: idea.length };

  await logInfo("codex:draft", "starting ticket draft", logBase);

  try {
    await reportTicketDraftProgress(dependencies, "Checking Codex availability for ticket drafting.");
    const status = await (dependencies.getStatus ?? getCodexStatus)();
    if (!status.cliAvailable) {
      await logWarn("codex:draft", "codex cli unavailable", { ...logBase, durationMs: durationMs(), status });
      throw ticketDraftError(
        "codex_unavailable",
        requestId,
        durationMs(),
        "Codex CLI was not found on PATH. Install or expose Codex before drafting tickets.",
        "codex_cli_unavailable"
      );
    }
    if (status.authenticated === false) {
      await logWarn("codex:draft", "codex auth unavailable", { ...logBase, durationMs: durationMs(), status });
      throw ticketDraftError(
        "codex_unauthenticated",
        requestId,
        durationMs(),
        "Codex is not authenticated. Run `codex login` in your terminal, then try drafting again.",
        "codex_auth_unavailable"
      );
    }

    const config = await readProjectConfig(projectPath);
    const existingDraftTicket = ticketId ? await readTicket(projectPath, ticketId) : null;
    const draftClarifications = ticketId ? await readClarificationQuestions(projectPath, ticketId) : [];
    await reportTicketDraftProgress(dependencies, "Running bounded draft research across the project.");
    const research = await researchTicketDraft({ projectPath, idea, preferredTicketType, ticketId }, dependencies);
    await reportTicketDraftProgress(
      dependencies,
      `Draft research completed: checked ${research.metadata.checkedUrls.length} URL${research.metadata.checkedUrls.length === 1 ? "" : "s"}, inspected ${
        research.metadata.inspectedFiles.length
      } file${research.metadata.inspectedFiles.length === 1 ? "" : "s"}, recorded ${research.metadata.limitations.length} limitation${
        research.metadata.limitations.length === 1 ? "" : "s"
      }.`
    );
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
    const ticketTypeGuidance =
      preferredTicketType === "epic"
        ? "The user selected Epic mode. Return ticketType \"epic\" and decompose the work into normal task subtickets."
        : "The user selected Task mode unless the idea explicitly asks for an epic. Return ticketType \"task\" with an empty subtickets array for ordinary work.";
    const clarificationContext = ticketId
      ? `Clarification records already attached to this draft ticket:
${formatClarificationsForPrompt(draftClarifications)}

Existing draft ticket markdown:
${existingDraftTicket?.markdown ?? "No existing draft ticket markdown was loaded."}`
      : "No prior clarification records are attached to this new draft.";
    const prompt = `You are helping create a local software implementation ticket for Relay.

The user will provide a rough idea. Convert it into an implementation-ready ticket for a coding agent and human developer.

The drafting phase must do the research and decision work up front. The implementation agent should not need to discover the basic affected files, entry points, existing patterns, product decisions, or test locations before it can start editing.

Use the bounded research context below to ground the ticket. Include concrete source references in researchFindings, such as file paths, function/component names, matched line numbers, existing behavior, or URL titles. If research failed or was incomplete, record the limitation in implementationNotes, assumptions, or blockingClarificationQuestions depending on whether it blocks a usable plan.

Return draftState "ready" only when the ticket is implementation-ready. A ready ticket must include:
- resolved product and technical decisions, with conservative assumptions recorded in assumptions;
- codebase findings with exact files, symbols, and existing behavior;
- concrete requirements and acceptance criteria;
- implementationPlan steps that tell the coding agent what to change, not what to research;
- testPlan entries with focused tests or validation commands.

Do not put deferred discovery into implementationPlan. Avoid steps starting with "inspect", "find", "trace", "audit", "look for", "search", or "review" unless the step is only final verification after concrete codebase findings are already provided.

If a blocking product or technical decision cannot be answered from the user's idea, prior clarification answers, or codebase research, return draftState "needs_clarification" and put only those blocking user-answerable questions in blockingClarificationQuestions. Do not create a weak ticket with questions for the implementation agent. For non-blocking uncertainty, choose a conservative default and record it in assumptions.

Use clarificationQuestions only for non-blocking open questions that should remain visible on a final ticket; prefer assumptions for chosen defaults. When draftState is "needs_clarification", duplicate the blocking questions into clarificationQuestions only if required by the schema.

Do not include large copied source blocks or long page excerpts.

Relay supports two ticket types: task and epic. ${ticketTypeGuidance}
For epic drafts, the parent epic should describe the overall outcome and subtickets should be independently implementable normal task tickets with their own requirements, implementationPlan, testPlan, acceptanceCriteria, labels, and priority. Do not create nested epics. For task drafts, subtickets must be an empty array.

Return only data matching the requested schema. Do not implement the task.

Project path: ${projectPath}
Project name: ${config.name}
Current board columns: ${config.columns.map((column) => column.name).join(", ")}

Draft clarification context:
${clarificationContext}

Research context:
${renderResearchForPrompt(research)}

User idea:
${idea}`;

    await reportTicketDraftProgress(dependencies, "Codex is writing the implementation-ready ticket draft. This can take several minutes.");
    const progressIntervalMs = dependencies.draftProgressIntervalMs ?? 60_000;
    if (dependencies.onProgress && progressIntervalMs > 0) {
      progressInterval = setInterval(() => {
        void reportTicketDraftProgress(
          dependencies,
          `Still waiting for Codex to return the structured ticket draft after ${formatDraftWait(durationMs())}.`
        );
      }, progressIntervalMs);
      unrefTimerHandle(progressInterval);
    }
    const turn = await thread.run(prompt, { outputSchema: ticketDraftSchemaJson, signal: abortController.signal });
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    await reportTicketDraftProgress(dependencies, "Codex returned a draft; validating the structured ticket.");
    let parsed: TicketDraftOutcome;
    try {
      const parsedDraft = ticketDraftSchema.parse(parseJsonResponse(turn.finalResponse));
      parsed = normalizeTicketDraftOutcome(parsedDraft, research);
    } catch (error) {
      throw ticketDraftError(
        "invalid_response",
        requestId,
        durationMs(),
        "Codex returned an invalid ticket draft. Your rough idea is still available; retry Codex when ready.",
        "invalid_codex_response",
        { cause: error }
      );
    }
    await logInfo("codex:draft", "ticket draft completed", {
      ...logBase,
      durationMs: durationMs(),
      title: parsed.draft.title,
      reason: parsed.status
    });
    await reportTicketDraftProgress(
      dependencies,
      parsed.status === "ready"
        ? "Draft validation completed; applying the ticket."
        : `Draft validation completed; ${parsed.questions.length} blocking clarification question${parsed.questions.length === 1 ? "" : "s"} required.`
    );
    return parsed;
  } catch (error) {
    const draftError = normalizeTicketDraftError(error, {
      requestId,
      durationMs: durationMs(),
      signalAborted: abortController.signal.aborted
    });
    const failureMeta = { ...logBase, ...draftError.toPayload() };
    if (draftError.code === "timeout" || draftError.code === "cancelled") {
      await logWarn("codex:draft", "ticket draft did not complete", failureMeta);
    } else {
      await logError("codex:draft", "ticket draft failed", draftError, failureMeta);
    }
    throw draftError;
  } finally {
    if (progressInterval) clearInterval(progressInterval);
  }
};

const createTicketDraftEffect = (
  input: CreateDraftInput
): BackendEffect<TicketDraftOutcome, unknown, BackendServices | TicketDraftDependencyServices> =>
  Effect.gen(function*() {
    const dependencies = yield* TicketDraftDependencyService;
    return yield* fromPromise(() => createTicketDraftPromise(input, dependencies));
  });

export const createTicketDraft = (
  input: CreateDraftInput,
  dependencies: TicketDraftDependencies = {}
): Promise<TicketDraft> =>
  createTicketDraftOutcome(input, dependencies).then((outcome) => {
    if (outcome.status === "ready") return outcome.draft;
    throw ticketDraftError(
      "clarification_required",
      "unknown",
      0,
      "Codex needs clarification before it can produce an implementation-ready ticket.",
      "draft_clarification_required"
    );
  });

const createTicketDraftOutcome = (
  input: CreateDraftInput,
  dependencies: TicketDraftDependencies = {}
): Promise<TicketDraftOutcome> => runBackendEffect(Effect.provide(createTicketDraftEffect(input), ticketDraftDependencyLayer(dependencies)));

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

const draftRunThreadId = (runId: string): string => `draft_${runId}`;

export const startTicketDraftRun = async (
  input: CreateDraftInput,
  dependencies: TicketDraftStartDependencies = {}
): Promise<TicketDraftStart> => {
  const projectPath = pathResolve(input.projectPath);
  const idea = input.idea.trim();
  const runId = dependencies.createRunId?.() ?? newId("run");
  const threadId = draftRunThreadId(runId);
  const abortController = new AbortController();

  const ticket = await createPendingTicketDraft(projectPath, { ...input, projectPath, idea }, runId);
  const emitDraftEvent = async (event: RelayCodexEvent): Promise<void> => {
    try {
      await emitRunEventForDependencies(dependencies.runEventSink, projectPath, ticket.frontMatter.id, runId, threadId, event);
    } catch (error) {
      await logWarn("codex:draft", "failed to emit ticket draft event", {
        projectPath,
        ticketId: ticket.frontMatter.id,
        runId,
        eventType: event.type,
        error: errorMessage(error, "Event emission failed.")
      });
    }
  };

  await emitDraftEvent({
    type: "run.started",
    runId,
    threadId,
    timestamp: nowIso()
  });

  activeRuns.set(runId, {
    abortController,
    ticketId: ticket.frontMatter.id,
    projectPath
  });

  const draftDependencies: TicketDraftStartDependencies = {
    ...dependencies,
    abortController,
    onProgress: async (message) => {
      await dependencies.onProgress?.(message);
      await emitDraftEvent({
        type: "agent.message.completed",
        text: message,
        timestamp: nowIso()
      });
    }
  };

  void (async () => {
    try {
      const outcome = await createTicketDraftOutcome(
        { projectPath, idea, preferredTicketType: input.preferredTicketType, ticketId: ticket.frontMatter.id },
        draftDependencies
      );
      if (outcome.status === "needs_clarification") {
        const questions = await createClarificationQuestions(
          projectPath,
          ticket.frontMatter.id,
          outcome.questions.map((question) => ({ question })),
          {
            actor: "codex",
            source: "draft_generation",
            runId,
            codexThreadId: threadId
          }
        );
        await blockPendingTicketDraftForClarification(projectPath, ticket.frontMatter.id, idea, runId, outcome.questions, outcome.draft.research);
        await emitDraftEvent({
          type: "clarification.requested",
          questions,
          timestamp: nowIso()
        });
        await logInfo("codex:draft", "async ticket draft blocked on clarification", {
          projectPath,
          ticketId: ticket.frontMatter.id,
          runId,
          clarificationQuestionCount: questions.length
        });
        return;
      }

      const draft = outcome.draft;
      await applyTicketDraftToTicket(projectPath, ticket.frontMatter.id, draft, runId);
      await emitDraftEvent({
        type: "run.completed",
        finalResponse: `Ticket draft completed and applied to ${ticket.frontMatter.id}: ${draft.title}`,
        finalStatus: "draft_complete",
        timestamp: nowIso()
      });
      await logInfo("codex:draft", "async ticket draft applied", {
        projectPath,
        ticketId: ticket.frontMatter.id,
        runId,
        title: draft.title
      });
    } catch (error) {
      const payload = ticketDraftErrorToPayload(error);
      try {
        if (payload.code === "cancelled") {
          const latest = await readTicket(projectPath, ticket.frontMatter.id);
          await writeTicket(projectPath, {
            ...latest,
            frontMatter: {
              ...latest.frontMatter,
              runStatus: "cancelled",
              lastRunId: runId
            }
          });
        } else {
          await failPendingTicketDraft(projectPath, ticket.frontMatter.id, idea, runId, payload.message);
        }
      } catch (persistError) {
        await logError("codex:draft", "async ticket draft failure state could not be persisted", persistError, {
          projectPath,
          ticketId: ticket.frontMatter.id,
          runId,
          draftError: payload
        });
      }
      await emitDraftEvent({
        type: "run.failed",
        message: payload.message,
        details: payload,
        finalStatus: payload.code === "cancelled" ? "cancelled" : "draft_failed",
        timestamp: nowIso()
      });
      if (payload.code === "timeout" || payload.code === "cancelled") {
        await logWarn("codex:draft", "async ticket draft did not complete", {
          projectPath,
          ticketId: ticket.frontMatter.id,
          runId,
          ...payload
        });
      } else {
        await logError("codex:draft", "async ticket draft failed", error, {
          projectPath,
          ticketId: ticket.frontMatter.id,
          runId,
          ...payload
        });
      }
    } finally {
      activeRuns.delete(runId);
    }
  })();

  return { ticket, runId };
};

const extractMarkdownSection = (markdown: string, heading: string): string | null => {
  const pattern = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  const match = pattern.exec(markdown);
  if (!match) return null;
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const nextHeading = rest.search(/\n##\s+/);
  return (nextHeading >= 0 ? rest.slice(0, nextHeading) : rest).trim();
};

const originalIdeaFromDraftMarkdown = (markdown: string): string | null => extractMarkdownSection(markdown, "Original Idea");

const setExistingDraftInProgress = async (projectPath: string, ticketId: string, runId: string): Promise<TicketRecord> => {
  const ticket = await readTicket(projectPath, ticketId);
  const config = await readProjectConfig(projectPath);
  const status = config.columns.some((column) => column.id === RELAY_TODO_STATUS) ? RELAY_TODO_STATUS : ticket.frontMatter.status;
  return writeTicket(projectPath, {
    ...ticket,
    frontMatter: {
      ...ticket.frontMatter,
      status,
      runStatus: "drafting",
      lastRunId: runId
    }
  });
};

export const maybeResumeTicketDraftAfterClarification = async (
  projectPathInput: string,
  ticketId: string,
  dependencies: TicketDraftStartDependencies = {}
): Promise<TicketDraftStart | null> => {
  const projectPath = pathResolve(projectPathInput);
  const ticket = await readTicket(projectPath, ticketId);
  if (ticket.frontMatter.runStatus !== "blocked") return null;
  if (!/Ticket draft generation is blocked on clarification\./.test(ticket.markdown)) return null;

  const clarifications = await readClarificationQuestions(projectPath, ticketId);
  const draftClarifications = clarifications.filter((question) => question.source === "draft_generation");
  if (draftClarifications.length === 0 || draftClarifications.some((question) => !question.answer?.trim())) return null;

  const idea = originalIdeaFromDraftMarkdown(ticket.markdown);
  if (!idea) {
    await logWarn("codex:draft", "draft clarification answered but original idea could not be recovered", { projectPath, ticketId });
    return null;
  }

  const runId = dependencies.createRunId?.() ?? newId("run");
  const threadId = draftRunThreadId(runId);
  const abortController = new AbortController();
  const draftingTicket = await setExistingDraftInProgress(projectPath, ticketId, runId);
  const emitDraftEvent = async (event: RelayCodexEvent): Promise<void> => {
    try {
      await emitRunEventForDependencies(dependencies.runEventSink, projectPath, ticketId, runId, threadId, event);
    } catch (error) {
      await logWarn("codex:draft", "failed to emit resumed ticket draft event", {
        projectPath,
        ticketId,
        runId,
        eventType: event.type,
        error: errorMessage(error, "Event emission failed.")
      });
    }
  };

  await emitDraftEvent({
    type: "run.started",
    runId,
    threadId,
    timestamp: nowIso()
  });

  activeRuns.set(runId, {
    abortController,
    ticketId,
    projectPath
  });

  const draftDependencies: TicketDraftStartDependencies = {
    ...dependencies,
    abortController,
    onProgress: async (message) => {
      await dependencies.onProgress?.(message);
      await emitDraftEvent({
        type: "agent.message.completed",
        text: message,
        timestamp: nowIso()
      });
    }
  };

  void (async () => {
    try {
      const outcome = await createTicketDraftOutcome(
        { projectPath, ticketId, idea, preferredTicketType: draftingTicket.frontMatter.ticketType },
        draftDependencies
      );
      if (outcome.status === "needs_clarification") {
        const questions = await createClarificationQuestions(
          projectPath,
          ticketId,
          outcome.questions.map((question) => ({ question })),
          {
            actor: "codex",
            source: "draft_generation",
            runId,
            codexThreadId: threadId
          }
        );
        await blockPendingTicketDraftForClarification(projectPath, ticketId, idea, runId, outcome.questions, outcome.draft.research);
        await emitDraftEvent({
          type: "clarification.requested",
          questions,
          timestamp: nowIso()
        });
        await logInfo("codex:draft", "resumed ticket draft blocked on clarification", {
          projectPath,
          ticketId,
          runId,
          clarificationQuestionCount: questions.length
        });
        return;
      }

      const draft = outcome.draft;
      await applyTicketDraftToTicket(projectPath, ticketId, draft, runId);
      await emitDraftEvent({
        type: "run.completed",
        finalResponse: `Ticket draft completed and applied to ${ticketId}: ${draft.title}`,
        finalStatus: "draft_complete",
        timestamp: nowIso()
      });
      await logInfo("codex:draft", "resumed ticket draft applied", { projectPath, ticketId, runId, title: draft.title });
    } catch (error) {
      const payload = ticketDraftErrorToPayload(error);
      try {
        if (payload.code === "cancelled") {
          const latest = await readTicket(projectPath, ticketId);
          await writeTicket(projectPath, {
            ...latest,
            frontMatter: {
              ...latest.frontMatter,
              runStatus: "cancelled",
              lastRunId: runId
            }
          });
        } else {
          await failPendingTicketDraft(projectPath, ticketId, idea, runId, payload.message);
        }
      } catch (persistError) {
        await logError("codex:draft", "resumed ticket draft failure state could not be persisted", persistError, {
          projectPath,
          ticketId,
          runId,
          draftError: payload
        });
      }
      await emitDraftEvent({
        type: "run.failed",
        message: payload.message,
        details: payload,
        finalStatus: payload.code === "cancelled" ? "cancelled" : "draft_failed",
        timestamp: nowIso()
      });
      if (payload.code === "timeout" || payload.code === "cancelled") {
        await logWarn("codex:draft", "resumed ticket draft did not complete", { projectPath, ticketId, runId, ...payload });
      } else {
        await logError("codex:draft", "resumed ticket draft failed", error, { projectPath, ticketId, runId, ...payload });
      }
    } finally {
      activeRuns.delete(runId);
    }
  })();

  return { ticket: draftingTicket, runId };
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
    return [{ type: "run.failed", message: item.message, finalStatus: "failed", timestamp }];
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

export const readCodexLatestRunSummary = async (projectPath: string, ticketId: string): Promise<RunSummary | null> => {
  const ticket = await readTicket(projectPath, ticketId);
  const runId = ticket.frontMatter.lastRunId;
  if (!runId) return null;
  return readRunSummary(projectPath, ticketId, runId, ticket.frontMatter.runStatus);
};

function formatClarificationsForPrompt(clarifications: ClarificationQuestion[]): string {
  if (clarifications.length === 0) return "No clarification questions have been recorded for this ticket.";
  return clarifications
    .map((question) => {
      const status = question.answer ? "answered" : "unanswered";
      const answer = question.answer ? `\nAnswer: ${question.answer}` : "";
      return `- [${status}] ${question.question}${answer}`;
    })
    .join("\n");
}

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

    const emitFailure = async (message: string, finalStatus: RunStatus = "failed"): Promise<void> => {
      await emitStarted();
      await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
        type: "run.failed",
        message,
        finalStatus,
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
                finalStatus: "completed",
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
        await emitFailure(message, abortController.signal.aborted ? "cancelled" : "failed");
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

    const board = await readBoard(projectPath);
    const blockerState = resolveTicketBlockers(ticket.frontMatter, board.tickets, config.columns);
    if (blockerState.selfBlockerIds.length > 0) {
      errors.push("Ticket blocker metadata is invalid: a ticket cannot block itself.");
    }
    if (blockerState.activeBlockers.length > 0) {
      errors.push(
        `Blocked by active blocker(s): ${blockerState.activeBlockers.map(resolvedBlockerLabel).join("; ")}. Move blockers to terminal columns before starting Codex.`
      );
    }
    if (blockerState.missingBlockerIds.length > 0) {
      warnings.push(`Missing blocker reference(s): ${blockerState.missingBlockerIds.join(", ")}.`);
    }

    const activeRunId = activeRunIdForTicket(projectPath, ticketId);
    if (activeRunId) {
      errors.push(`Ticket already has an active Codex run: ${activeRunId}.`);
    } else if (ticket.frontMatter.runStatus === "drafting") {
      errors.push("Codex is still drafting this ticket. Wait for the draft to finish before starting a run.");
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
        finalStatus: "failed",
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
              finalStatus: "failed",
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
              finalStatus: "completed",
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
          finalStatus: aborted ? "cancelled" : "failed",
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
