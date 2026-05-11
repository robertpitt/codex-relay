export const RELAY_SCHEMA_VERSION = 1;

export const DEFAULT_COLUMNS: RelayColumn[] = [
  { id: "todo", name: "Todo", position: 1000, terminal: false },
  { id: "in_progress", name: "In Progress", position: 2000, terminal: false },
  { id: "needs_clarification", name: "Needs Clarification", position: 3000, terminal: false },
  { id: "not_doing", name: "Not Doing", position: 4000, terminal: true },
  { id: "completed", name: "Completed", position: 5000, terminal: true }
];

export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type RunStatus = "idle" | "drafting" | "running" | "blocked" | "failed" | "completed" | "cancelled";
export type ProjectHealth = "ok" | "warning" | "error";
export type ThemePreference = "system" | "light" | "dark";
export type RelayActor = "user" | "codex" | "system";
export type RelayEventSource =
  | "manual_board"
  | "manual_ticket_edit"
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
  defaultApprovalPolicy: "untrusted" | "on-request" | "never";
  defaultSandboxMode: "read-only" | "workspace-write" | "danger-full-access";
  allowNonGitCodexRuns: boolean;
  ticketDraftingEnabled: boolean;
  codexExecutionEnabled: boolean;
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
  lastOpenedAt?: string;
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
  status: string;
  position: number;
  priority: TicketPriority;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  codexThreadId: string | null;
  runStatus: RunStatus;
  lastRunId: string | null;
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

export type TicketDraft = {
  title: string;
  priority: TicketPriority;
  labels: string[];
  context: string;
  requirements: string[];
  acceptanceCriteria: string[];
  clarificationQuestions: string[];
  implementationNotes: string[];
};

export type TicketDraftErrorCode =
  | "codex_unavailable"
  | "codex_unauthenticated"
  | "timeout"
  | "cancelled"
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

export type TicketCreateInput = {
  title: string;
  priority: TicketPriority;
  labels: string[];
  markdown: string;
  status?: string;
};

export type TicketSaveInput = {
  projectPath: string;
  ticket: TicketRecord;
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
  | { type: "approval.requested"; approvalId: string; kind: "command" | "file-change" | "network" | "other"; payload: unknown; timestamp: string }
  | { type: "approval.resolved"; approvalId: string; decision: string; timestamp: string }
  | { type: "ticket.status_changed"; fromStatus: string; toStatus: string; actor: RelayActor; source: RelayEventSource; timestamp: string }
  | { type: "clarification.requested"; questions: ClarificationQuestion[]; timestamp: string }
  | { type: "run.completed"; finalResponse: string; usage?: unknown; timestamp: string }
  | { type: "run.failed"; message: string; details?: unknown; timestamp: string };

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

export type CreateDraftInput = {
  projectPath: string;
  idea: string;
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
    createDraft: (input: CreateDraftInput) => Promise<TicketDraftResult>;
    createManual: (projectPath: string, input: TicketCreateInput) => Promise<TicketRecord>;
    read: (projectPath: string, ticketId: string) => Promise<TicketRecord>;
    save: (input: TicketSaveInput) => Promise<TicketRecord>;
    move: (input: TicketMoveInput) => Promise<BoardSnapshot>;
    clarifications: (projectPath: string, ticketId: string) => Promise<ClarificationQuestion[]>;
    answerClarification: (input: ClarificationAnswerInput) => Promise<ClarificationQuestion>;
    delete: (projectPath: string, ticketId: string) => Promise<BoardSnapshot>;
    duplicate: (projectPath: string, ticketId: string) => Promise<TicketRecord>;
    revealFile: (projectPath: string, ticketId: string) => Promise<void>;
  };
  codex: {
    status: () => Promise<CodexStatus>;
    startRun: (input: StartRunInput) => Promise<{ runId: string; threadId: string }>;
    resumeRun: (input: StartRunInput) => Promise<{ runId: string; threadId: string }>;
    cancelRun: (runId: string) => Promise<void>;
    approveAction: (approvalId: string, decision: RelayApprovalDecision) => Promise<void>;
    readRunEvents: (projectPath: string, ticketId: string, runId: string) => Promise<RendererRunEvent[]>;
    onRunEvent: (listener: (event: RendererRunEvent) => void) => () => void;
  };
};
