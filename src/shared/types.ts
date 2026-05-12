export const RELAY_SCHEMA_VERSION = 1;
export const RELAY_TODO_STATUS = "todo";
export const RELAY_READY_STATUS = "ready";
export const RELAY_IN_PROGRESS_STATUS = "in_progress";
export const RELAY_NEEDS_CLARIFICATION_STATUS = "needs_clarification";
export const RELAY_REVIEW_STATUS = "review";
export const RELAY_NOT_DOING_STATUS = "not_doing";
export const RELAY_COMPLETED_STATUS = "completed";

export const DEFAULT_COLUMNS: RelayColumn[] = [
  { id: RELAY_TODO_STATUS, name: "Todo", position: 1000, terminal: false },
  { id: RELAY_READY_STATUS, name: "Ready", position: 2000, terminal: false },
  { id: RELAY_IN_PROGRESS_STATUS, name: "In Progress", position: 3000, terminal: false },
  { id: RELAY_NEEDS_CLARIFICATION_STATUS, name: "Needs Clarification", position: 4000, terminal: false },
  { id: RELAY_REVIEW_STATUS, name: "Review", position: 5000, terminal: false },
  { id: RELAY_NOT_DOING_STATUS, name: "Not Doing", position: 6000, terminal: true },
  { id: RELAY_COMPLETED_STATUS, name: "Completed", position: 7000, terminal: true }
];

export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketType = "task" | "epic";
export type RunStatus =
  | "idle"
  | "queued"
  | "drafting"
  | "draft_failed"
  | "draft_complete"
  | "running"
  | "blocked"
  | "failed"
  | "completed"
  | "cancelled";
export type ProjectHealth = "ok" | "warning" | "error";
export type ThemePreference = "system" | "light" | "dark";
export type RelayActor = "user" | "codex" | "system";
export type RelayEventSource =
  | "manual_board"
  | "manual_ticket_edit"
  | "draft_generation"
  | "agent_execution"
  | "clarification_ui"
  | "system_reconciliation";

export type RelayColumn = {
  id: string;
  name: string;
  position: number;
  terminal: boolean;
};

export type ProjectSettings = {
  defaultModel: string | null;
  defaultModelReasoningEffort: null | "minimal" | "low" | "medium" | "high" | "xhigh";
  defaultApprovalPolicy: "untrusted" | "on-request" | "on-failure" | "never";
  defaultSandboxMode: "read-only" | "workspace-write" | "danger-full-access";
  allowNonGitCodexRuns: boolean;
  ticketDraftingEnabled: boolean;
  codexExecutionEnabled: boolean;
  codexNetworkAccessEnabled: boolean;
  codexWebSearchMode: "disabled" | "cached" | "live";
  codexAdditionalDirectories: string[];
  agentConcurrency: number;
};

export type ProjectConfig = {
  schemaVersion: number;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  columns: RelayColumn[];
  settings: ProjectSettings;
};

export type ProjectSummary = {
  projectId: string | null;
  name: string;
  path: string;
  exists: boolean;
  isGitRepository: boolean;
  relayInitialized: boolean;
  health: ProjectHealth;
  healthMessages: string[];
  activeRunCount: number;
  swimlanes: ProjectSwimlaneSummary[];
  lastOpenedAt?: string;
};

export type ProjectSwimlaneSummary = {
  id: string;
  name: string;
  position: number;
  ticketCount: number;
  activeRunCount: number;
};

export type GitMetadataState = "loading" | "ready" | "not_git" | "unavailable" | "missing" | "error";

export type GitMetadata = {
  state: GitMetadataState;
  isGitRepository: boolean;
  branchName: string | null;
  isDetachedHead: boolean;
  commitSha: string | null;
  isDirty: boolean;
  changedFileCount: number | null;
  message: string | null;
  error: string | null;
  updatedAt: string;
};

export type GitMetadataOptions = {
  force?: boolean;
};

export type TicketFrontMatter = {
  schemaVersion: number;
  id: string;
  title: string;
  ticketType: TicketType;
  status: string;
  position: number;
  priority: TicketPriority;
  labels: string[];
  parentEpicId: string | null;
  subticketIds: string[];
  blockedByIds: string[];
  createdAt: string;
  updatedAt: string;
  codexThreadId: string | null;
  runStatus: RunStatus;
  lastRunId: string | null;
  lastRunStartedAt: string | null;
};

