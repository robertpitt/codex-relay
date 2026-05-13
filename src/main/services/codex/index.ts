import { Context, Effect, Layer, Schedule } from "effect";
import { Codex, type CodexOptions, type Input, type Thread, type ThreadEvent, type ThreadItem, type ThreadOptions } from "@openai/codex-sdk";
import {
  type AgentTicketUpdate,
  type AgentTicketUpdateInput,
  type AgentTicketUpdateStartResult,
  type ClarificationQuestion,
  type CodexRunStartResult,
  type CodexRunPreflightResult,
  type CodexStatus,
  type CreateDraftInput,
  type DraftIntakeAnswer,
  type DraftIntakeInput,
  type DraftIntakeQuestion,
  type DraftIntakeResult,
  type DraftScope,
  RELAY_COMPLETED_STATUS,
  RELAY_IN_PROGRESS_STATUS,
  RELAY_NEEDS_CLARIFICATION_STATUS,
  RELAY_READY_STATUS,
  RELAY_REVIEW_STATUS,
  RELAY_TODO_STATUS,
  type RelayCodexEvent,
  type RepositoryChatInput,
  type RepositoryChatResponse,
  type RendererRunEvent,
  type RunSummary,
  type RunStatus,
  type StartRunInput,
  type TicketAuthoringState,
  type TicketCreateInput,
  type TicketDraft,
  type TicketEffort,
  type TicketDraftSubticket,
  type TicketDraftResearchLimits,
  type TicketDraftErrorCode,
  type TicketDraftErrorPayload,
  type TicketRecord,
  type TicketSuggestion
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
import {
  agentTicketUpdateSchema,
  draftIntakeResultSchema,
  isRelaySchemaError,
  parseSchema,
  ticketDraftSchema,
  ticketSuggestionsResponseSchema
} from "../schemas";
import { logError, logInfo, logWarn } from "../logger";
import { pathIsAbsolute, pathRelative, pathResolve } from "../io";
import {
  markKernelRunStatus,
  submitCodexImplementationJob,
  submitTicketDraftJob,
  submitTicketUpdateJob,
  KernelRunRegistry,
  runKernelRunRegistryEffect,
  type JobExecutionStatus,
  type KernelActiveRun,
  type KernelQueuedRunIntent,
  type KernelTicketUpdateBeginResult
} from "../kernel";
import { fallbackResearchFindings, renderResearchForPrompt, researchTicketDraft } from "./research";
import { resolveAvailableCodexCli, type CodexCliResolution } from "./cli";
import { getCodexStatus } from "./status";
import {
  appendCodexHandoff,
  applyTicketDraftToTicket,
  blockPendingTicketDraftForClarification,
  clearQueuedTicket,
  createClarificationQuestions,
  createPendingTicketDraft,
  failPendingTicketDraft,
  isTicketNotFoundError,
  isGitRepository,
  listQueuedReadyTickets,
  newId,
  readClarificationQuestions,
  readBoard,
  readProjectConfig,
  readTicket,
  setTicketQueued,
  ticketMarkdownFromDraft,
  ticketMarkdownFromSubticketDraft,
  transitionTicketStatus,
  writeTicket
} from "../storage";

export { getCodexStatus } from "./status";
export { DEFAULT_TICKET_DRAFT_RESEARCH_LIMITS, extractTicketDraftUrls, researchTicketDraft } from "./research";

type QueuedRunIntent = Omit<KernelQueuedRunIntent, "dependencies"> & {
  dependencies: CodexRunDependencies;
};

const IMPLEMENTATION_WORKER_CONCURRENCY = 1;

const nowIso = (): string => new Date().toISOString();

const markKernelRunStatusSafely = async (
  projectPath: string,
  runId: string,
  status: JobExecutionStatus,
  options?: Parameters<typeof markKernelRunStatus>[3]
): Promise<void> => {
  try {
    await markKernelRunStatus(projectPath, runId, status, options);
  } catch (error) {
    await logWarn("kernel", "failed to update kernel run status", {
      projectPath,
      runId,
      status,
      error: errorMessage(error, "Kernel status update failed.")
    });
  }
};

type DraftScopeProfile = {
  label: string;
  maxQuestions: number;
  guidance: string;
  sectionBudget: number;
  researchLimits: Partial<TicketDraftResearchLimits>;
};

const DRAFT_SCOPE_PROFILES: Record<DraftScope, DraftScopeProfile> = {
  quick_bug: {
    label: "Quick bug fix",
    maxQuestions: 2,
    guidance: "Optimize for speed. Produce a short bug-shaped ticket with the reproduction clue, expected behavior, fix target, and focused regression test.",
    sectionBudget: 3,
    researchLimits: {
      maxResearchMs: 3_000,
      maxUrls: 1,
      maxUrlFetchMs: 1_500,
      maxUrlContentChars: 3_000,
      maxFilesToScan: 60,
      maxFilesToRead: 2,
      maxFileReadChars: 5_000,
      maxMatchesPerFile: 2
    }
  },
  task: {
    label: "Task",
    maxQuestions: 3,
    guidance: "Produce a normal implementation ticket with concise requirements, concrete affected areas, and focused validation.",
    sectionBudget: 5,
    researchLimits: {
      maxResearchMs: 5_000,
      maxUrls: 1,
      maxUrlFetchMs: 2_000,
      maxUrlContentChars: 4_000,
      maxFilesToScan: 90,
      maxFilesToRead: 3,
      maxFileReadChars: 7_000,
      maxMatchesPerFile: 2
    }
  },
  product_feature: {
    label: "Product feature",
    maxQuestions: 5,
    guidance: "Produce a lean PRD-like feature ticket with user-visible behavior, product decisions, acceptance criteria, and implementation notes.",
    sectionBudget: 6,
    researchLimits: {
      maxResearchMs: 7_000,
      maxUrls: 2,
      maxUrlFetchMs: 3_000,
      maxUrlContentChars: 6_000,
      maxFilesToScan: 120,
      maxFilesToRead: 4,
      maxFileReadChars: 9_000,
      maxMatchesPerFile: 3
    }
  },
  rewrite: {
    label: "Rewrite/refactor",
    maxQuestions: 6,
    guidance: "Produce a rewrite/refactor ticket that calls out migration strategy, compatibility risks, and validation boundaries without becoming exhaustive.",
    sectionBudget: 7,
    researchLimits: {
      maxResearchMs: 8_000,
      maxUrls: 2,
      maxUrlFetchMs: 3_000,
      maxUrlContentChars: 6_000,
      maxFilesToScan: 140,
      maxFilesToRead: 5,
      maxFileReadChars: 10_000,
      maxMatchesPerFile: 3
    }
  },
  epic: {
    label: "Epic",
    maxQuestions: 8,
    guidance: "Produce a parent planning ticket plus independently implementable vertical-slice child tasks. Keep detail in the child tickets.",
    sectionBudget: 6,
    researchLimits: {
      maxResearchMs: 9_000,
      maxUrls: 2,
      maxUrlFetchMs: 3_000,
      maxUrlContentChars: 6_000,
      maxFilesToScan: 160,
      maxFilesToRead: 6,
      maxFileReadChars: 12_000,
      maxMatchesPerFile: 3
    }
  }
};

const defaultDraftScopeForInput = (input: Pick<CreateDraftInput, "draftScope" | "preferredTicketType">): DraftScope =>
  input.draftScope ?? (input.preferredTicketType === "epic" ? "epic" : "task");

const registry = <A>(
  effect: Effect.Effect<A, unknown, Context.Service.Identifier<typeof KernelRunRegistry>>
): Promise<A> => runKernelRunRegistryEffect(effect);

const activeRunIdForTicket = (projectPath: string, ticketId: string): Promise<string | null> =>
  registry(KernelRunRegistry.use((runRegistry) => runRegistry.activeRunIdForTicket(projectPath, ticketId)));

const activeImplementationRunCountForProject = (projectPath: string): Promise<number> =>
  registry(KernelRunRegistry.use((runRegistry) => runRegistry.activeImplementationRunCount(projectPath)));

const enqueueImplementationRun = (runId: string, intent: QueuedRunIntent): Promise<void> =>
  registry(KernelRunRegistry.use((runRegistry) => runRegistry.enqueueImplementation(runId, intent)));

const getQueuedImplementationRun = async (runId: string): Promise<QueuedRunIntent | null> => {
  const intent = await registry(KernelRunRegistry.use((runRegistry) => runRegistry.getQueuedImplementation(runId)));
  return intent ? ({ ...intent, dependencies: intent.dependencies as CodexRunDependencies } satisfies QueuedRunIntent) : null;
};

const removeQueuedImplementationRun = async (runId: string): Promise<QueuedRunIntent | null> => {
  const intent = await registry(KernelRunRegistry.use((runRegistry) => runRegistry.removeQueuedImplementation(runId)));
  return intent ? ({ ...intent, dependencies: intent.dependencies as CodexRunDependencies } satisfies QueuedRunIntent) : null;
};

const markImplementationStarting = (runId: string, runRef: { projectPath: string; ticketId: string }): Promise<void> =>
  registry(KernelRunRegistry.use((runRegistry) => runRegistry.markImplementationStarting(runId, runRef)));

const implementationActiveOrStarting = (runId: string): Promise<boolean> =>
  registry(KernelRunRegistry.use((runRegistry) => runRegistry.isImplementationActiveOrStarting(runId)));

const registerImplementationActive = (runId: string, activeRun: KernelActiveRun): Promise<void> =>
  registry(KernelRunRegistry.use((runRegistry) => runRegistry.registerImplementationActive(runId, activeRun)));

const getActiveImplementationRun = (runId: string): Promise<KernelActiveRun | null> =>
  registry(KernelRunRegistry.use((runRegistry) => runRegistry.getActiveImplementation(runId)));

const completeImplementationRun = (runId: string): Promise<void> =>
  registry(KernelRunRegistry.use((runRegistry) => runRegistry.completeImplementation(runId)));

const registerDraftRun = (runId: string, activeRun: KernelActiveRun): Promise<void> =>
  registry(KernelRunRegistry.use((runRegistry) => runRegistry.registerDraft(runId, activeRun)));

const getDraftRun = (runId: string): Promise<KernelActiveRun | null> =>
  registry(KernelRunRegistry.use((runRegistry) => runRegistry.getDraft(runId)));

const completeDraftRun = (runId: string): Promise<void> =>
  registry(KernelRunRegistry.use((runRegistry) => runRegistry.completeDraft(runId)));

const beginTicketUpdateRun = (
  runId: string,
  ticketKey: string,
  activeRun: KernelActiveRun
): Promise<KernelTicketUpdateBeginResult> =>
  registry(KernelRunRegistry.use((runRegistry) => runRegistry.beginTicketUpdate(runId, ticketKey, activeRun)));

const getTicketUpdateRun = (runId: string): Promise<KernelActiveRun | null> =>
  registry(KernelRunRegistry.use((runRegistry) => runRegistry.getTicketUpdate(runId)));

const completeTicketUpdateRun = (runId: string): Promise<void> =>
  registry(KernelRunRegistry.use((runRegistry) => runRegistry.completeTicketUpdate(runId)));

const schedulerRetryPolicy = Schedule.addDelay(Schedule.recurs(2), () => Effect.succeed("25 millis"));

const ensureProjectSchedulerLoop = async (projectPath: string): Promise<void> => {
  const resolvedProjectPath = pathResolve(projectPath);
  const claimed = await registry(KernelRunRegistry.use((runRegistry) => runRegistry.claimProjectSchedulerLoop(resolvedProjectPath)));
  if (!claimed) return;

  void (async () => {
    for (;;) {
      await registry(KernelRunRegistry.use((runRegistry) => runRegistry.takeProjectSchedulerWake(resolvedProjectPath)));
      try {
        await runBackendEffect(Effect.retry(fromPromise(() => drainProjectScheduler(resolvedProjectPath)), schedulerRetryPolicy));
      } catch (error) {
        await logError("codex:scheduler", "queue drain failed", error, { projectPath: resolvedProjectPath });
      }
    }
  })().catch((error) => {
    void registry(KernelRunRegistry.use((runRegistry) => runRegistry.releaseProjectSchedulerLoop(resolvedProjectPath)));
    void logError("codex:scheduler", "scheduler loop stopped", error, { projectPath: resolvedProjectPath });
  });
};

const wakeProjectScheduler = async (projectPath: string): Promise<void> => {
  const resolvedProjectPath = pathResolve(projectPath);
  await ensureProjectSchedulerLoop(resolvedProjectPath);
  await registry(KernelRunRegistry.use((runRegistry) => runRegistry.wakeProjectScheduler(resolvedProjectPath)));
};

const wakeProjectSchedulerSoon = (projectPath: string): void => {
  void wakeProjectScheduler(projectPath).catch((error) =>
    logError("codex:scheduler", "failed to wake queue", error, { projectPath })
  );
};

const drainProjectScheduler = async (projectPath: string): Promise<void> => {
  while ((await activeImplementationRunCountForProject(projectPath)) < IMPLEMENTATION_WORKER_CONCURRENCY) {
    let next: Awaited<ReturnType<typeof listQueuedReadyTickets>>[number] | undefined;
    for (const ticket of await listQueuedReadyTickets(projectPath)) {
      const runId = ticket.lastRunId;
      if (runId && !(await implementationActiveOrStarting(runId))) {
        next = ticket;
        break;
      }
    }
    if (!next?.lastRunId) return;

    const runId = next.lastRunId;
    const intent =
      (await getQueuedImplementationRun(runId)) ??
      ({
        input: { projectPath, ticketId: next.id },
        resume: Boolean(next.codexThreadId),
        dependencies: {}
      } satisfies QueuedRunIntent);
    await enqueueImplementationRun(runId, intent);
    await markImplementationStarting(runId, { projectPath, ticketId: next.id });
    void startQueuedRunNow(intent.input, intent.resume, runId, intent.dependencies).catch((error) =>
      logError("codex:run", "queued run failed outside stream", error, { projectPath, ticketId: next.id, runId })
    );
  }
};

const codexEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
};

