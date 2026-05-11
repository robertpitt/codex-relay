import { contextBridge, ipcRenderer } from "electron";
import type {
  ClarificationAnswerInput,
  CreateDraftInput,
  RelayApi,
  RelayApprovalDecision,
  RendererRunEvent,
  StartRunInput,
  TicketCreateInput,
  TicketMoveInput,
  TicketSaveInput
} from "../shared/types";

const api: RelayApi = {
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    addFolder: () => ipcRenderer.invoke("projects:addFolder"),
    removeFromSidebar: (projectPath: string) => ipcRenderer.invoke("projects:removeFromSidebar", projectPath),
    read: (projectPath: string) => ipcRenderer.invoke("projects:read", projectPath),
    revealInFinder: (projectPath: string) => ipcRenderer.invoke("projects:revealInFinder", projectPath)
  },
  board: {
    read: (projectPath: string) => ipcRenderer.invoke("board:read", projectPath)
  },
  ticket: {
    createDraft: (input: CreateDraftInput) => ipcRenderer.invoke("ticket:createDraft", input),
    createManual: (projectPath: string, input: TicketCreateInput) => ipcRenderer.invoke("ticket:createManual", projectPath, input),
    read: (projectPath: string, ticketId: string) => ipcRenderer.invoke("ticket:read", projectPath, ticketId),
    save: (input: TicketSaveInput) => ipcRenderer.invoke("ticket:save", input),
    move: (input: TicketMoveInput) => ipcRenderer.invoke("ticket:move", input),
    clarifications: (projectPath: string, ticketId: string) => ipcRenderer.invoke("ticket:clarifications", projectPath, ticketId),
    answerClarification: (input: ClarificationAnswerInput) => ipcRenderer.invoke("ticket:answerClarification", input),
    delete: (projectPath: string, ticketId: string) => ipcRenderer.invoke("ticket:delete", projectPath, ticketId),
    duplicate: (projectPath: string, ticketId: string) => ipcRenderer.invoke("ticket:duplicate", projectPath, ticketId),
    revealFile: (projectPath: string, ticketId: string) => ipcRenderer.invoke("ticket:revealFile", projectPath, ticketId)
  },
  codex: {
    status: () => ipcRenderer.invoke("codex:status"),
    startRun: (input: StartRunInput) => ipcRenderer.invoke("codex:startRun", input),
    resumeRun: (input: StartRunInput) => ipcRenderer.invoke("codex:resumeRun", input),
    cancelRun: (runId: string) => ipcRenderer.invoke("codex:cancelRun", runId),
    approveAction: (approvalId: string, decision: RelayApprovalDecision) => ipcRenderer.invoke("codex:approveAction", approvalId, decision),
    readRunEvents: (projectPath: string, ticketId: string, runId: string) =>
      ipcRenderer.invoke("codex:readRunEvents", projectPath, ticketId, runId),
    onRunEvent: (listener: (event: RendererRunEvent) => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: RendererRunEvent): void => listener(payload);
      ipcRenderer.on("codex:runEvent", wrapped);
      return () => ipcRenderer.removeListener("codex:runEvent", wrapped);
    }
  }
};

contextBridge.exposeInMainWorld("relay", api);