export type TicketRecord = {
  frontMatter: TicketFrontMatter;
  markdown: string;
  filePath: string;
};

export type TicketSummary = TicketFrontMatter & {
  excerpt: string;
  filePath: string;
};

export type TicketReferenceCandidate = {
  id: string;
  title: string;
  status: string;
  columnName: string;
  relativePath: string;
  linkPath: string;
};

export type InvalidTicket = {
  filePath: string;
  reason: string;
};

export type BoardSnapshot = {
  project: ProjectSummary;
  config: ProjectConfig | null;
  columns: RelayColumn[];
  tickets: TicketSummary[];
  invalidTickets: InvalidTicket[];
};

export type TicketDraftSubticket = {
  title: string;
  priority: TicketPriority;
  labels: string[];
  context: string;
  researchFindings: string[];
  requirements: string[];
  implementationPlan: string[];
  testPlan?: string[];
  acceptanceCriteria: string[];
  clarificationQuestions: string[];
  assumptions?: string[];
  implementationNotes: string[];
};

export type TicketDraft = TicketDraftSubticket & {
  draftState?: "ready" | "needs_clarification";
  blockingClarificationQuestions?: string[];
  ticketType: TicketType;
  subtickets: TicketDraftSubticket[];
  research: TicketDraftResearch;
};

export type TaskPlanDraft = TicketDraftSubticket;
export type EpicPlanDraft = TicketDraft & { ticketType: "epic" };

export type TicketDraftResearchUrl = {
  url: string;
  status: "fetched" | "failed" | "skipped";
  title: string | null;
  reason: string | null;
  charactersRead: number;
};

export type TicketDraftResearchFile = {
  path: string;
  reason: string;
  symbols: string[];
  matches: string[];
  charactersRead: number;
};

export type TicketDraftResearchLimits = {
  maxResearchMs: number;
  maxUrls: number;
  maxUrlFetchMs: number;
  maxUrlContentChars: number;
  maxFilesToScan: number;
  maxFilesToRead: number;
  maxFileReadChars: number;
  maxMatchesPerFile: number;
};

export type TicketDraftResearch = {
  generatedAt: string;
  checkedUrls: TicketDraftResearchUrl[];
  inspectedFiles: TicketDraftResearchFile[];
  limitations: string[];
  limits: TicketDraftResearchLimits;
};

export type TicketDraftErrorCode =
  | "codex_unavailable"
  | "codex_unauthenticated"
  | "timeout"
  | "cancelled"
  | "clarification_required"
  | "invalid_response"
  | "backend_failure";

export type TicketDraftErrorPayload = {
  code: TicketDraftErrorCode;
  message: string;
  recoverable: boolean;
  requestId: string;
  durationMs: number;
  reason: string;
  timeoutMs?: number;
};

export type TicketDraftResult =
  | {
      ok: true;
      draft: TicketDraft;
    }
  | {
      ok: false;
      error: TicketDraftErrorPayload;
    };

export type TicketDraftStartResult =
  | {
      ok: true;
      ticket: TicketRecord;
      runId: string;
    }
  | {
      ok: false;
      error: TicketDraftErrorPayload;
    };

export type AgentTicketUpdate = {
  title: string;
  priority: TicketPriority;
  labels: string[];
  markdown: string;
  clarificationQuestions: string[];
};

export type AgentTicketUpdateInput = {
  projectPath: string;
  ticketId: string;
  request: string;
};

export type AgentTicketUpdateStartResult = {
  runId: string;
  threadId: string;
};

export type SubticketCreateInput = {
  title: string;
  priority: TicketPriority;
  labels: string[];
  markdown: string;
  status?: string;
  blockedByIds?: string[];
};

export type TicketCreateInput = SubticketCreateInput & {
  ticketType?: TicketType;
  parentEpicId?: string | null;
  subticketIds?: string[];
  subtickets?: SubticketCreateInput[];
};

