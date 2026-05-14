/**
 * Ticket storage operations over Relay markdown ticket files.
 */
import { Context, Layer } from "effect";
import type {
  BoardSnapshot,
  CreateDraftInput,
  EpicSubticketCreateInput,
  TicketCreateInput,
  TicketDraft,
  TicketDraftResearch,
  TicketMoveInput,
  TicketRecord,
  TicketReferenceCandidate,
  TicketSaveInput,
  TicketSummary
} from "@shared/types";
import * as FileSystemStorage from "../filesystem";
import type { StatusTransitionOptions } from "../filesystem";
import { ticketPath, ticketsPath } from "../paths";
import { storeRead, storeWrite, type StoreEffect } from "./effects";

export type TicketStoreService = {
  readonly list: (projectPath: string) => StoreEffect<TicketSummary[]>;
  readonly read: (projectPath: string, ticketId: string) => StoreEffect<TicketRecord>;
  readonly write: (projectPath: string, ticket: TicketRecord) => StoreEffect<TicketRecord>;
  readonly create: (projectPath: string, input: TicketCreateInput) => StoreEffect<TicketRecord>;
  readonly createSubticket: (input: EpicSubticketCreateInput) => StoreEffect<TicketRecord>;
  readonly linkSubticket: (projectPath: string, epicId: string, ticketId: string) => StoreEffect<BoardSnapshot>;
  readonly unlinkSubticket: (projectPath: string, epicId: string, ticketId: string) => StoreEffect<BoardSnapshot>;
  readonly createPendingDraft: (projectPath: string, input: CreateDraftInput, runId: string) => StoreEffect<TicketRecord>;
  readonly applyDraft: (projectPath: string, ticketId: string, draft: TicketDraft, runId: string) => StoreEffect<TicketRecord>;
  readonly failPendingDraft: (
    projectPath: string,
    ticketId: string,
    idea: string,
    runId: string,
    message: string
  ) => StoreEffect<TicketRecord>;
  readonly blockPendingDraftForClarification: (
    projectPath: string,
    ticketId: string,
    idea: string,
    runId: string,
    questions: readonly string[],
    research?: TicketDraftResearch
  ) => StoreEffect<TicketRecord>;
  readonly transitionStatus: (
    projectPath: string,
    ticketId: string,
    targetStatus: string,
    options: StatusTransitionOptions
  ) => StoreEffect<TicketRecord>;
  readonly setQueued: (projectPath: string, ticketId: string, runId: string) => StoreEffect<TicketRecord>;
  readonly clearQueued: (
    projectPath: string,
    ticketId: string,
    targetStatus?: string | null,
    expectedRunId?: string | null
  ) => StoreEffect<TicketRecord>;
  readonly listQueuedReady: (projectPath: string) => StoreEffect<TicketSummary[]>;
  readonly listReferences: (projectPath: string) => StoreEffect<TicketReferenceCandidate[]>;
  readonly save: (input: TicketSaveInput) => StoreEffect<TicketRecord>;
  readonly move: (input: TicketMoveInput) => StoreEffect<BoardSnapshot>;
  readonly delete: (projectPath: string, ticketId: string) => StoreEffect<BoardSnapshot>;
  readonly duplicate: (projectPath: string, ticketId: string) => StoreEffect<TicketRecord>;
  readonly reveal: (projectPath: string, ticketId: string) => StoreEffect<void>;
};

export const TicketStore = Context.Service<TicketStoreService>("relay/storage/TicketStore");

