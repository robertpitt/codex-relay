import { contextBridge, ipcRenderer } from "electron";
import { relayIpcChannels, type RelayIpcArgs, type RelayIpcChannel, type RelayIpcResult } from "../shared/ipc";
import type {
  AgentTicketUpdateInput,
  ClarificationAnswerInput,
  CreateDraftInput,
  EpicSubticketCreateInput,
  EpicSubticketLinkInput,
  EpicSubticketUnlinkInput,
  GitMetadataOptions,
  RelayApi,
  RelayApprovalDecision,
  RendererRunEvent,
  StartRunInput,
  TicketAttachmentSaveInput,
  TicketCreateInput,
  TicketMoveInput,
  TicketSaveInput
} from "../shared/types";

const invoke = <Channel extends RelayIpcChannel>(
  channel: Channel,
  ...args: RelayIpcArgs<Channel>
): Promise<RelayIpcResult<Channel>> => ipcRenderer.invoke(channel, ...args) as Promise<RelayIpcResult<Channel>>;

const api: RelayApi = {
  projects: {
    list: () => invoke(relayIpcChannels.projectsList),
    addFolder: () => invoke(relayIpcChannels.projectsAddFolder),
    removeFromSidebar: (projectPath: string) => invoke(relayIpcChannels.projectsRemoveFromSidebar, projectPath),
    read: (projectPath: string) => invoke(relayIpcChannels.projectsRead, projectPath),
    gitMetadata: (projectPath: string, options?: GitMetadataOptions) => invoke(relayIpcChannels.projectsGitMetadata, projectPath, options),
    revealInFinder: (projectPath: string) => invoke(relayIpcChannels.projectsRevealInFinder, projectPath)
  },
  board: {
    read: (projectPath: string) => invoke(relayIpcChannels.boardRead, projectPath)
  },
  ticket: {
    createDraft: (input: CreateDraftInput) => invoke(relayIpcChannels.ticketCreateDraft, input),
    createManual: (projectPath: string, input: TicketCreateInput) => invoke(relayIpcChannels.ticketCreateManual, projectPath, input),
    createSubticket: (input: EpicSubticketCreateInput) => invoke(relayIpcChannels.ticketCreateSubticket, input),
    linkSubticket: (input: EpicSubticketLinkInput) => invoke(relayIpcChannels.ticketLinkSubticket, input),
    unlinkSubticket: (input: EpicSubticketUnlinkInput) => invoke(relayIpcChannels.ticketUnlinkSubticket, input),
    startAgentUpdate: (input: AgentTicketUpdateInput) => invoke(relayIpcChannels.ticketStartAgentUpdate, input),
    cancelAgentUpdate: (runId: string) => invoke(relayIpcChannels.ticketCancelAgentUpdate, runId),
    references: (projectPath: string) => invoke(relayIpcChannels.ticketReferences, projectPath),
    read: (projectPath: string, ticketId: string) => invoke(relayIpcChannels.ticketRead, projectPath, ticketId),
    save: (input: TicketSaveInput) => invoke(relayIpcChannels.ticketSave, input),
    saveAttachment: (input: TicketAttachmentSaveInput) => invoke(relayIpcChannels.ticketSaveAttachment, input),
    move: (input: TicketMoveInput) => invoke(relayIpcChannels.ticketMove, input),
    clarifications: (projectPath: string, ticketId: string) => invoke(relayIpcChannels.ticketClarifications, projectPath, ticketId),
    answerClarification: (input: ClarificationAnswerInput) => invoke(relayIpcChannels.ticketAnswerClarification, input),
    delete: (projectPath: string, ticketId: string) => invoke(relayIpcChannels.ticketDelete, projectPath, ticketId),
    duplicate: (projectPath: string, ticketId: string) => invoke(relayIpcChannels.ticketDuplicate, projectPath, ticketId),
    revealFile: (projectPath: string, ticketId: string) => invoke(relayIpcChannels.ticketRevealFile, projectPath, ticketId)
  },
  codex: {
    status: () => invoke(relayIpcChannels.codexStatus),
    preflightRun: (input: StartRunInput) => invoke(relayIpcChannels.codexPreflightRun, input),
    startRun: (input: StartRunInput) => invoke(relayIpcChannels.codexStartRun, input),
    resumeRun: (input: StartRunInput) => invoke(relayIpcChannels.codexResumeRun, input),
    cancelRun: (runId: string) => invoke(relayIpcChannels.codexCancelRun, runId),
    approveAction: (approvalId: string, decision: RelayApprovalDecision) => invoke(relayIpcChannels.codexApproveAction, approvalId, decision),
    readRunEvents: (projectPath: string, ticketId: string, runId: string) =>
      invoke(relayIpcChannels.codexReadRunEvents, projectPath, ticketId, runId),
    readLatestRunSummary: (projectPath: string, ticketId: string) =>
      invoke(relayIpcChannels.codexReadLatestRunSummary, projectPath, ticketId),
    onRunEvent: (listener: (event: RendererRunEvent) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: RendererRunEvent): void => listener(payload);
      ipcRenderer.on("codex:runEvent", wrapped);
      return () => ipcRenderer.removeListener("codex:runEvent", wrapped);
    }
  }
};

contextBridge.exposeInMainWorld("relay", api);
