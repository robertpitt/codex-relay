import type {
  AddProjectResult,
  AgentTicketUpdateInput,
  AgentTicketUpdateStartResult,
  BoardSnapshot,
  ClarificationAnswerInput,
  ClarificationQuestion,
  CodexRunStartResult,
  CodexRunPreflightResult,
  CodexStatus,
  CreateDraftInput,
  EpicSubticketCreateInput,
  EpicSubticketLinkInput,
  EpicSubticketUnlinkInput,
  GitMetadata,
  GitMetadataOptions,
  ProjectSummary,
  RelayApprovalDecision,
  RepositoryChatInput,
  RepositoryChatResponse,
  RendererRunEvent,
  RunSummary,
  StartRunInput,
  TicketAttachmentSaveInput,
  TicketAttachmentSaveResult,
  TicketCreateInput,
  TicketDraftStartResult,
  TicketMoveInput,
  TicketRecord,
  TicketReferenceCandidate,
  TicketSaveInput,
  TicketSuggestionsGenerateResult
} from "./types";

export type RelayIpcContract = {
  "projects:list": { args: []; result: ProjectSummary[] };
  "projects:addFolder": { args: []; result: AddProjectResult | null };
  "projects:removeFromSidebar": { args: [projectPath: string]; result: ProjectSummary[] };
  "projects:read": { args: [projectPath: string]; result: ProjectSummary };
  "projects:gitMetadata": { args: [projectPath: string, options?: GitMetadataOptions]; result: GitMetadata };
  "projects:revealInFinder": { args: [projectPath: string]; result: void };
  "board:read": { args: [projectPath: string]; result: BoardSnapshot };
  "ticket:createDraft": { args: [input: CreateDraftInput]; result: TicketDraftStartResult };
  "ticket:generateSuggestions": { args: [projectPath: string]; result: TicketSuggestionsGenerateResult };
  "ticket:createManual": { args: [projectPath: string, input: TicketCreateInput]; result: TicketRecord };
  "ticket:createSubticket": { args: [input: EpicSubticketCreateInput]; result: TicketRecord };
  "ticket:linkSubticket": { args: [input: EpicSubticketLinkInput]; result: BoardSnapshot };
  "ticket:unlinkSubticket": { args: [input: EpicSubticketUnlinkInput]; result: BoardSnapshot };
  "ticket:startAgentUpdate": { args: [input: AgentTicketUpdateInput]; result: AgentTicketUpdateStartResult };
  "ticket:cancelAgentUpdate": { args: [runId: string]; result: void };
  "ticket:references": { args: [projectPath: string]; result: TicketReferenceCandidate[] };
  "ticket:read": { args: [projectPath: string, ticketId: string]; result: TicketRecord };
  "ticket:save": { args: [input: TicketSaveInput]; result: TicketRecord };
  "ticket:saveAttachment": { args: [input: TicketAttachmentSaveInput]; result: TicketAttachmentSaveResult };
  "ticket:move": { args: [input: TicketMoveInput]; result: BoardSnapshot };
  "ticket:clarifications": { args: [projectPath: string, ticketId: string]; result: ClarificationQuestion[] };
  "ticket:answerClarification": { args: [input: ClarificationAnswerInput]; result: ClarificationQuestion };
  "ticket:delete": { args: [projectPath: string, ticketId: string]; result: BoardSnapshot };
  "ticket:duplicate": { args: [projectPath: string, ticketId: string]; result: TicketRecord };
  "ticket:revealFile": { args: [projectPath: string, ticketId: string]; result: void };
  "codex:status": { args: []; result: CodexStatus };
  "codex:preflightRun": { args: [input: StartRunInput]; result: CodexRunPreflightResult };
  "codex:startRun": { args: [input: StartRunInput]; result: CodexRunStartResult };
  "codex:resumeRun": { args: [input: StartRunInput]; result: CodexRunStartResult };
  "codex:cancelRun": { args: [runId: string]; result: void };
  "codex:approveAction": { args: [approvalId: string, decision: RelayApprovalDecision]; result: void };
  "codex:sendRepositoryChatMessage": { args: [input: RepositoryChatInput]; result: RepositoryChatResponse };
  "codex:readRunEvents": { args: [projectPath: string, ticketId: string, runId: string]; result: RendererRunEvent[] };
  "codex:readLatestRunSummary": { args: [projectPath: string, ticketId: string]; result: RunSummary | null };
};

export type RelayIpcChannel = keyof RelayIpcContract;
export type RelayIpcArgs<Channel extends RelayIpcChannel> = RelayIpcContract[Channel]["args"];
export type RelayIpcResult<Channel extends RelayIpcChannel> = RelayIpcContract[Channel]["result"];

export const relayIpcChannels = {
  projectsList: "projects:list",
  projectsAddFolder: "projects:addFolder",
  projectsRemoveFromSidebar: "projects:removeFromSidebar",
  projectsRead: "projects:read",
  projectsGitMetadata: "projects:gitMetadata",
  projectsRevealInFinder: "projects:revealInFinder",
  boardRead: "board:read",
  ticketCreateDraft: "ticket:createDraft",
  ticketGenerateSuggestions: "ticket:generateSuggestions",
  ticketCreateManual: "ticket:createManual",
  ticketCreateSubticket: "ticket:createSubticket",
  ticketLinkSubticket: "ticket:linkSubticket",
  ticketUnlinkSubticket: "ticket:unlinkSubticket",
  ticketStartAgentUpdate: "ticket:startAgentUpdate",
  ticketCancelAgentUpdate: "ticket:cancelAgentUpdate",
  ticketReferences: "ticket:references",
  ticketRead: "ticket:read",
  ticketSave: "ticket:save",
  ticketSaveAttachment: "ticket:saveAttachment",
  ticketMove: "ticket:move",
  ticketClarifications: "ticket:clarifications",
  ticketAnswerClarification: "ticket:answerClarification",
  ticketDelete: "ticket:delete",
  ticketDuplicate: "ticket:duplicate",
  ticketRevealFile: "ticket:revealFile",
  codexStatus: "codex:status",
  codexPreflightRun: "codex:preflightRun",
  codexStartRun: "codex:startRun",
  codexResumeRun: "codex:resumeRun",
  codexCancelRun: "codex:cancelRun",
  codexApproveAction: "codex:approveAction",
  codexSendRepositoryChatMessage: "codex:sendRepositoryChatMessage",
  codexReadRunEvents: "codex:readRunEvents",
  codexReadLatestRunSummary: "codex:readLatestRunSummary"
} as const satisfies Record<string, RelayIpcChannel>;