export type CreateCodexDependencies = {
  resolveCodexCli?: () => Promise<CodexCliResolution | null>;
  createClient?: (options: CodexOptions) => Codex;
  createEnv?: () => Record<string, string>;
};

export const createCodex = async (dependencies: CreateCodexDependencies = {}): Promise<Codex> => {
  const cliResolution = await (dependencies.resolveCodexCli ?? resolveAvailableCodexCli)();
  if (!cliResolution) {
    throw new Error("Codex CLI was not found in the SDK bundle or on PATH.");
  }

  const options: CodexOptions = {
    codexPathOverride: cliResolution.candidate.command,
    env: (dependencies.createEnv ?? codexEnv)()
  };
  return (dependencies.createClient ?? ((codexOptions) => new Codex(codexOptions)))(options);
};

export type CodexRunInput = Input;

export type CodexRunThread = {
  id: Thread["id"];
  runStreamed: (input: CodexRunInput, turnOptions?: Parameters<Thread["runStreamed"]>[1]) => ReturnType<Thread["runStreamed"]>;
};

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

const projectThreadOptionsContext = async (projectPath: string): Promise<{
  config: Awaited<ReturnType<typeof readProjectConfig>>;
  git: boolean;
}> => {
  const [config, git] = await Promise.all([readProjectConfig(projectPath), isGitRepository(projectPath)]);
  return { config, git };
};

const ticketEffortToModelReasoningEffort = (effort: TicketEffort): NonNullable<ThreadOptions["modelReasoningEffort"]> =>
  effort === "xhigh" ? "xhigh" : effort;

const sharedThreadOptionsForProjectContext = (
  projectPath: string,
  { config, git }: Awaited<ReturnType<typeof projectThreadOptionsContext>>,
  ticketEffort?: TicketEffort
): ThreadOptions => {
  return {
    workingDirectory: projectPath,
    model: config.settings.defaultModel ?? undefined,
    modelReasoningEffort: ticketEffort
      ? ticketEffortToModelReasoningEffort(ticketEffort)
      : config.settings.defaultModelReasoningEffort ?? undefined,
    approvalPolicy: config.settings.defaultApprovalPolicy,
    sandboxMode: config.settings.defaultSandboxMode,
    skipGitRepoCheck: config.settings.allowNonGitCodexRuns || !git,
    additionalDirectories: [...config.settings.codexAdditionalDirectories]
  };
};

const boundedThreadOptionsForProject = async (projectPath: string, ticketEffort?: TicketEffort): Promise<ThreadOptions> => ({
  ...sharedThreadOptionsForProjectContext(projectPath, await projectThreadOptionsContext(projectPath), ticketEffort),
  networkAccessEnabled: false,
  webSearchMode: "disabled"
});

const implementationThreadOptionsForProject = async (projectPath: string, ticketEffort?: TicketEffort): Promise<ThreadOptions> => {
  const context = await projectThreadOptionsContext(projectPath);
  return {
    ...sharedThreadOptionsForProjectContext(projectPath, context, ticketEffort),
    networkAccessEnabled: context.config.settings.codexNetworkAccessEnabled,
    webSearchMode: context.config.settings.codexWebSearchMode
  };
};

const ticketUpdateThreadOptionsForProject = async (projectPath: string): Promise<ThreadOptions> => ({
  ...(await boundedThreadOptionsForProject(projectPath)),
  approvalPolicy: "never",
  sandboxMode: "read-only",
  networkAccessEnabled: false,
  webSearchMode: "disabled"
});