export const makeFileSystemTicketStore = (): TicketStoreService => ({
  list: (projectPath) =>
    storeRead(ticketsPath(projectPath), "List Relay tickets", async () => (await FileSystemStorage.readBoard(projectPath)).tickets),
  read: (projectPath, ticketId) =>
    storeRead(ticketPath(projectPath, ticketId), "Read Relay ticket", () => FileSystemStorage.readTicket(projectPath, ticketId)),
  write: (projectPath, ticket) =>
    storeWrite(ticket.filePath, "Write Relay ticket", () => FileSystemStorage.writeTicket(projectPath, ticket)),
  create: (projectPath, input) =>
    storeWrite(ticketsPath(projectPath), "Create Relay ticket", () => FileSystemStorage.createTicket(projectPath, input)),
  createSubticket: (input) =>
    storeWrite(ticketsPath(input.projectPath), "Create Relay subticket", () => FileSystemStorage.createSubticket(input)),
  linkSubticket: (projectPath, epicId, ticketId) =>
    storeWrite(ticketPath(projectPath, epicId), "Link Relay subticket", () =>
      FileSystemStorage.linkSubticket(projectPath, epicId, ticketId)
    ),
  unlinkSubticket: (projectPath, epicId, ticketId) =>
    storeWrite(ticketPath(projectPath, epicId), "Unlink Relay subticket", () =>
      FileSystemStorage.unlinkSubticket(projectPath, epicId, ticketId)
    ),
  createPendingDraft: (projectPath, input, runId) =>
    storeWrite(ticketsPath(projectPath), "Create pending Relay ticket draft", () =>
      FileSystemStorage.createPendingTicketDraft(projectPath, input, runId)
    ),
  applyDraft: (projectPath, ticketId, draft, runId) =>
    storeWrite(ticketPath(projectPath, ticketId), "Apply Relay ticket draft", () =>
      FileSystemStorage.applyTicketDraftToTicket(projectPath, ticketId, draft, runId)
    ),
  failPendingDraft: (projectPath, ticketId, idea, runId, message) =>
    storeWrite(ticketPath(projectPath, ticketId), "Fail pending Relay ticket draft", () =>
      FileSystemStorage.failPendingTicketDraft(projectPath, ticketId, idea, runId, message)
    ),
  blockPendingDraftForClarification: (projectPath, ticketId, idea, runId, questions, research) =>
    storeWrite(ticketPath(projectPath, ticketId), "Block Relay ticket draft for clarification", () =>
      FileSystemStorage.blockPendingTicketDraftForClarification(projectPath, ticketId, idea, runId, questions, research)
    ),
  transitionStatus: (projectPath, ticketId, targetStatus, options) =>
    storeWrite(ticketPath(projectPath, ticketId), "Transition Relay ticket status", () =>
      FileSystemStorage.transitionTicketStatus(projectPath, ticketId, targetStatus, options)
    ),
  setQueued: (projectPath, ticketId, runId) =>
    storeWrite(ticketPath(projectPath, ticketId), "Mark Relay ticket queued", () =>
      FileSystemStorage.setTicketQueued(projectPath, ticketId, runId)
    ),
  clearQueued: (projectPath, ticketId, targetStatus, expectedRunId) =>
    storeWrite(ticketPath(projectPath, ticketId), "Clear Relay ticket queue state", () =>
      FileSystemStorage.clearQueuedTicket(projectPath, ticketId, targetStatus, expectedRunId)
    ),
  listQueuedReady: (projectPath) =>
    storeRead(ticketsPath(projectPath), "List queued ready Relay tickets", () => FileSystemStorage.listQueuedReadyTickets(projectPath)),
  listReferences: (projectPath) =>
    storeRead(ticketsPath(projectPath), "List Relay ticket references", () =>
      FileSystemStorage.listTicketReferenceCandidates(projectPath)
    ),
  save: (input) =>
    storeWrite(ticketPath(input.projectPath, input.ticket.frontMatter.id), "Save Relay ticket", () => FileSystemStorage.saveTicket(input)),
  move: (input) =>
    storeWrite(ticketPath(input.projectPath, input.ticketId), "Move Relay ticket", () => FileSystemStorage.moveTicket(input)),
  delete: (projectPath, ticketId) =>
    storeWrite(ticketPath(projectPath, ticketId), "Delete Relay ticket", () => FileSystemStorage.deleteTicket(projectPath, ticketId)),
  duplicate: (projectPath, ticketId) =>
    storeWrite(ticketPath(projectPath, ticketId), "Duplicate Relay ticket", () => FileSystemStorage.duplicateTicket(projectPath, ticketId)),
  reveal: (projectPath, ticketId) =>
    storeRead(ticketPath(projectPath, ticketId), "Reveal Relay ticket file", () => FileSystemStorage.revealTicketFile(projectPath, ticketId))
});

export const FileSystemTicketStoreLive = Layer.succeed(TicketStore)(makeFileSystemTicketStore());
