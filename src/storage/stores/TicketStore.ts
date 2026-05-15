/**
 * Ticket storage operations over Relay markdown ticket files.
 */
import { Context, Layer, Path } from "effect";
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
} from "@shared/schemas";
import * as FileSystemStorage from "../filesystem";
import type { StatusTransitionOptions } from "../filesystem";
import { ticketPath, ticketsPath } from "../paths";
import { storeRead, storeWrite, type StoreEffect } from "./effects";

export type TicketStoreService = {
  readonly list: (projectPath: string) => StoreEffect<TicketSummary[], Path.Path>;
  readonly read: (projectPath: string, ticketId: string) => StoreEffect<TicketRecord, Path.Path>;
  readonly write: (projectPath: string, ticket: TicketRecord) => StoreEffect<TicketRecord>;
  readonly create: (projectPath: string, input: TicketCreateInput) => StoreEffect<TicketRecord, Path.Path>;
  readonly createSubticket: (input: EpicSubticketCreateInput) => StoreEffect<TicketRecord, Path.Path>;
  readonly linkSubticket: (projectPath: string, epicId: string, ticketId: string) => StoreEffect<BoardSnapshot, Path.Path>;
  readonly unlinkSubticket: (projectPath: string, epicId: string, ticketId: string) => StoreEffect<BoardSnapshot, Path.Path>;
  readonly createPendingDraft: (projectPath: string, input: CreateDraftInput, runId: string) => StoreEffect<TicketRecord, Path.Path>;
  readonly applyDraft: (projectPath: string, ticketId: string, draft: TicketDraft, runId: string) => StoreEffect<TicketRecord, Path.Path>;
  readonly failPendingDraft: (
    projectPath: string,
    ticketId: string,
    idea: string,
    runId: string,
    message: string
  ) => StoreEffect<TicketRecord, Path.Path>;
  readonly blockPendingDraftForClarification: (
    projectPath: string,
    ticketId: string,
    idea: string,
    runId: string,
    questions: readonly string[],
    research?: TicketDraftResearch
  ) => StoreEffect<TicketRecord, Path.Path>;
  readonly transitionStatus: (
    projectPath: string,
    ticketId: string,
    targetStatus: string,
    options: StatusTransitionOptions
  ) => StoreEffect<TicketRecord, Path.Path>;
  readonly setQueued: (projectPath: string, ticketId: string, runId: string) => StoreEffect<TicketRecord, Path.Path>;
  readonly clearQueued: (
    projectPath: string,
    ticketId: string,
    targetStatus?: string | null,
    expectedRunId?: string | null
  ) => StoreEffect<TicketRecord, Path.Path>;
  readonly listQueuedReady: (projectPath: string) => StoreEffect<TicketSummary[], Path.Path>;
  readonly listReferences: (projectPath: string) => StoreEffect<TicketReferenceCandidate[], Path.Path>;
  readonly save: (input: TicketSaveInput) => StoreEffect<TicketRecord, Path.Path>;
  readonly move: (input: TicketMoveInput) => StoreEffect<BoardSnapshot, Path.Path>;
  readonly delete: (projectPath: string, ticketId: string) => StoreEffect<BoardSnapshot, Path.Path>;
  readonly duplicate: (projectPath: string, ticketId: string) => StoreEffect<TicketRecord, Path.Path>;
  readonly reveal: (projectPath: string, ticketId: string) => StoreEffect<void, Path.Path>;
};

export const TicketStore = Context.Service<TicketStoreService>("relay/storage/TicketStore");

const readAt = <A>(target: (path: Path.Path) => string, operation: string, evaluate: () => PromiseLike<A>): StoreEffect<A, Path.Path> =>
  Path.Path.use((path) => storeRead(target(path), operation, evaluate));

const writeAt = <A>(target: (path: Path.Path) => string, operation: string, evaluate: () => PromiseLike<A>): StoreEffect<A, Path.Path> =>
  Path.Path.use((path) => storeWrite(target(path), operation, evaluate));