const repositoryChatThreadOptionsForProject = async (projectPath: string): Promise<ThreadOptions> => ({
  ...(await boundedThreadOptionsForProject(projectPath)),
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

const draftScopeSchemaJson = {
  type: "string",
  enum: ["quick_bug", "task", "product_feature", "rewrite", "epic"]
} as const;

const draftIntakeQuestionSchemaJson = {
  type: "object",
  additionalProperties: false,
  required: ["question", "whyItMatters", "recommendedAnswer"],
  properties: {
    question: { type: "string" },
    whyItMatters: { type: "string" },
    recommendedAnswer: { type: "string" }
  }
} as const;

const draftIntakeResultSchemaJson = {
  type: "object",
  additionalProperties: false,
  required: ["scope", "confidence", "knownFacts", "relatedTicketIds", "questions"],
  properties: {
    scope: draftScopeSchemaJson,
    confidence: { type: "number" },
    knownFacts: { type: "array", items: { type: "string" } },
    relatedTicketIds: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: draftIntakeQuestionSchemaJson }
  }
} as const;

const agentTicketUpdateSchemaJson = {
  type: "object",
  additionalProperties: false,
  required: ["title", "priority", "labels", "authoringState", "patch", "clarificationQuestions"],
  properties: {
    title: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    labels: { type: "array", items: { type: "string" } },
    authoringState: { type: "string", enum: ["rough", "reviewing", "needs_input", "ready"] },
    patch: {
      type: "object",
      additionalProperties: false,
      required: ["summary"],
      properties: {
        summary: { type: "string" },
        fullMarkdown: { type: ["string", "null"] },
        appendMarkdown: { type: ["string", "null"] }
      }
    },
    clarificationQuestions: { type: "array", items: { type: "string" } }
  }
} as const;

const ticketSuggestionSchemaJson = {
  type: "object",
  additionalProperties: false,
  required: ["title", "priority", "labels", "rationale", "request"],
  properties: {
    title: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    labels: { type: "array", items: { type: "string" } },
    rationale: { type: "string" },
    request: { type: "string" }
  }
} as const;

const ticketSuggestionsResponseSchemaJson = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: {
      type: "array",
      maxItems: 10,
      items: ticketSuggestionSchemaJson
    }
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
type RepositoryChatTimeoutHandle = ReturnType<typeof setTimeout>;

const DEFAULT_REPOSITORY_CHAT_TIMEOUT_MS = 120_000;

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

export type TicketSuggestionDependencies = {
  getStatus?: () => Promise<CodexStatus>;
  createCodexClient?: () => TicketDraftCodexClient;
  createRequestId?: () => string;
  nowMs?: () => number;
  abortController?: AbortController;
};

export type RepositoryChatThread = Pick<Thread, "run"> & Partial<Pick<Thread, "id">>;

export type RepositoryChatCodexClient = {
  startThread: (options: ThreadOptions) => RepositoryChatThread;
  resumeThread: (threadId: string, options: ThreadOptions) => RepositoryChatThread;
};

export type RepositoryChatDependencies = {
  getStatus?: () => Promise<CodexStatus>;
  createCodexClient?: () => RepositoryChatCodexClient;
  createRequestId?: () => string;
  nowMs?: () => number;
  abortController?: AbortController;
  chatTimeoutMs?: number;
  setTimeoutFn?: (callback: () => void, ms: number) => RepositoryChatTimeoutHandle;
  clearTimeoutFn?: (handle: RepositoryChatTimeoutHandle) => void;
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
      "Agent ticket drafting was cancelled. Your rough idea is still available.",
      "codex_generation_cancelled",
      { cause: error }
    );
  }
  if (isRelaySchemaError(error) || error instanceof SyntaxError || errorMessage(error, "").includes("valid JSON")) {
    return ticketDraftError(
      "invalid_response",
      context.requestId,
      context.durationMs,
      "The agent returned an invalid ticket draft. Your rough idea is still available; retry the agent when ready.",
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

const normalizeTicketSuggestionError = (
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
      "Agent ticket suggestion generation was cancelled.",
      "codex_suggestion_generation_cancelled",
      { cause: error }
    );
  }
  if (isRelaySchemaError(error) || error instanceof SyntaxError || errorMessage(error, "").includes("valid JSON")) {
    return ticketDraftError(
      "invalid_response",
      context.requestId,
      context.durationMs,
      "The agent returned invalid ticket suggestions. Retry generation when ready.",
      "invalid_codex_suggestion_response",
      { cause: error }
    );
  }
  return ticketDraftError(
    "backend_failure",
    context.requestId,
    context.durationMs,
    errorMessage(error, "Ticket suggestion generation failed."),
    "codex_suggestion_backend_failure",
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

const applyDraftSectionBudget = (draft: TicketDraftSubticket, scope: DraftScope): TicketDraftSubticket => {
  const budget = DRAFT_SCOPE_PROFILES[scope].sectionBudget;
  return {
    ...draft,
    researchFindings: (draft.researchFindings ?? []).slice(0, budget),
    requirements: (draft.requirements ?? []).slice(0, budget),
    implementationPlan: (draft.implementationPlan ?? []).slice(0, budget),
    testPlan: (draft.testPlan ?? []).slice(0, Math.max(2, Math.min(budget, 5))),
    acceptanceCriteria: (draft.acceptanceCriteria ?? []).slice(0, budget),
    clarificationQuestions: (draft.clarificationQuestions ?? []).slice(0, Math.min(3, budget)),
    assumptions: (draft.assumptions ?? []).slice(0, Math.min(4, budget)),
    implementationNotes: (draft.implementationNotes ?? []).slice(0, budget)
  };
};

const normalizeTicketDraftOutcome = (
  parsedDraft: TicketDraft,
  research: Awaited<ReturnType<typeof researchTicketDraft>>,
  scope: DraftScope
): TicketDraftOutcome => {
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
  const budgetedBase = applyDraftSectionBudget(
    {
      ...normalizedBase,
      researchFindings:
        researchFindings.length > 0
          ? researchFindings
          : ["No matching source files or URLs were identified during bounded draft research."],
      implementationPlan,
      testPlan,
      clarificationQuestions: parsedDraft.draftState === "needs_clarification" ? [] : readyQuestions
    },
    scope
  );
  const draft: TicketDraft = {
    ...parsedDraft,
    ...budgetedBase,
    draftState: parsedDraft.draftState ?? "ready",
    blockingClarificationQuestions: blockingQuestions,
    assumptions: budgetedBase.assumptions,
    implementationNotes: budgetedBase.implementationNotes,
    subtickets: parsedDraft.subtickets.map((subticket) => {
      const normalizedSubticket = normalizeSubticketDraft(subticket);
      return applyDraftSectionBudget({
        ...normalizedSubticket,
        testPlan: normalizedSubticket.testPlan && normalizedSubticket.testPlan.length > 0 ? normalizedSubticket.testPlan : fallbackTestPlan()
      }, scope);
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

const TICKET_SUGGESTION_LIMIT = 10;

const truncatePromptText = (value: string, maxLength: number): string => {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const normalizeSuggestionLabels = (labels: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const label of labels) {
    const next = normalizeWhitespace(label);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    normalized.push(next);
  }
  return normalized;
};

const normalizeTicketSuggestion = (suggestion: TicketSuggestion): TicketSuggestion => ({
  title: normalizeWhitespace(suggestion.title),
  priority: suggestion.priority,
  labels: normalizeSuggestionLabels(suggestion.labels),
  rationale: normalizeWhitespace(suggestion.rationale) || "Suggested after reviewing the local project and current board.",
  request: normalizeWhitespace(suggestion.request)
});

const normalizeTicketSuggestions = (suggestions: TicketSuggestion[]): TicketSuggestion[] =>
  suggestions
    .map(normalizeTicketSuggestion)
    .filter((suggestion) => suggestion.title.length > 0 && suggestion.request.length > 0)
    .slice(0, TICKET_SUGGESTION_LIMIT);

const formatBoardTicketsForSuggestionPrompt = (board: Awaited<ReturnType<typeof readBoard>>): string => {
  if (board.tickets.length === 0) return "No existing tickets are on the board.";

  const columnNameById = new Map(board.columns.map((column) => [column.id, column.name]));
  const orderedTickets = [...board.tickets].sort((left, right) => {
    const leftColumn = board.columns.findIndex((column) => column.id === left.status);
    const rightColumn = board.columns.findIndex((column) => column.id === right.status);
    const leftColumnIndex = leftColumn === -1 ? Number.MAX_SAFE_INTEGER : leftColumn;
    const rightColumnIndex = rightColumn === -1 ? Number.MAX_SAFE_INTEGER : rightColumn;
    return leftColumnIndex - rightColumnIndex || left.position - right.position || left.title.localeCompare(right.title);
  });

  return orderedTickets
    .map((ticket) => {
      const labels = ticket.labels.length > 0 ? ticket.labels.join(", ") : "none";
      const excerpt = truncatePromptText(ticket.excerpt, 240) || "No excerpt.";
      const status = columnNameById.get(ticket.status) ?? ticket.status;
      return `- ${ticket.id}: "${truncatePromptText(ticket.title, 120)}" | status: ${status} | priority: ${ticket.priority} | type: ${ticket.ticketType} | labels: ${labels} | excerpt: ${excerpt}`;
    })
    .join("\n");
};

const formatRelatedTicketsForPrompt = (board: Awaited<ReturnType<typeof readBoard>>, relatedTicketIds: readonly string[] | undefined): string => {
  const ids = new Set((relatedTicketIds ?? []).map((id) => id.trim()).filter(Boolean));
  if (ids.size === 0) return "No related tickets were selected by intake.";
  const columnNameById = new Map(board.columns.map((column) => [column.id, column.name]));
  const related = board.tickets.filter((ticket) => ids.has(ticket.id));
  if (related.length === 0) return "No related tickets matched the current board.";
  return related
    .map((ticket) => {
      const labels = ticket.labels.length > 0 ? ticket.labels.join(", ") : "none";
      const status = columnNameById.get(ticket.status) ?? ticket.status;
      return `- ${ticket.id}: "${truncatePromptText(ticket.title, 120)}" | status: ${status} | type: ${ticket.ticketType} | labels: ${labels} | excerpt: ${
        truncatePromptText(ticket.excerpt, 260) || "No excerpt."
      }`;
    })
    .join("\n");
};

const formatStringListForPrompt = (items: readonly string[] | undefined): string => {
  const cleaned = cleanStringList(items);
  return cleaned.length > 0 ? cleaned.map((item) => `- ${item}`).join("\n") : "- None.";
};

const formatDraftIntakeAnswersForPrompt = (answers: readonly DraftIntakeAnswer[] | undefined): string => {
  const cleaned = (answers ?? [])
    .map((answer) => ({
      question: normalizeWhitespace(answer.question),
      answer: normalizeWhitespace(answer.answer),
      recommendedAnswer: answer.recommendedAnswer ? normalizeWhitespace(answer.recommendedAnswer) : "",
      whyItMatters: answer.whyItMatters ? normalizeWhitespace(answer.whyItMatters) : ""
    }))
    .filter((answer) => answer.question && answer.answer);
  if (cleaned.length === 0) return "No intake questions were answered.";
  return cleaned
    .map((answer) => {
      const reason = answer.whyItMatters ? `\n  Why it mattered: ${answer.whyItMatters}` : "";
      const recommendation = answer.recommendedAnswer ? `\n  Recommended default: ${answer.recommendedAnswer}` : "";
      return `- Question: ${answer.question}${reason}${recommendation}\n  User answer: ${answer.answer}`;
    })
    .join("\n");
};

const hasUserSuppliedIntakeContext = (input: CreateDraftInput): boolean =>
  Boolean(input.intakeAnswers?.length || input.intakeKnownFacts?.length || input.relatedTicketIds?.length);

const draftIntakeScopeOverrideForCreateInput = (input: CreateDraftInput): DraftScope | undefined =>
  input.draftScope ?? (input.preferredTicketType === "epic" ? "epic" : undefined);

const preferredTicketTypeForDraftScope = (
  scope: DraftScope,
  fallback: CreateDraftInput["preferredTicketType"]
): CreateDraftInput["preferredTicketType"] => (scope === "epic" ? "epic" : fallback === "epic" ? "task" : fallback);

const draftIntakeQuestionToClarification = (question: DraftIntakeQuestion): string =>
  `${question.question}

Why it matters: ${question.whyItMatters}
Recommended answer: ${question.recommendedAnswer}`;

const normalizeDraftIntakeResult = (
  parsed: DraftIntakeResult,
  board: Awaited<ReturnType<typeof readBoard>>,
  scopeOverride?: DraftScope
): DraftIntakeResult => {
  const scope = scopeOverride ?? parsed.scope;
  const profile = DRAFT_SCOPE_PROFILES[scope];
  const ticketIds = new Set(board.tickets.map((ticket) => ticket.id));
  const relatedTicketIds = cleanStringList(parsed.relatedTicketIds).filter((ticketId) => ticketIds.has(ticketId)).slice(0, 8);
  const knownFacts = cleanStringList(parsed.knownFacts).slice(0, 8);
  const questions: DraftIntakeQuestion[] = [];
  const seenQuestions = new Set<string>();

  for (const question of parsed.questions) {
    const normalizedQuestion = normalizeWhitespace(question.question);
    const whyItMatters = normalizeWhitespace(question.whyItMatters);
    const recommendedAnswer = normalizeWhitespace(question.recommendedAnswer);
    const questionKey = normalizedQuestion.toLowerCase();
    if (!normalizedQuestion || !whyItMatters || !recommendedAnswer || seenQuestions.has(questionKey)) continue;
    seenQuestions.add(questionKey);
    questions.push({ question: normalizedQuestion, whyItMatters, recommendedAnswer });
    if (questions.length >= profile.maxQuestions) break;
  }

  return {
    scope,
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
    knownFacts,
    relatedTicketIds,
    questions
  };
};

const buildDraftIntakePrompt = (
  input: DraftIntakeInput,
  board: Awaited<ReturnType<typeof readBoard>>,
  research: Awaited<ReturnType<typeof researchTicketDraft>>
): string => {
  const scopeOverride = input.scopeOverride;
  const scopeRules = Object.entries(DRAFT_SCOPE_PROFILES)
    .map(([scope, profile]) => `- ${scope}: ${profile.label}; max ${profile.maxQuestions} blocking question(s). ${profile.guidance}`)
    .join("\n");
  const overrideGuidance = scopeOverride
    ? `The user selected scopeOverride "${scopeOverride}". You must return scope "${scopeOverride}".`
    : "Classify the request into the most appropriate scope.";

  return `You are doing a fast intake pass before Relay drafts an implementation ticket.

Goal: decide how much ticket-drafting depth is needed and ask only blocking questions before the expensive full draft starts.

${overrideGuidance}

Scope profiles:
${scopeRules}

Question rules:
- Ask only questions that block an implementation-ready ticket.
- Do not ask questions answerable from local codebase files, current board tickets, linked ticket references, or the research context.
- Do not ask questions where a conservative default is acceptable; choose the default and put it in knownFacts.
- Every question must include whyItMatters and a recommendedAnswer the user can accept or edit.
- Prefer zero questions for quick bugs and small tasks when the codebase and idea give enough direction.
- Never ask the implementation agent to research the basics later; intake must separate blockers from facts.

Return only data matching the requested schema.

Project path: ${input.projectPath}
Current board tickets:
${formatBoardTicketsForSuggestionPrompt(board)}

Research context:
${renderResearchForPrompt(research)}

User idea:
${input.idea}`;
};

export const createDraftIntake = async (
  input: DraftIntakeInput,
  dependencies: TicketDraftDependencies = {}
): Promise<DraftIntakeResult> => {
  const projectPath = pathResolve(input.projectPath);
  const idea = input.idea.trim();
  if (!idea) throw new Error("Describe the ticket idea before drafting with the agent.");

  const requestId = dependencies.createRequestId?.() ?? newId("din");
  const startedAt = dependencies.nowMs?.() ?? Date.now();
  const nowMs = dependencies.nowMs ?? Date.now;
  const durationMs = (): number => Math.max(0, nowMs() - startedAt);
  const scopeForResearch = input.scopeOverride ?? "task";
  const profile = DRAFT_SCOPE_PROFILES[scopeForResearch];
  const abortController = dependencies.abortController ?? new AbortController();
  const logBase = { requestId, projectPath, ideaLength: idea.length, scopeOverride: input.scopeOverride ?? null };

  await logInfo("codex:draft-intake", "starting draft intake", logBase);
  try {
    const status = await (dependencies.getStatus ?? getCodexStatus)();
    if (!status.cliAvailable) {
      throw ticketDraftError(
        "codex_unavailable",
        requestId,
        durationMs(),
        "Codex CLI was not found in the SDK bundle or on PATH. Install or expose Codex before drafting tickets.",
        "codex_cli_unavailable"
      );
    }
    if (status.authenticated === false) {
      throw ticketDraftError(
        "codex_unauthenticated",
        requestId,
        durationMs(),
        "Codex is not authenticated. Run `codex login` in your terminal, then try drafting again.",
        "codex_auth_unavailable"
      );
    }

    const [config, board, research] = await Promise.all([
      readProjectConfig(projectPath),
      readBoard(projectPath),
      researchTicketDraft(
        {
          projectPath,
          idea,
          preferredTicketType: input.scopeOverride === "epic" ? "epic" : "task"
        },
        {
          ...dependencies,
          researchLimits: {
            ...profile.researchLimits,
            ...(dependencies.researchLimits ?? {})
          }
        }
      )
    ]);
    const codex = dependencies.createCodexClient?.() ?? (await createCodex());
    const thread = codex.startThread(await boundedThreadOptionsForProject(projectPath, input.effort ?? config.settings.defaultTicketEffort));
    const prompt = buildDraftIntakePrompt({ ...input, projectPath, idea }, board, research);
    const turn = await thread.run(prompt, { outputSchema: draftIntakeResultSchemaJson, signal: abortController.signal });
    const parsed = parseSchema(draftIntakeResultSchema, parseJsonResponse(turn.finalResponse));
    const intake = normalizeDraftIntakeResult(parsed, board, input.scopeOverride);
    await logInfo("codex:draft-intake", "draft intake completed", {
      ...logBase,
      durationMs: durationMs(),
      scope: intake.scope,
      questionCount: intake.questions.length,
      relatedTicketCount: intake.relatedTicketIds.length
    });
    return intake;
  } catch (error) {
    const intakeError = normalizeTicketDraftError(error, {
      requestId,
      durationMs: durationMs(),
      signalAborted: abortController.signal.aborted
    });
    await logError("codex:draft-intake", "draft intake failed", intakeError, { ...logBase, ...intakeError.toPayload() });
    throw intakeError;
  }
};

const buildRepositoryChatPrompt = (
  input: RepositoryChatInput,
  config: Awaited<ReturnType<typeof readProjectConfig>>,
  board: Awaited<ReturnType<typeof readBoard>>,
  message: string
): string => `You are Codex answering a quick read-only repository question inside Relay.

Answer concisely and directly for the selected local project.

Rules:
- Do not create, edit, move, rename, or delete files.
- Do not create, edit, move, rename, or delete Relay tickets or board cards.
- Do not start implementation work, run ticket workflows, write logs, or emit Relay run events.
- Network access and web search are disabled; rely on local repository files plus the board context below.
- If the answer cannot be determined from the repository and board context, say what information is missing.

Project path: ${input.projectPath}
Project name: ${config.name}
Workflow columns: ${config.columns.map((column) => column.name).join(", ")}

Current board tickets:
${formatBoardTicketsForSuggestionPrompt(board)}

User question:
${message}`;

const runRepositoryChatTurn = async <T>(
  runPromise: Promise<T>,
  abortController: AbortController,
  options: {
    timeoutMs: number;
    setTimeoutFn: (callback: () => void, ms: number) => RepositoryChatTimeoutHandle;
    clearTimeoutFn: (handle: RepositoryChatTimeoutHandle) => void;
  }
): Promise<T> => {
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    return runPromise;
  }

  let timeoutHandle: RepositoryChatTimeoutHandle | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = options.setTimeoutFn(() => {
      const timeoutDescription =
        options.timeoutMs >= 1000 ? `${Math.round(options.timeoutMs / 1000)} seconds` : `${options.timeoutMs}ms`;
      abortController.abort();
      reject(new Error(`Repository chat timed out after ${timeoutDescription}.`));
    }, options.timeoutMs);
  });

  try {
    return await Promise.race([runPromise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      options.clearTimeoutFn(timeoutHandle);
    }
    runPromise.catch(() => undefined);
  }
};

export const sendRepositoryChatMessage = async (
  input: RepositoryChatInput,
  dependencies: RepositoryChatDependencies = {}
): Promise<RepositoryChatResponse> => {
  const requestId = dependencies.createRequestId?.() ?? newId("rch");
  const startedAt = dependencies.nowMs?.() ?? Date.now();
  const nowMs = dependencies.nowMs ?? Date.now;
  const durationMs = (): number => Math.max(0, nowMs() - startedAt);
  const abortController = dependencies.abortController ?? new AbortController();
  const chatTimeoutMs = dependencies.chatTimeoutMs ?? DEFAULT_REPOSITORY_CHAT_TIMEOUT_MS;
  const setTimeoutFn = dependencies.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = dependencies.clearTimeoutFn ?? clearTimeout;
  const message = normalizeWhitespace(input.message);
  const threadId = input.threadId?.trim() || null;
  const logBase = { requestId, projectPath: input.projectPath, hasThreadId: Boolean(threadId) };

  if (!message) {
    throw new Error("Enter a repository question before sending.");
  }

  await logInfo("codex:repository-chat", "starting repository chat turn", logBase);

  try {
    const status = await (dependencies.getStatus ?? getCodexStatus)();
    if (!status.cliAvailable) {
      await logWarn("codex:repository-chat", "codex cli unavailable", { ...logBase, durationMs: durationMs(), status });
      throw new Error("Codex CLI was not found in the SDK bundle or on PATH. Install or expose Codex before using repository chat.");
    }
    if (status.authenticated === false) {
      await logWarn("codex:repository-chat", "codex auth unavailable", { ...logBase, durationMs: durationMs(), status });
      throw new Error("Codex is not authenticated. Run `codex login` in your terminal, then try repository chat again.");
    }

    const [config, board, options] = await Promise.all([
      readProjectConfig(input.projectPath),
      readBoard(input.projectPath),
      repositoryChatThreadOptionsForProject(input.projectPath)
    ]);
    const codex = dependencies.createCodexClient?.() ?? (await createCodex());
    const thread = threadId ? codex.resumeThread(threadId, options) : codex.startThread(options);
    const prompt = buildRepositoryChatPrompt(input, config, board, message);
    const turn = await runRepositoryChatTurn(thread.run(prompt, { signal: abortController.signal }), abortController, {
      timeoutMs: chatTimeoutMs,
      setTimeoutFn,
      clearTimeoutFn
    });
    const responseMessage = turn.finalResponse.trim();
    const responseThreadId = thread.id ?? threadId;

    if (!responseThreadId) {
      throw new Error("Codex did not return a repository chat thread id.");
    }
    if (!responseMessage) {
      throw new Error("Codex did not return an answer.");
    }

    await logInfo("codex:repository-chat", "repository chat turn completed", {
      ...logBase,
      durationMs: durationMs(),
      threadId: responseThreadId
    });

    return {
      threadId: responseThreadId,
      message: responseMessage
    };
  } catch (error) {
    await logError("codex:repository-chat", "repository chat turn failed", error, {
      ...logBase,
      durationMs: durationMs()
    });
    throw error;
  }
};

export const generateTicketSuggestions = async (
  projectPath: string,
  dependencies: TicketSuggestionDependencies = {}
): Promise<TicketSuggestion[]> => {
  const requestId = dependencies.createRequestId?.() ?? newId("tsg");
  const startedAt = dependencies.nowMs?.() ?? Date.now();
  const nowMs = dependencies.nowMs ?? Date.now;
  const durationMs = (): number => Math.max(0, nowMs() - startedAt);
  const abortController = dependencies.abortController ?? new AbortController();
  const logBase = { requestId, projectPath };

  await logInfo("codex:suggestions", "starting ticket suggestion generation", logBase);

  try {
    const status = await (dependencies.getStatus ?? getCodexStatus)();
    if (!status.cliAvailable) {
      await logWarn("codex:suggestions", "codex cli unavailable", { ...logBase, durationMs: durationMs(), status });
      throw ticketDraftError(
        "codex_unavailable",
        requestId,
        durationMs(),
        "Codex CLI was not found in the SDK bundle or on PATH. Install or expose Codex before generating ticket suggestions.",
        "codex_cli_unavailable"
      );
    }
    if (status.authenticated === false) {
      await logWarn("codex:suggestions", "codex auth unavailable", { ...logBase, durationMs: durationMs(), status });
      throw ticketDraftError(
        "codex_unauthenticated",
        requestId,
        durationMs(),
        "Codex is not authenticated. Run `codex login` in your terminal, then try generating ticket suggestions again.",
        "codex_auth_unavailable"
      );
    }

    const [config, board] = await Promise.all([readProjectConfig(projectPath), readBoard(projectPath)]);
    const codex = dependencies.createCodexClient?.() ?? (await createCodex());
    const thread = codex.startThread(await ticketUpdateThreadOptionsForProject(projectPath));
    const prompt = `You are helping Relay suggest project tickets for a local software project.

Review the local project in read-only mode and propose up to ${TICKET_SUGGESTION_LIMIT} task-sized ticket ideas that a coding agent could turn into implementation-ready drafts.

Rules:
- Do not create, edit, move, rename, or delete tickets or project files.
- Do not implement any suggestion.
- Network access and web search are disabled; rely on local files plus the board context below.
- Avoid obvious duplicates of existing board tickets.
- Prefer concrete, scoped tasks over vague cleanup or broad epics.
- Each suggestion request should be concise because it will be passed directly to Relay's existing createDraft flow with preferredTicketType "task".

Return only data matching the requested schema. Use:
- title: concise ticket title.
- priority: one of low, medium, high, urgent.
- labels: short project-relevant labels.
- rationale: one short reason this is worth drafting now.
- request: a short rough idea string suitable for createDraft.

Project path: ${projectPath}
Project name: ${config.name}
Current board columns: ${config.columns.map((column) => column.name).join(", ")}

Current board tickets:
${formatBoardTicketsForSuggestionPrompt(board)}`;

    const turn = await thread.run(prompt, { outputSchema: ticketSuggestionsResponseSchemaJson, signal: abortController.signal });
    const parsed = parseSchema(ticketSuggestionsResponseSchema, parseJsonResponse(turn.finalResponse));
    const suggestions = normalizeTicketSuggestions(parsed.suggestions);
    await logInfo("codex:suggestions", "ticket suggestion generation completed", {
      ...logBase,
      durationMs: durationMs(),
      suggestionCount: suggestions.length
    });
    return suggestions;
  } catch (error) {
    const suggestionError = normalizeTicketSuggestionError(error, {
      requestId,
      durationMs: durationMs(),
      signalAborted: abortController.signal.aborted
    });
    const failureMeta = { ...logBase, ...suggestionError.toPayload() };
    if (suggestionError.code === "timeout" || suggestionError.code === "cancelled") {
      await logWarn("codex:suggestions", "ticket suggestion generation did not complete", failureMeta);
    } else {
      await logError("codex:suggestions", "ticket suggestion generation failed", suggestionError, failureMeta);
    }
    throw suggestionError;
  }
};

const createTicketDraftPromise = async (
  { projectPath, idea, effort, preferredTicketType, ticketId, draftScope, intakeAnswers, intakeKnownFacts, relatedTicketIds }: CreateDraftInput,
  dependencies: TicketDraftDependencies = {}
): Promise<TicketDraftOutcome> => {
  const requestId = dependencies.createRequestId?.() ?? newId("tdr");
  const startedAt = dependencies.nowMs?.() ?? Date.now();
  const nowMs = dependencies.nowMs ?? Date.now;
  const durationMs = (): number => Math.max(0, nowMs() - startedAt);
  const abortController = dependencies.abortController ?? new AbortController();
  const scope = defaultDraftScopeForInput({ draftScope, preferredTicketType });
  const scopeProfile = DRAFT_SCOPE_PROFILES[scope];
  let progressInterval: DraftProgressIntervalHandle | null = null;
  const logBase = { requestId, projectPath, ideaLength: idea.length, scope };

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
        "Codex CLI was not found in the SDK bundle or on PATH. Install or expose Codex before drafting tickets.",
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

    const [config, board] = await Promise.all([readProjectConfig(projectPath), readBoard(projectPath)]);
    const existingDraftTicket = ticketId ? await readTicket(projectPath, ticketId) : null;
    const effectiveEffort = existingDraftTicket?.frontMatter.effort ?? effort ?? config.settings.defaultTicketEffort;
    const draftClarifications = ticketId ? await readClarificationQuestions(projectPath, ticketId) : [];
    await reportTicketDraftProgress(dependencies, "Running bounded draft research across the project.");
    const research = await researchTicketDraft(
      { projectPath, idea, preferredTicketType, ticketId, draftScope: scope, intakeAnswers, intakeKnownFacts, relatedTicketIds },
      {
        ...dependencies,
        researchLimits: {
          ...scopeProfile.researchLimits,
          ...(dependencies.researchLimits ?? {})
        }
      }
    );
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
    const codex = dependencies.createCodexClient?.() ?? (await createCodex());
    const thread = codex.startThread(await boundedThreadOptionsForProject(projectPath, effectiveEffort));
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
    const intakeContext = `Draft scope: ${scope} (${scopeProfile.label})
Scope guidance: ${scopeProfile.guidance}
Known facts from intake:
${formatStringListForPrompt(intakeKnownFacts)}

Related tickets selected by intake:
${formatRelatedTicketsForPrompt(board, relatedTicketIds)}

Answered intake questions:
${formatDraftIntakeAnswersForPrompt(intakeAnswers)}`;
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

Keep the output lean. Match the depth to the draft scope instead of writing a full PRD for every request. Stay within about ${scopeProfile.sectionBudget} bullets for each major list. Quick bugs should be very short. Product features and rewrites can include PRD-like decisions, but only where needed. Epics should reserve detail for child vertical-slice tasks.

Do not put deferred discovery into implementationPlan. Avoid steps starting with "inspect", "find", "trace", "audit", "look for", "search", or "review" unless the step is only final verification after concrete codebase findings are already provided.

If a blocking product or technical decision cannot be answered from the user's idea, intake answers, prior clarification answers, related tickets, or codebase research, return draftState "needs_clarification" and put only those blocking user-answerable questions in blockingClarificationQuestions. Do not create a weak ticket with questions for the implementation agent. For non-blocking uncertainty, choose a conservative default and record it in assumptions.

Use clarificationQuestions only for non-blocking open questions that should remain visible on a final ticket; prefer assumptions for chosen defaults. When draftState is "needs_clarification", duplicate the blocking questions into clarificationQuestions only if required by the schema.

Do not include large copied source blocks or long page excerpts.

Relay supports two ticket types: task and epic. ${ticketTypeGuidance}
For epic drafts, the parent epic should describe the overall outcome and subtickets should be independently implementable normal task tickets with their own requirements, implementationPlan, testPlan, acceptanceCriteria, labels, and priority. Do not create nested epics. For task drafts, subtickets must be an empty array.

Return only data matching the requested schema. Do not implement the task.

Project path: ${projectPath}
Project name: ${config.name}
Current board columns: ${config.columns.map((column) => column.name).join(", ")}

Draft intake context:
${intakeContext}

Draft clarification context:
${clarificationContext}

Research context:
${renderResearchForPrompt(research)}

User idea:
${idea}`;

    await reportTicketDraftProgress(dependencies, "The agent is writing the implementation-ready ticket draft. This can take several minutes.");
    const progressIntervalMs = dependencies.draftProgressIntervalMs ?? 60_000;
    if (dependencies.onProgress && progressIntervalMs > 0) {
      progressInterval = setInterval(() => {
        void reportTicketDraftProgress(
          dependencies,
          `Still waiting for the agent to return the structured ticket draft after ${formatDraftWait(durationMs())}.`
        );
      }, progressIntervalMs);
      unrefTimerHandle(progressInterval);
    }
    const turn = await thread.run(prompt, { outputSchema: ticketDraftSchemaJson, signal: abortController.signal });
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    await reportTicketDraftProgress(dependencies, "The agent returned a draft; validating the structured ticket.");
    let parsed: TicketDraftOutcome;
    try {
      const parsedDraft = parseSchema(ticketDraftSchema, parseJsonResponse(turn.finalResponse));
      parsed = normalizeTicketDraftOutcome(parsedDraft, research, scope);
    } catch (error) {
      throw ticketDraftError(
        "invalid_response",
        requestId,
        durationMs(),
        "The agent returned an invalid ticket draft. Your rough idea is still available; retry the agent when ready.",
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
      "The agent needs clarification before it can produce an implementation-ready ticket.",
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
  await submitTicketDraftJob({ ...input, projectPath, idea }, { runId, ticketId: ticket.frontMatter.id });
  await markKernelRunStatusSafely(projectPath, runId, "running", { message: "Ticket draft generation started." });
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

  await registerDraftRun(runId, {
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
      let draftInput: CreateDraftInput = {
        projectPath,
        idea,
        effort: ticket.frontMatter.effort,
        preferredTicketType: input.preferredTicketType,
        ticketId: ticket.frontMatter.id,
        draftScope: input.draftScope,
        intakeAnswers: input.intakeAnswers,
        intakeKnownFacts: input.intakeKnownFacts,
        relatedTicketIds: input.relatedTicketIds
      };

      if (input.runIntake && !hasUserSuppliedIntakeContext(input)) {
        await reportTicketDraftProgress(draftDependencies, "Running draft intake to classify scope and find blocking questions.");
        const intake = await createDraftIntake(
          {
            projectPath,
            idea,
            scopeOverride: draftIntakeScopeOverrideForCreateInput(input),
            effort: ticket.frontMatter.effort
          },
          draftDependencies
        );
        await reportTicketDraftProgress(
          draftDependencies,
          `Draft intake classified this as ${DRAFT_SCOPE_PROFILES[intake.scope].label.toLowerCase()} with ${intake.questions.length} blocking question${
            intake.questions.length === 1 ? "" : "s"
          }.`
        );

        if (intake.questions.length > 0) {
          const clarificationPrompts = intake.questions.map(draftIntakeQuestionToClarification);
          const questions = await createClarificationQuestions(
            projectPath,
            ticket.frontMatter.id,
            clarificationPrompts.map((question) => ({ question })),
            {
              actor: "codex",
              source: "draft_generation",
              runId,
              codexThreadId: threadId
            }
          );
          await blockPendingTicketDraftForClarification(projectPath, ticket.frontMatter.id, idea, runId, clarificationPrompts);
          await emitDraftEvent({
            type: "clarification.requested",
            questions,
            timestamp: nowIso()
          });
          await logInfo("codex:draft", "async ticket draft intake blocked on clarification", {
            projectPath,
            ticketId: ticket.frontMatter.id,
            runId,
            scope: intake.scope,
            clarificationQuestionCount: questions.length
          });
          await markKernelRunStatusSafely(projectPath, runId, "suspended", {
            message: "Ticket draft is blocked on clarification.",
            metadata: { clarificationQuestionCount: questions.length }
          });
          return;
        }

        draftInput = {
          ...draftInput,
          preferredTicketType: preferredTicketTypeForDraftScope(intake.scope, input.preferredTicketType),
          draftScope: intake.scope,
          intakeKnownFacts: intake.knownFacts,
          relatedTicketIds: intake.relatedTicketIds,
          intakeAnswers: []
        };
      }

      const outcome = await createTicketDraftOutcome(draftInput, draftDependencies);
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
        await markKernelRunStatusSafely(projectPath, runId, "suspended", {
          message: "Ticket draft is blocked on clarification.",
          metadata: { clarificationQuestionCount: questions.length }
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
      await markKernelRunStatusSafely(projectPath, runId, "completed", {
        result: { ticketId: ticket.frontMatter.id, title: draft.title },
        message: "Ticket draft completed."
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
      await markKernelRunStatusSafely(projectPath, runId, payload.code === "cancelled" ? "cancelled" : "failed", {
        error: payload,
        message: payload.message
      });
    } finally {
      await completeDraftRun(runId);
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
      authoringState: "drafting",
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
  await submitTicketDraftJob({ projectPath, ticketId, idea, effort: draftingTicket.frontMatter.effort }, { runId, ticketId });
  await markKernelRunStatusSafely(projectPath, runId, "running", { message: "Ticket draft resumed after clarification." });
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

  await registerDraftRun(runId, {
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
        {
          projectPath,
          ticketId,
          idea,
          effort: draftingTicket.frontMatter.effort,
          preferredTicketType: draftingTicket.frontMatter.ticketType
        },
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
        await markKernelRunStatusSafely(projectPath, runId, "suspended", {
          message: "Ticket draft is blocked on clarification.",
          metadata: { clarificationQuestionCount: questions.length }
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
      await markKernelRunStatusSafely(projectPath, runId, "completed", {
        result: { ticketId, title: draft.title },
        message: "Ticket draft completed."
      });
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
      await markKernelRunStatusSafely(projectPath, runId, payload.code === "cancelled" ? "cancelled" : "failed", {
        error: payload,
        message: payload.message
      });
    } finally {
      await completeDraftRun(runId);
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

  if (item.type === "todo_list") {
    return [
      {
        type: "todo.updated",
        items: item.items.map((todoItem) => ({
          text: todoItem.text,
          completed: todoItem.completed
        })),
        timestamp
      }
    ];
  }

  if (item.type === "mcp_tool_call") {
    return [
      {
        type: "mcp.tool_call",
        server: item.server,
        tool: item.tool,
        status: item.status,
        ...(item.error?.message ? { error: item.error.message } : {}),
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

const assertAgentMarkdownBody = (markdown: string, fieldName: string): string => {
  const normalized = markdown.trimStart();
  if (!normalized.trim()) throw new Error(`Agent ticket update ${fieldName} must include markdown content.`);
  if (/^---\s*(?:\r?\n|$)/.test(normalized)) {
    throw new Error(`Agent ticket update ${fieldName} must not include YAML front matter.`);
  }
  return normalized;
};

const parseAgentTicketUpdate = (value: string): AgentTicketUpdate => {
  const parsed = parseSchema(agentTicketUpdateSchema, parseJsonResponse(value));
  const title = normalizeWhitespace(parsed.title);
  if (!title) throw new Error("Agent ticket update must include a title.");

  const labels = [...new Set(parsed.labels.map((label) => normalizeWhitespace(label)).filter(Boolean))];
  const fullMarkdown = parsed.patch.fullMarkdown?.trim() ? assertAgentMarkdownBody(parsed.patch.fullMarkdown, "fullMarkdown") : null;
  const appendMarkdown = parsed.patch.appendMarkdown?.trim() ? assertAgentMarkdownBody(parsed.patch.appendMarkdown, "appendMarkdown") : null;
  if (!fullMarkdown && !appendMarkdown) throw new Error("Agent ticket update patch must include fullMarkdown or appendMarkdown.");
  const clarificationQuestions = parsed.clarificationQuestions.map((question) => normalizeWhitespace(question)).filter(Boolean);
  return {
    title,
    priority: parsed.priority,
    labels,
    authoringState: parsed.authoringState,
    patch: {
      summary: normalizeWhitespace(parsed.patch.summary),
      fullMarkdown,
      appendMarkdown
    },
    clarificationQuestions
  };
};

const applyAgentTicketPatch = (currentMarkdown: string, update: AgentTicketUpdate): string => {
  if (update.patch.fullMarkdown?.trim()) return update.patch.fullMarkdown.trimStart();
  const appendMarkdown = update.patch.appendMarkdown?.trim();
  if (!appendMarkdown) return currentMarkdown;
  return `${currentMarkdown.trimEnd()}\n\n## Agent Refinement\n\n${appendMarkdown}\n`;
};

const buildTicketUpdatePrompt = (
  ticket: Awaited<ReturnType<typeof readTicket>>,
  clarifications: ClarificationQuestion[],
  request: string,
  projectName: string
): string => `You are helping update one Relay ticket.

Update the ticket content only. Do not implement the ticket. Do not modify files. Do not move the ticket to another column. Do not change run history or Codex execution metadata.

This is a long-lived Relay authoring loop. The user may refine this ticket many times before clicking Implement. Preserve useful existing ticket content by default. Return a patch, not a blind rewrite.

Return only structured JSON matching the requested schema:
- title: full updated ticket title.
- priority: one of low, medium, high, urgent.
- labels: complete updated label list.
- authoringState: "reviewing" when the ticket is ready for user inspection, "needs_input" when new clarification is blocking, "ready" only when the ticket appears implementation-ready, or "rough" when it is still an early note.
- patch.summary: concise user-facing summary of the refinement.
- patch.appendMarkdown: markdown to append under an Agent Refinement section for additive changes, extra research, notes, or checklist items.
- patch.fullMarkdown: complete replacement markdown only when the user asks for a rewrite or a safe merge cannot preserve coherence.
- clarificationQuestions: new user-answerable clarification questions to store as formal Relay clarification records. Use an empty array when no new formal clarification records are needed.

For todos, use GitHub-style markdown checkboxes like "- [ ] Validate migration path" or "- [x] Confirm existing behavior"; Relay renders these as checklists and summarizes them on ticket cards.
Never include YAML front matter in fullMarkdown or appendMarkdown. Keep existing implementation handoff/history content when it is present.

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
  const runId = dependencies.createRunId?.() ?? newId("run");
  const abortController = new AbortController();
  const beginResult = await beginTicketUpdateRun(runId, updateKey, { abortController, ticketId, projectPath });
  if (!beginResult.started) {
    throw new Error("A ticket update agent is already running for this ticket.");
  }

  await logInfo("codex:ticket-update", "starting ticket update run", { projectPath, ticketId, requestLength: request.length });
  let currentThreadId = `pending_${runId}`;
  const outputOffsets = new Map<string, number>();

  let streamed: Awaited<ReturnType<TicketUpdateThread["runStreamed"]>>;
  try {
    const config = await readProjectConfig(projectPath);
    const ticket = await readTicket(projectPath, ticketId);
    const clarifications = await readClarificationQuestions(projectPath, ticketId);
    await submitTicketUpdateJob({ ...input, projectPath, request }, { runId });
    const codex = dependencies.createCodexClient?.() ?? (await createCodex());
    const thread = codex.startThread(await ticketUpdateThreadOptionsForProject(projectPath));
    currentThreadId = thread.id ?? currentThreadId;
    const prompt = buildTicketUpdatePrompt(ticket, clarifications, request, config.name);
    streamed = await thread.runStreamed(prompt, { outputSchema: agentTicketUpdateSchemaJson, signal: abortController.signal });
    await markKernelRunStatusSafely(projectPath, runId, "running", { message: "Ticket update agent started." });
  } catch (error) {
    await completeTicketUpdateRun(runId);
    await markKernelRunStatusSafely(projectPath, runId, abortController.signal.aborted ? "cancelled" : "failed", {
      error,
      message: errorMessage(error, "Ticket update failed before streaming started.")
    });
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
      await markKernelRunStatusSafely(projectPath, runId, finalStatus === "cancelled" ? "cancelled" : "failed", {
        message,
        error: { message, finalStatus }
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
              const nextMarkdown = applyAgentTicketPatch(latest.markdown, update);
              const nextAuthoringState = update.clarificationQuestions.length > 0 ? "needs_input" : update.authoringState;
              await writeTicket(projectPath, {
                ...latest,
                markdown: nextMarkdown,
                frontMatter: {
                  ...latest.frontMatter,
                  title: update.title,
                  priority: update.priority,
                  labels: update.labels,
                  authoringState: nextAuthoringState
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
                finalResponse:
                  update.clarificationQuestions.length > 0
                    ? `Ticket refined and blocked with ${update.clarificationQuestions.length} new clarification question${
                        update.clarificationQuestions.length === 1 ? "" : "s"
                      }. ${update.patch.summary}`
                    : `Ticket refined. ${update.patch.summary}`,
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
              await markKernelRunStatusSafely(
                projectPath,
                runId,
                update.clarificationQuestions.length > 0 ? "suspended" : "completed",
                {
                  result: { ticketId, clarificationQuestionCount: update.clarificationQuestions.length },
                  message:
                    update.clarificationQuestions.length > 0
                      ? "Ticket update is waiting on clarification."
                      : "Ticket update completed."
                }
              );
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
        await completeTicketUpdateRun(runId);
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
  const run = await getTicketUpdateRun(runId);
  if (!run) return;
  run.abortController.abort();
  await markKernelRunStatusSafely(run.projectPath, runId, "cancelled", { message: "Ticket update cancellation requested." });
};

const subagentExecutionGuidance = `Subagent guidance:
- Use subagents only when available and useful for this ticket; skip them for small or tightly coupled work where delegation adds overhead.
- Plan locally first, keep urgent blocking critical-path work local, and delegate only independent sidecar tasks that can run in parallel.
- Give each subagent a concrete bounded responsibility; for code-editing workers, assign disjoint file or module ownership and avoid duplicate delegation.
- Integrate subagent results before finalizing, and wait only when their result is needed.`;

const buildExecutionPrompt = (ticketMarkdown: string, clarifications: ClarificationQuestion[]): string => `You are working inside the local project folder for this Relay ticket.

Follow the ticket exactly. Ask for clarification if the ticket is missing a required product or implementation decision.

${subagentExecutionGuidance}

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
- Subagent usage: which subagents were launched, what they owned, what files they changed, how results were integrated, or "none used"
- Any remaining risks or follow-up work

Ticket:
${ticketMarkdown}`;

const markdownImagePattern = /!\[[^\]\n]*\]\(([^)\n]+)\)/g;
const urlSchemePattern = /^[a-z][a-z0-9+.-]*:/i;

const normalizeMarkdownImageDestination = (destination: string): string | null => {
  const trimmed = destination.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//") || urlSchemePattern.test(trimmed)) return null;

  const unwrapped = trimmed.startsWith("<") && trimmed.endsWith(">") ? trimmed.slice(1, -1).trim() : trimmed;
  if (!unwrapped || unwrapped.startsWith("#") || unwrapped.startsWith("//") || urlSchemePattern.test(unwrapped)) return null;

  try {
    return decodeURI(unwrapped);
  } catch {
    return unwrapped;
  }
};

const isPathInsideDirectory = (directory: string, target: string): boolean => {
  const relative = pathRelative(directory, target);
  return relative === "" || (!relative.startsWith("..") && !pathIsAbsolute(relative));
};

export const extractLocalMarkdownImagePaths = (projectPath: string, ticketMarkdown: string): string[] => {
  const projectRoot = pathResolve(projectPath);
  const imagePaths: string[] = [];
  const seen = new Set<string>();

  for (const match of ticketMarkdown.matchAll(markdownImagePattern)) {
    const destination = normalizeMarkdownImageDestination(match[1] ?? "");
    if (!destination) continue;

    const absolutePath = pathResolve(projectRoot, destination);
    if (!isPathInsideDirectory(projectRoot, absolutePath) || seen.has(absolutePath)) continue;
    seen.add(absolutePath);
    imagePaths.push(absolutePath);
  }

  return imagePaths;
};

export const buildExecutionInput = (
  projectPath: string,
  ticketMarkdown: string,
  clarifications: ClarificationQuestion[]
): CodexRunInput => {
  const prompt = buildExecutionPrompt(ticketMarkdown, clarifications);
  const imagePaths = extractLocalMarkdownImagePaths(projectPath, ticketMarkdown);
  if (imagePaths.length === 0) return prompt;

  return [
    { type: "text", text: prompt },
    ...imagePaths.map((imagePath) => ({ type: "local_image" as const, path: imagePath }))
  ];
};

type TicketRunStatePatch = Partial<{
  authoringState: TicketAuthoringState;
  codexThreadId: string | null;
  runStatus: RunStatus;
  lastRunId: string | null;
  lastRunStartedAt: string | null;
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
          authoringState: patch.authoringState ?? ticket.frontMatter.authoringState,
          runStatus: patch.runStatus ?? ticket.frontMatter.runStatus,
          lastRunId: patch.lastRunId !== undefined ? patch.lastRunId : ticket.frontMatter.lastRunId,
          lastRunStartedAt: patch.lastRunStartedAt !== undefined ? patch.lastRunStartedAt : ticket.frontMatter.lastRunStartedAt,
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

type CodexRunPreflightOptions = {
  allowQueuedRunId?: string | null;
};

const preflightCodexRunInternal = async (
  input: StartRunInput,
  options: CodexRunPreflightOptions = {}
): Promise<CodexRunPreflightResult> => {
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
    } else if (currentColumn.terminal && ticket.frontMatter.status !== RELAY_COMPLETED_STATUS) {
      errors.push(`Move this ticket out of ${currentColumn.name} before starting the agent.`);
    }

    if (ticket.frontMatter.status === RELAY_COMPLETED_STATUS) {
      errors.push("Completed tickets are human accepted. Reopen this ticket before starting the agent.");
    }
    if (ticket.frontMatter.ticketType === "epic") {
      errors.push("Epics are planning containers. Start the agent from a child task ticket instead.");
    }

    const board = await readBoard(projectPath);
    const blockerState = resolveTicketBlockers(ticket.frontMatter, board.tickets, config.columns);
    if (blockerState.selfBlockerIds.length > 0) {
      errors.push("Ticket blocker metadata is invalid: a ticket cannot block itself.");
    }
    if (blockerState.activeBlockers.length > 0) {
      errors.push(
        `Blocked by active blocker(s): ${blockerState.activeBlockers.map(resolvedBlockerLabel).join("; ")}. Move blockers to terminal columns before starting the agent.`
      );
    }
    if (blockerState.missingBlockerIds.length > 0) {
      warnings.push(`Missing blocker reference(s): ${blockerState.missingBlockerIds.join(", ")}.`);
    }

    const activeRunId = await activeRunIdForTicket(projectPath, ticketId);
    if (activeRunId) {
      errors.push(`Ticket already has an active agent run: ${activeRunId}.`);
    } else if (ticket.frontMatter.runStatus === "queued" && ticket.frontMatter.lastRunId !== options.allowQueuedRunId) {
      errors.push("Ticket is already queued for an agent run.");
    } else if (ticket.frontMatter.runStatus === "drafting") {
      errors.push("The agent is still drafting this ticket. Wait for the draft to finish before starting a run.");
    } else if (ticket.frontMatter.runStatus === "running") {
      errors.push("Ticket is already marked as running. Stop or reconcile the current run before starting the agent again.");
    }

    const clarifications = await readClarificationQuestions(projectPath, ticketId);
    unansweredClarificationCount = clarifications.filter((question) => !question.answer?.trim()).length;
    if (unansweredClarificationCount > 0) {
      errors.push(`Answer ${unansweredClarificationCount} open clarification question(s) before starting the agent.`);
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

export const preflightCodexRun = (input: StartRunInput): Promise<CodexRunPreflightResult> => preflightCodexRunInternal(input);

const startQueuedRunNow = async (
  input: StartRunInput,
  resume: boolean,
  runId: string,
  dependencies: CodexRunDependencies = {}
): Promise<CodexRunStartResult | null> => {
  const projectPath = pathResolve(input.projectPath);
  const ticketId = input.ticketId;
  const freshThread = input.freshThread;
  const runEventSink = dependencies.runEventSink;
  let currentThreadId = `pending_${runId}`;
  await logInfo("codex:run", "starting queued run", { projectPath, ticketId, runId, resume, freshThread });
  if (!(await getQueuedImplementationRun(runId))) {
    await completeImplementationRun(runId);
    return null;
  }
  const preflight = await preflightCodexRunInternal(input, { allowQueuedRunId: runId });
  if (!preflight.ok) {
    await completeImplementationRun(runId);
    await removeQueuedImplementationRun(runId);
    const message = preflight.errors.join(" ");
    await updateTicketRunState(projectPath, ticketId, { runStatus: "failed" });
    await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
      type: "run.failed",
      message,
      finalStatus: "failed",
      timestamp: nowIso()
    });
    await markKernelRunStatusSafely(projectPath, runId, "failed", { message, error: { message } });
    wakeProjectSchedulerSoon(projectPath);
    throw new Error(message);
  }
  if (!(await getQueuedImplementationRun(runId))) {
    await completeImplementationRun(runId);
    return null;
  }
  let config: Awaited<ReturnType<typeof readProjectConfig>>;
  let ticket: Awaited<ReturnType<typeof readTicket>>;
  let existingThreadId: string | null;
  let thread: CodexRunThread;
  let executionInput: CodexRunInput;
  let status: string;
  const abortController = new AbortController();
  const outputOffsets = new Map<string, number>();
  try {
    config = await readProjectConfig(projectPath);
    ticket = await readTicket(projectPath, ticketId);
    const clarifications = await readClarificationQuestions(projectPath, ticketId);
    const options = await implementationThreadOptionsForProject(projectPath, ticket.frontMatter.effort);
    existingThreadId = resume && !freshThread ? ticket.frontMatter.codexThreadId : null;
    executionInput = buildExecutionInput(projectPath, ticket.markdown, clarifications);
    status = config.columns.some((column) => column.id === RELAY_IN_PROGRESS_STATUS) ? RELAY_IN_PROGRESS_STATUS : ticket.frontMatter.status;
    if (!(await getQueuedImplementationRun(runId))) {
      await completeImplementationRun(runId);
      return null;
    }
    const codex = dependencies.createCodexClient?.() ?? (await createCodex());
    thread = existingThreadId ? codex.resumeThread(existingThreadId, options) : codex.startThread(options);
    currentThreadId = existingThreadId ?? thread.id ?? currentThreadId;
  } catch (error) {
    await completeImplementationRun(runId);
    await removeQueuedImplementationRun(runId);
    await logError("codex:run", "queued run failed before active registration", error, { projectPath, ticketId, runId });
    try {
      await updateTicketRunState(projectPath, ticketId, { runStatus: "failed" });
      await emitRunEventForDependencies(runEventSink, projectPath, ticketId, runId, currentThreadId, {
        type: "run.failed",
        message: errorMessage(error, "Agent run failed before streaming started."),
        finalStatus: "failed",
        timestamp: nowIso()
      });
      await markKernelRunStatusSafely(projectPath, runId, "failed", {
        error,
        message: errorMessage(error, "Agent run failed before streaming started.")
      });
    } catch (cleanupError) {
      await logWarn("codex:run", "failed to persist queued startup failure", {
        projectPath,
        ticketId,
        runId,
        error: errorMessage(cleanupError, "State update failed.")
      });
    }
    wakeProjectSchedulerSoon(projectPath);
    throw error;
  }
  let streamed: Awaited<ReturnType<CodexRunThread["runStreamed"]>>;
  if (!(await getQueuedImplementationRun(runId))) {
    await completeImplementationRun(runId);
    return null;
  }
  await registerImplementationActive(runId, {
    abortController,
    ticketId,
    projectPath
  });
  const runStartedAt = nowIso();
  try {
    if (abortController.signal.aborted) {
      throw new Error("Agent run was cancelled before streaming started.");
    }
    await markKernelRunStatusSafely(projectPath, runId, "running", { message: "Codex implementation run started." });
    await updateTicketRunState(projectPath, ticketId, {
      authoringState: "ready",
      runStatus: "running",
      lastRunId: runId,
      lastRunStartedAt: runStartedAt
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
    streamed = await thread.runStreamed(executionInput, { signal: abortController.signal });
  } catch (error) {
    await completeImplementationRun(runId);
    await logError("codex:run", "run failed before streaming started", error, { projectPath, ticketId, runId, threadId: currentThreadId });
    try {
      await updateTicketRunState(projectPath, ticketId, { runStatus: abortController.signal.aborted ? "cancelled" : "failed" });
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
        message: errorMessage(error, "Agent run failed before streaming started."),
        finalStatus: abortController.signal.aborted ? "cancelled" : "failed",
        timestamp: nowIso()
      });
      await markKernelRunStatusSafely(projectPath, runId, abortController.signal.aborted ? "cancelled" : "failed", {
        error,
        message: errorMessage(error, "Agent run failed before streaming started.")
      });
    } catch (emitError) {
      await logWarn("codex:run", "failed to emit startup failure event", {
        projectPath,
        ticketId,
        runId,
        error: errorMessage(emitError, "Event emission failed.")
      });
    }
    wakeProjectSchedulerSoon(projectPath);
    throw error;
  }
  const started = new Promise<CodexRunStartResult>((resolve) => {
    let resolved = false;
    const resolveOnce = (threadId: string): void => {
      if (!resolved) {
        resolved = true;
        resolve({ state: "started", runId, threadId });
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
              authoringState: "ready",
              runStatus: "running",
              lastRunId: runId,
              lastRunStartedAt: runStartedAt
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
            await markKernelRunStatusSafely(projectPath, runId, "failed", { message, error: { message } });
            resolveOnce(currentThreadId);
            return;
          }

          if (event.type === "turn.completed") {
            const updated = await readTicket(projectPath, ticketId);
            const handoff = finalResponse || "The agent completed the run without a final text response.";
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
                authoringState: "needs_input",
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
              await markKernelRunStatusSafely(projectPath, runId, "suspended", {
                result: { ticketId, clarificationQuestionCount: questions.length },
                message: "Codex implementation is blocked on clarification."
              });
              resolveOnce(currentThreadId);
              return;
            }

            const targetStatus = config.columns.some((column) => column.id === RELAY_REVIEW_STATUS)
              ? RELAY_REVIEW_STATUS
              : updated.frontMatter.status;
            await updateTicketRunState(projectPath, ticketId, {
              authoringState: "ready",
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
            await markKernelRunStatusSafely(projectPath, runId, "completed", {
              result: { ticketId, threadId: currentThreadId },
              message: "Codex implementation completed."
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
          message: error instanceof Error ? error.message : "Agent run failed.",
          finalStatus: aborted ? "cancelled" : "failed",
          timestamp: nowIso()
        });
        await markKernelRunStatusSafely(projectPath, runId, aborted ? "cancelled" : "failed", {
          error,
          message: error instanceof Error ? error.message : "Agent run failed."
        });
        resolveOnce(currentThreadId);
      } finally {
        await completeImplementationRun(runId);
        wakeProjectSchedulerSoon(projectPath);
      }
    })();
  });

  return started;
};

const enqueueCodexRunPromise = async (
  input: StartRunInput,
  resume: boolean,
  dependencies: CodexRunDependencies = {}
): Promise<CodexRunStartResult> => {
  const projectPath = pathResolve(input.projectPath);
  const ticketId = input.ticketId;
  const normalizedInput: StartRunInput = { ...input, projectPath };
  await logInfo("codex:run", "queueing run", { projectPath, ticketId, resume, freshThread: input.freshThread });
  const preflight = await preflightCodexRunInternal(normalizedInput);
  if (!preflight.ok) {
    throw new Error(preflight.errors.join(" "));
  }

  const runId = dependencies.createRunId?.() ?? newId("run");
  await submitCodexImplementationJob(normalizedInput, { runId, resume });
  await enqueueImplementationRun(runId, {
    input: normalizedInput,
    resume,
    dependencies
  });
  try {
    await setTicketQueued(projectPath, ticketId, runId);
  } catch (error) {
    await removeQueuedImplementationRun(runId);
    await markKernelRunStatusSafely(projectPath, runId, "failed", {
      error,
      message: errorMessage(error, "Could not persist queued ticket state.")
    });
    throw error;
  }
  wakeProjectSchedulerSoon(projectPath);
  return { state: "queued", runId, threadId: null };
};

const enqueueCodexRunEffect = (
  input: StartRunInput,
  resume: boolean
): BackendEffect<CodexRunStartResult, unknown, BackendServices | CodexRunDependencyServices> =>
  Effect.gen(function*() {
    const dependencies = yield* CodexRunDependencyService;
    return yield* fromPromise(() => enqueueCodexRunPromise(input, resume, dependencies));
  });

export const startCodexRun = (
  input: StartRunInput,
  dependencies?: CodexRunDependencies
): Promise<CodexRunStartResult> =>
  runBackendEffect(Effect.provide(enqueueCodexRunEffect(input, false), codexRunDependencyLayer(dependencies)));

export const resumeCodexRun = (
  input: StartRunInput,
  dependencies?: CodexRunDependencies
): Promise<CodexRunStartResult> =>
  runBackendEffect(Effect.provide(enqueueCodexRunEffect(input, true), codexRunDependencyLayer(dependencies)));

export const reconcileTicketQueueState = async (
  projectPath: string,
  ticketId: string,
  dependencies: CodexRunDependencies = {}
): Promise<TicketRecord> => {
  const resolvedProjectPath = pathResolve(projectPath);
  const ticket = await readTicket(resolvedProjectPath, ticketId);

  if (ticket.frontMatter.status === RELAY_READY_STATUS) {
    if (ticket.frontMatter.runStatus === "queued" && ticket.frontMatter.lastRunId) {
      if (!(await getQueuedImplementationRun(ticket.frontMatter.lastRunId))) {
        await submitCodexImplementationJob(
          { projectPath: resolvedProjectPath, ticketId },
          { runId: ticket.frontMatter.lastRunId, resume: Boolean(ticket.frontMatter.codexThreadId) }
        );
        await enqueueImplementationRun(ticket.frontMatter.lastRunId, {
          input: { projectPath: resolvedProjectPath, ticketId },
          resume: Boolean(ticket.frontMatter.codexThreadId),
          dependencies
        });
      }
      wakeProjectSchedulerSoon(resolvedProjectPath);
      return ticket;
    }
    if (ticket.frontMatter.runStatus === "running" || ticket.frontMatter.runStatus === "drafting") return ticket;

    const preflight = await preflightCodexRunInternal({ projectPath: resolvedProjectPath, ticketId });
    if (!preflight.ok) {
      throw new Error(preflight.errors.join(" "));
    }
    const runId = dependencies.createRunId?.() ?? newId("run");
    await submitCodexImplementationJob(
      { projectPath: resolvedProjectPath, ticketId },
      { runId, resume: Boolean(ticket.frontMatter.codexThreadId) }
    );
    await enqueueImplementationRun(runId, {
      input: { projectPath: resolvedProjectPath, ticketId },
      resume: Boolean(ticket.frontMatter.codexThreadId),
      dependencies
    });
    try {
      const queued = await setTicketQueued(resolvedProjectPath, ticketId, runId);
      wakeProjectSchedulerSoon(resolvedProjectPath);
      return queued;
    } catch (error) {
      await removeQueuedImplementationRun(runId);
      await markKernelRunStatusSafely(resolvedProjectPath, runId, "failed", {
        error,
        message: errorMessage(error, "Could not persist queued ticket state.")
      });
      throw error;
    }
  }

  if (ticket.frontMatter.runStatus === "queued" && ticket.frontMatter.lastRunId) {
    await removeQueuedImplementationRun(ticket.frontMatter.lastRunId);
    await markKernelRunStatusSafely(resolvedProjectPath, ticket.frontMatter.lastRunId, "cancelled", {
      message: "Queued run cancelled by reconciliation."
    });
    return clearQueuedTicket(resolvedProjectPath, ticketId, null, ticket.frontMatter.lastRunId);
  }

  return ticket;
};

export const cancelCodexRun = async (runId: string): Promise<void> => {
  const queued = await getQueuedImplementationRun(runId);
  if (queued) {
    await removeQueuedImplementationRun(runId);
    const active = await getActiveImplementationRun(runId);
    await completeImplementationRun(runId);
    if (active) {
      active.abortController.abort();
      await updateTicketRunState(active.projectPath, active.ticketId, { runStatus: "cancelled" });
      await markKernelRunStatusSafely(active.projectPath, runId, "cancelled", { message: "Codex implementation cancellation requested." });
      return;
    }
    const projectPath = pathResolve(queued.input.projectPath);
    const targetStatus = (await readProjectConfig(projectPath)).columns.some((column) => column.id === RELAY_TODO_STATUS)
      ? RELAY_TODO_STATUS
      : null;
    await clearQueuedTicket(projectPath, queued.input.ticketId, targetStatus, runId);
    await markKernelRunStatusSafely(projectPath, runId, "cancelled", { message: "Queued Codex implementation run cancelled." });
    wakeProjectSchedulerSoon(projectPath);
    return;
  }

  const implementationRun = await getActiveImplementationRun(runId);
  if (implementationRun) {
    implementationRun.abortController.abort();
    await updateTicketRunState(implementationRun.projectPath, implementationRun.ticketId, { runStatus: "cancelled" });
    await markKernelRunStatusSafely(implementationRun.projectPath, runId, "cancelled", {
      message: "Codex implementation cancellation requested."
    });
    return;
  }

  const draftRun = await getDraftRun(runId);
  if (!draftRun) return;
  draftRun.abortController.abort();
  await updateTicketRunState(draftRun.projectPath, draftRun.ticketId, { runStatus: "cancelled" });
  await markKernelRunStatusSafely(draftRun.projectPath, runId, "cancelled", { message: "Ticket draft cancellation requested." });
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