export type EpicSubticketCreateInput = {
  projectPath: string;
  epicId: string;
  ticket: SubticketCreateInput;
};

export type EpicSubticketLinkInput = {
  projectPath: string;
  epicId: string;
  ticketId: string;
};

export type EpicSubticketUnlinkInput = EpicSubticketLinkInput;

export type TicketSaveInput = {
  projectPath: string;
  ticket: TicketRecord;
};

export type TicketAttachmentSaveInput = {
  projectPath: string;
  fileName: string;
  mimeType?: string | null;
  contentBase64: string;
};

export type TicketAttachmentSaveResult = {
  fileName: string;
  markdownPath: string;
  absolutePath: string;
};

export type TicketMoveInput = {
  projectPath: string;
  ticketId: string;
  targetStatus: string;
  beforeTicketId?: string | null;
  afterTicketId?: string | null;
};

export type ClarificationAnswerType = "text";

export type ClarificationQuestion = {
  id: string;
  ticketId: string;
  question: string;
  answerType: ClarificationAnswerType;
  answer: string | null;
  createdAt: string;
  updatedAt: string;
  answeredAt: string | null;
  createdBy: RelayActor;
  source: RelayEventSource;
  runId: string | null;
  codexThreadId: string | null;
};

export type ClarificationQuestionStore = {
  schemaVersion: number;
  ticketId: string;
  questions: ClarificationQuestion[];
};

export type ClarificationQuestionCreateInput = {
  question: string;
  answerType?: ClarificationAnswerType;
};

export type ClarificationAnswerInput = {
  projectPath: string;
  ticketId: string;
  questionId: string;
  answer: string;
};

export type RelayAuditEvent = {
  schemaVersion: number;
  timestamp: string;
  actor: RelayActor;
  source: RelayEventSource;
  eventType: "ticket.status_changed" | "clarification.question_created" | "clarification.answer_submitted";
  ticketId?: string;
  runId?: string | null;
  payload: Record<string, unknown>;
};

export type AddProjectResult = {
  project: ProjectSummary;
  initialized: boolean;
};

export type AppRegistry = {
  schemaVersion: number;
  projects: Array<{
    path: string;
    pinned: boolean;
    lastOpenedAt: string;
    sidebarPosition: number;
  }>;
  ui: {
    lastProjectPath: string | null;
    theme: ThemePreference;
  };
};

export type RelayCodexEvent =
  | { type: "run.started"; runId: string; threadId: string; timestamp: string }
  | { type: "agent.message.delta"; text: string; timestamp: string }
  | { type: "agent.message.completed"; text: string; timestamp: string }
  | { type: "command.started"; command: string; cwd?: string; timestamp: string }
  | { type: "command.output"; stream: "stdout" | "stderr"; text: string; timestamp: string }
  | { type: "command.completed"; status: "completed" | "failed" | "declined"; timestamp: string }
  | { type: "file.change"; path: string; summary?: string; timestamp: string }
  | { type: "web.search"; query: string; timestamp: string }
  | { type: "todo.updated"; items: Array<{ text: string; completed: boolean }>; timestamp: string }
  | {
      type: "mcp.tool_call";
      server: string;
      tool: string;
      status: "in_progress" | "completed" | "failed";
      error?: string;
      timestamp: string;
    }
  | { type: "approval.requested"; approvalId: string; kind: "command" | "file-change" | "network" | "other"; payload: unknown; timestamp: string }
  | { type: "approval.resolved"; approvalId: string; decision: string; timestamp: string }
  | { type: "ticket.status_changed"; fromStatus: string; toStatus: string; actor: RelayActor; source: RelayEventSource; timestamp: string }
  | { type: "clarification.requested"; questions: ClarificationQuestion[]; timestamp: string }
  | { type: "run.completed"; finalResponse: string; usage?: unknown; finalStatus?: RunStatus; timestamp: string }
  | { type: "run.failed"; message: string; details?: unknown; finalStatus?: RunStatus; timestamp: string };

export type RendererRunEvent = RelayCodexEvent & {
  projectPath: string;
  ticketId: string;
  runId: string;
};

export type RelayApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export type CodexStatus = {
  sdkAvailable: boolean;
  cliAvailable: boolean;
  cliVersion: string | null;
  authenticated: boolean | null;
  message: string;
};