export const makeFileSystemTicketStore = (): TicketStoreService => ({
  list: (projectPath) =>
    readAt((path) => ticketsPath(path, projectPath), "List Relay tickets", async () => (await FileSystemStorage.readBoard(projectPath)).tickets),
  read: (projectPath, ticketId) =>
    readAt((path) => ticketPath(path, projectPath, ticketId), "Read Relay ticket", () => FileSystemStorage.readTicket(projectPath, ticketId)),
  write: (projectPath, ticket) =>
    storeWrite(ticket.filePath, "Write Relay ticket", () => FileSystemStorage.writeTicket(projectPath, ticket)),
  create: (projectPath, input) =>
    writeAt((path) => ticketsPath(path, projectPath), "Create Relay ticket", () => FileSystemStorage.createTicket(projectPath, input)),
  createSubticket: (input) =>
    writeAt((path) => ticketsPath(path, input.projectPath), "Create Relay subticket", () => FileSystemStorage.createSubticket(input)),
  linkSubticket: (projectPath, epicId, ticketId) =>
    writeAt((path) => ticketPath(path, projectPath, epicId), "Link Relay subticket", () =>
      FileSystemStorage.linkSubticket(projectPath, epicId, ticketId)
    ),
  unlinkSubticket: (projectPath, epicId, ticketId) =>
    writeAt((path) => ticketPath(path, projectPath, epicId), "Unlink Relay subticket", () =>
      FileSystemStorage.unlinkSubticket(projectPath, epicId, ticketId)
    ),
  createPendingDraft: (projectPath, input, runId) =>
    writeAt((path) => ticketsPath(path, projectPath), "Create pending Relay ticket draft", () =>
      FileSystemStorage.createPendingTicketDraft(projectPath, input, runId)
    ),
  applyDraft: (projectPath, ticketId, draft, runId) =>
    writeAt((path) => ticketPath(path, projectPath, ticketId), "Apply Relay ticket draft", () =>
      FileSystemStorage.applyTicketDraftToTicket(projectPath, ticketId, draft, runId)
    ),
  failPendingDraft: (projectPath, ticketId, idea, runId, message) =>
    writeAt((path) => ticketPath(path, projectPath, ticketId), "Fail pending Relay ticket draft", () =>
      FileSystemStorage.failPendingTicketDraft(projectPath, ticketId, idea, runId, message)
    ),
  blockPendingDraftForClarification: (projectPath, ticketId, idea, runId, questions, research) =>
    writeAt((path) => ticketPath(path, projectPath, ticketId), "Block Relay ticket draft for clarification", () =>
      FileSystemStorage.blockPendingTicketDraftForClarification(projectPath, ticketId, idea, runId, questions, research)
    ),
  transitionStatus: (projectPath, ticketId, targetStatus, options) =>
    writeAt((path) => ticketPath(path, projectPath, ticketId), "Transition Relay ticket status", () =>
      FileSystemStorage.transitionTicketStatus(projectPath, ticketId, targetStatus, options)
    ),
  setQueued: (projectPath, ticketId, runId) =>
    writeAt((path) => ticketPath(path, projectPath, ticketId), "Mark Relay ticket queued", () =>
      FileSystemStorage.setTicketQueued(projectPath, ticketId, runId)
    ),
  clearQueued: (projectPath, ticketId, targetStatus, expectedRunId) =>
    writeAt((path) => ticketPath(path, projectPath, ticketId), "Clear Relay ticket queue state", () =>
      FileSystemStorage.clearQueuedTicket(projectPath, ticketId, targetStatus, expectedRunId)
    ),
  listQueuedReady: (projectPath) =>
    readAt((path) => ticketsPath(path, projectPath), "List queued ready Relay tickets", () => FileSystemStorage.listQueuedReadyTickets(projectPath)),
  listReferences: (projectPath) =>
    readAt((path) => ticketsPath(path, projectPath), "List Relay ticket references", () =>
      FileSystemStorage.listTicketReferenceCandidates(projectPath)
    ),
  save: (input) =>
    writeAt((path) => ticketPath(path, input.projectPath, input.ticket.frontMatter.id), "Save Relay ticket", () => FileSystemStorage.saveTicket(input)),
  move: (input) =>
    writeAt((path) => ticketPath(path, input.projectPath, input.ticketId), "Move Relay ticket", () => FileSystemStorage.moveTicket(input)),
  delete: (projectPath, ticketId) =>
    writeAt((path) => ticketPath(path, projectPath, ticketId), "Delete Relay ticket", () => FileSystemStorage.deleteTicket(projectPath, ticketId)),
  duplicate: (projectPath, ticketId) =>
    writeAt((path) => ticketPath(path, projectPath, ticketId), "Duplicate Relay ticket", () => FileSystemStorage.duplicateTicket(projectPath, ticketId)),
  reveal: (projectPath, ticketId) =>
    readAt((path) => ticketPath(path, projectPath, ticketId), "Reveal Relay ticket file", () => FileSystemStorage.revealTicketFile(projectPath, ticketId))
});

export const FileSystemTicketStoreLive = Layer.succeed(TicketStore)(makeFileSystemTicketStore());