export type StartRunInput = {
  projectPath: string;
  ticketId: string;
  freshThread?: boolean;
};

export type CodexRunStartResult = {
  state: "queued" | "started";
  runId: string;
  threadId: string | null;
};

export type CodexRunPreflightResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  ticketStatus: string | null;
  runStatus: RunStatus | null;
  unansweredClarificationCount: number;
  canStartFreshThread: boolean;
};

export type CreateDraftInput = {
  projectPath: string;
  idea: string;
  preferredTicketType?: TicketType;
  ticketId?: string;
};

export type RunLogLine = {
  schemaVersion: number;
  timestamp: string;
  ticketId: string;
  runId: string;
  threadId: string;
  type: RelayCodexEvent["type"];
  payload: Record<string, unknown>;
};

export type RunUsageSummary = {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningOutputTokens: number | null;
  totalTokens: number | null;
};

export type RunSummary = {
  schemaVersion: number;
  ticketId: string;
  runId: string;
  threadId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  finalStatus: RunStatus | null;
  usage: RunUsageSummary | null;
  eventCount: number;
  latestEventAt: string | null;
};

export type RelayApi = {
  projects: {
    list: () => Promise<ProjectSummary[]>;
    addFolder: () => Promise<AddProjectResult | null>;
    removeFromSidebar: (projectPath: string) => Promise<ProjectSummary[]>;
    read: (projectPath: string) => Promise<ProjectSummary>;
    gitMetadata: (projectPath: string, options?: GitMetadataOptions) => Promise<GitMetadata>;
    revealInFinder: (projectPath: string) => Promise<void>;
  };
  board: {
    read: (projectPath: string) => Promise<BoardSnapshot>;
  };
  ticket: {
    createDraft: (input: CreateDraftInput) => Promise<TicketDraftStartResult>;
    createManual: (projectPath: string, input: TicketCreateInput) => Promise<TicketRecord>;
    createSubticket: (input: EpicSubticketCreateInput) => Promise<TicketRecord>;
    linkSubticket: (input: EpicSubticketLinkInput) => Promise<BoardSnapshot>;
    unlinkSubticket: (input: EpicSubticketUnlinkInput) => Promise<BoardSnapshot>;
    startAgentUpdate: (input: AgentTicketUpdateInput) => Promise<AgentTicketUpdateStartResult>;
    cancelAgentUpdate: (runId: string) => Promise<void>;
    references: (projectPath: string) => Promise<TicketReferenceCandidate[]>;
    read: (projectPath: string, ticketId: string) => Promise<TicketRecord>;
    save: (input: TicketSaveInput) => Promise<TicketRecord>;
    saveAttachment: (input: TicketAttachmentSaveInput) => Promise<TicketAttachmentSaveResult>;
    move: (input: TicketMoveInput) => Promise<BoardSnapshot>;
    clarifications: (projectPath: string, ticketId: string) => Promise<ClarificationQuestion[]>;
    answerClarification: (input: ClarificationAnswerInput) => Promise<ClarificationQuestion>;
    delete: (projectPath: string, ticketId: string) => Promise<BoardSnapshot>;
    duplicate: (projectPath: string, ticketId: string) => Promise<TicketRecord>;
    revealFile: (projectPath: string, ticketId: string) => Promise<void>;
  };
  codex: {
    status: () => Promise<CodexStatus>;
    preflightRun: (input: StartRunInput) => Promise<CodexRunPreflightResult>;
    startRun: (input: StartRunInput) => Promise<CodexRunStartResult>;
    resumeRun: (input: StartRunInput) => Promise<CodexRunStartResult>;
    cancelRun: (runId: string) => Promise<void>;
    approveAction: (approvalId: string, decision: RelayApprovalDecision) => Promise<void>;
    readRunEvents: (projectPath: string, ticketId: string, runId: string) => Promise<RendererRunEvent[]>;
    readLatestRunSummary: (projectPath: string, ticketId: string) => Promise<RunSummary | null>;
    onRunEvent: (listener: (event: RendererRunEvent) => void) => () => void;
  };
};
