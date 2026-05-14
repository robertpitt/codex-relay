import { Context, Effect, Layer } from "effect";
import type {
  BoardSnapshot,
  ClarificationQuestion,
  ClarificationQuestionCreateInput,
  CreateDraftInput,
  EpicSubticketCreateInput,
  ProjectConfig,
  ProjectSummary,
  TicketAttachmentSaveInput,
  TicketAttachmentSaveResult,
  TicketCreateInput,
  TicketDraft,
  TicketDraftResearch,
  TicketDraftSubticket,
  TicketMoveInput,
  TicketReferenceCandidate,
  TicketRecord,
  TicketSaveInput,
  TicketSummary
} from "@shared/types";
import { BackendConfig, BackendServicesBaseLive, runBackendEffect } from "../runtime";
import * as FileSystemStorage from "./filesystem";
import type { ClarificationQuestionCreateOptions, StatusTransitionOptions } from "./filesystem";
import {
  ArtifactStore,
  AuditLog,
  ClarificationStore,
  FileSystemArtifactStoreLive,
  FileSystemAuditLogLive,
  FileSystemClarificationStoreLive,
  FileSystemProjectStoreLive,
  FileSystemRunLogLive,
  FileSystemTicketStoreLive,
  ProjectStore,
  RunLog,
  TicketStore,
  type ArtifactStoreService,
  type ClarificationStoreService,
  type ProjectStoreService,
  type TicketStoreService
} from "./stores";

export { TicketNotFoundError, isTicketNotFoundError } from "./errors";
export { newId } from "./ids";
export { runsPath } from "./paths";
export { appendCodexHandoff } from "./filesystem";
export { AtomicFile, AtomicFileLive } from "./AtomicFile";
export * from "./stores";
export type { ClarificationQuestionCreateOptions, StatusTransitionOptions } from "./filesystem";

export type StorageAdapterName = "filesystem";

type StorageEffect<A> = Effect.Effect<A, unknown, any>;

export type StorageService = {
  readonly adapter: StorageAdapterName;
  readonly isGitRepository: (projectPath: string) => StorageEffect<boolean>;
  readonly isInitialized: (projectPath: string) => StorageEffect<boolean>;
  readonly initializeProject: (projectPath: string) => StorageEffect<ProjectConfig>;
  readonly getProjectSummary: (projectPath: string, lastOpenedAt?: string) => StorageEffect<ProjectSummary>;
  readonly getProjectConfig: (projectPath: string) => StorageEffect<ProjectConfig>;
  readonly saveProjectConfig: (projectPath: string, config: ProjectConfig) => StorageEffect<ProjectConfig>;
  readonly getBoard: (projectPath: string, lastOpenedAt?: string) => StorageEffect<BoardSnapshot>;
  readonly getTickets: (projectPath: string) => StorageEffect<TicketSummary[]>;
  readonly getTicket: (projectPath: string, ticketId: string) => StorageEffect<TicketRecord>;
  readonly putTicket: (projectPath: string, ticket: TicketRecord) => StorageEffect<TicketRecord>;
  readonly createTicket: (projectPath: string, input: TicketCreateInput) => StorageEffect<TicketRecord>;
  readonly createSubticket: (input: EpicSubticketCreateInput) => StorageEffect<TicketRecord>;
  readonly linkSubticket: (projectPath: string, epicId: string, ticketId: string) => StorageEffect<BoardSnapshot>;
  readonly unlinkSubticket: (projectPath: string, epicId: string, ticketId: string) => StorageEffect<BoardSnapshot>;
  readonly createPendingTicketDraft: (projectPath: string, input: CreateDraftInput, runId: string) => StorageEffect<TicketRecord>;
  readonly applyTicketDraft: (projectPath: string, ticketId: string, draft: TicketDraft, runId: string) => StorageEffect<TicketRecord>;
  readonly failPendingTicketDraft: (
    projectPath: string,
    ticketId: string,
    idea: string,
    runId: string,
    message: string
  ) => StorageEffect<TicketRecord>;
  readonly blockPendingTicketDraftForClarification: (
    projectPath: string,
    ticketId: string,
    idea: string,
    runId: string,
    questions: readonly string[],
    research?: TicketDraftResearch
  ) => StorageEffect<TicketRecord>;
  readonly transitionTicketStatus: (
    projectPath: string,
    ticketId: string,
    targetStatus: string,
    options: StatusTransitionOptions
  ) => StorageEffect<TicketRecord>;
  readonly setTicketQueued: (projectPath: string, ticketId: string, runId: string) => StorageEffect<TicketRecord>;
  readonly clearQueuedTicket: (
    projectPath: string,
    ticketId: string,
    targetStatus?: string | null,
    expectedRunId?: string | null
  ) => StorageEffect<TicketRecord>;
  readonly listQueuedReadyTickets: (projectPath: string) => StorageEffect<TicketSummary[]>;
  readonly listTicketReferenceCandidates: (projectPath: string) => StorageEffect<TicketReferenceCandidate[]>;
  readonly saveTicket: (input: TicketSaveInput) => StorageEffect<TicketRecord>;
  readonly saveTicketAttachment: (input: TicketAttachmentSaveInput) => StorageEffect<TicketAttachmentSaveResult>;
  readonly moveTicket: (input: TicketMoveInput) => StorageEffect<BoardSnapshot>;
  readonly getClarificationQuestions: (projectPath: string, ticketId: string) => StorageEffect<ClarificationQuestion[]>;
  readonly createClarificationQuestions: (
    projectPath: string,
    ticketId: string,
    inputs: ClarificationQuestionCreateInput[],
    options: ClarificationQuestionCreateOptions
  ) => StorageEffect<ClarificationQuestion[]>;
  readonly answerClarificationQuestion: (
    projectPath: string,
    ticketId: string,
    questionId: string,
    answer: string
  ) => StorageEffect<ClarificationQuestion>;
  readonly deleteTicket: (projectPath: string, ticketId: string) => StorageEffect<BoardSnapshot>;
  readonly duplicateTicket: (projectPath: string, ticketId: string) => StorageEffect<TicketRecord>;
  readonly revealTicketFile: (projectPath: string, ticketId: string) => StorageEffect<void>;
};

export const Storage = Context.Service<StorageService>("relay/Storage");

type StorageStores = {
  readonly projectStore: ProjectStoreService;
  readonly ticketStore: TicketStoreService;
  readonly clarificationStore: ClarificationStoreService;
  readonly artifactStore: ArtifactStoreService;
};

const makeStorageService = ({ projectStore, ticketStore, clarificationStore, artifactStore }: StorageStores): StorageService => ({
  adapter: "filesystem",
  isGitRepository: projectStore.isGitRepository,
  isInitialized: projectStore.isInitialized,
  initializeProject: projectStore.initialize,
  getProjectSummary: projectStore.summarize,
  getProjectConfig: projectStore.readConfig,
  saveProjectConfig: projectStore.writeConfig,
  getBoard: projectStore.readBoard,
  getTickets: ticketStore.list,
  getTicket: ticketStore.read,
  putTicket: ticketStore.write,
  createTicket: ticketStore.create,
  createSubticket: ticketStore.createSubticket,
  linkSubticket: ticketStore.linkSubticket,
  unlinkSubticket: ticketStore.unlinkSubticket,
  createPendingTicketDraft: ticketStore.createPendingDraft,
  applyTicketDraft: ticketStore.applyDraft,
  failPendingTicketDraft: ticketStore.failPendingDraft,
  blockPendingTicketDraftForClarification: ticketStore.blockPendingDraftForClarification,
  transitionTicketStatus: ticketStore.transitionStatus,
  setTicketQueued: ticketStore.setQueued,
  clearQueuedTicket: ticketStore.clearQueued,
  listQueuedReadyTickets: ticketStore.listQueuedReady,
  listTicketReferenceCandidates: ticketStore.listReferences,
  saveTicket: ticketStore.save,
  saveTicketAttachment: artifactStore.saveAttachment,
  moveTicket: ticketStore.move,
  getClarificationQuestions: clarificationStore.list,
  createClarificationQuestions: clarificationStore.create,
  answerClarificationQuestion: clarificationStore.answer,
  deleteTicket: ticketStore.delete,
  duplicateTicket: ticketStore.duplicate,
  revealTicketFile: ticketStore.reveal
});

export const FileSystemStoresLive = Layer.mergeAll(
  FileSystemProjectStoreLive,
  FileSystemTicketStoreLive,
  FileSystemClarificationStoreLive,
  FileSystemArtifactStoreLive,
  FileSystemAuditLogLive,
  FileSystemRunLogLive
);

const storageFromContext = Effect.gen(function*() {
  const projectStore = yield* ProjectStore;
  const ticketStore = yield* TicketStore;
  const clarificationStore = yield* ClarificationStore;
  const artifactStore = yield* ArtifactStore;
  yield* AuditLog;
  yield* RunLog;
  return makeStorageService({ projectStore, ticketStore, clarificationStore, artifactStore });
});

export const storageLayerForAdapter = (adapter: StorageAdapterName) => {
  switch (adapter) {
    case "filesystem":
      return FileSystemStorageLive;
  }
};

export const FileSystemStorageLive = Layer.effect(Storage, storageFromContext).pipe(Layer.provide(FileSystemStoresLive));

export const StorageLive = Layer.effect(
  Storage,
  Effect.gen(function*() {
    const config = yield* BackendConfig;
    switch (config.storageAdapter) {
      case "filesystem":
        return yield* storageFromContext;
    }
  })
).pipe(Layer.provide(FileSystemStoresLive));

const runStorage = <A, R>(effect: Effect.Effect<A, unknown, R>): Promise<A> =>
  runBackendEffect(Effect.provide(effect, StorageLive.pipe(Layer.provide(BackendServicesBaseLive))));

const runStorageMethod = <A>(evaluate: (storage: StorageService) => StorageEffect<A>): Promise<A> =>
  runStorage(Storage.use(evaluate));

export const isGitRepository = (projectPath: string): Promise<boolean> =>
  runStorageMethod((storage) => storage.isGitRepository(projectPath));

export const isRelayInitialized = (projectPath: string): Promise<boolean> =>
  runStorageMethod((storage) => storage.isInitialized(projectPath));

export const initializeProject = (projectPath: string): Promise<ProjectConfig> =>
  runStorageMethod((storage) => storage.initializeProject(projectPath));

export const summarizeProject = (projectPath: string, lastOpenedAt?: string): Promise<ProjectSummary> =>
  runStorageMethod((storage) => storage.getProjectSummary(projectPath, lastOpenedAt));

export const readProjectConfig = (projectPath: string): Promise<ProjectConfig> =>
  runStorageMethod((storage) => storage.getProjectConfig(projectPath));

export const writeProjectConfig = (projectPath: string, config: ProjectConfig): Promise<ProjectConfig> =>
  runStorageMethod((storage) => storage.saveProjectConfig(projectPath, config));

export const saveTicketAttachment = (input: TicketAttachmentSaveInput): Promise<TicketAttachmentSaveResult> =>
  runStorageMethod((storage) => storage.saveTicketAttachment(input));

export const readBoard = (projectPath: string, lastOpenedAt?: string): Promise<BoardSnapshot> =>
  runStorageMethod((storage) => storage.getBoard(projectPath, lastOpenedAt));

export const getBoard = readBoard;

export const getTickets = (projectPath: string): Promise<TicketSummary[]> =>
  runStorageMethod((storage) => storage.getTickets(projectPath));

export const listTicketReferenceCandidates = (projectPath: string): Promise<TicketReferenceCandidate[]> =>
  runStorageMethod((storage) => storage.listTicketReferenceCandidates(projectPath));

export const readTicket = (projectPath: string, ticketId: string): Promise<TicketRecord> =>
  runStorageMethod((storage) => storage.getTicket(projectPath, ticketId));

export const getTicket = readTicket;

export const writeTicket = (projectPath: string, ticket: TicketRecord): Promise<TicketRecord> =>
  runStorageMethod((storage) => storage.putTicket(projectPath, ticket));

export const createPendingTicketDraft = (projectPath: string, input: CreateDraftInput, runId: string): Promise<TicketRecord> =>
  runStorageMethod((storage) => storage.createPendingTicketDraft(projectPath, input, runId));

export const createTicket = (projectPath: string, input: TicketCreateInput): Promise<TicketRecord> =>
  runStorageMethod((storage) => storage.createTicket(projectPath, input));

export const applyTicketDraftToTicket = (
  projectPath: string,
  ticketId: string,
  draft: TicketDraft,
  runId: string
): Promise<TicketRecord> => runStorageMethod((storage) => storage.applyTicketDraft(projectPath, ticketId, draft, runId));

export const failPendingTicketDraft = (
  projectPath: string,
  ticketId: string,
  idea: string,
  runId: string,
  message: string
): Promise<TicketRecord> =>
  runStorageMethod((storage) => storage.failPendingTicketDraft(projectPath, ticketId, idea, runId, message));

export const blockPendingTicketDraftForClarification = (
  projectPath: string,
  ticketId: string,
  idea: string,
  runId: string,
  questions: readonly string[],
  research?: TicketDraftResearch
): Promise<TicketRecord> =>
  runStorageMethod((storage) =>
    storage.blockPendingTicketDraftForClarification(projectPath, ticketId, idea, runId, questions, research)
  );

export const createSubticket = (input: EpicSubticketCreateInput): Promise<TicketRecord> =>
  runStorageMethod((storage) => storage.createSubticket(input));

export const linkSubticket = (projectPath: string, epicId: string, ticketId: string): Promise<BoardSnapshot> =>
  runStorageMethod((storage) => storage.linkSubticket(projectPath, epicId, ticketId));

export const unlinkSubticket = (projectPath: string, epicId: string, ticketId: string): Promise<BoardSnapshot> =>
  runStorageMethod((storage) => storage.unlinkSubticket(projectPath, epicId, ticketId));

export const transitionTicketStatus = (
  projectPath: string,
  ticketId: string,
  targetStatus: string,
  options: StatusTransitionOptions
): Promise<TicketRecord> => runStorageMethod((storage) => storage.transitionTicketStatus(projectPath, ticketId, targetStatus, options));

export const setTicketQueued = (projectPath: string, ticketId: string, runId: string): Promise<TicketRecord> =>
  runStorageMethod((storage) => storage.setTicketQueued(projectPath, ticketId, runId));

export const clearQueuedTicket = (
  projectPath: string,
  ticketId: string,
  targetStatus?: string | null,
  expectedRunId?: string | null
): Promise<TicketRecord> => runStorageMethod((storage) => storage.clearQueuedTicket(projectPath, ticketId, targetStatus, expectedRunId));

export const listQueuedReadyTickets = (projectPath: string): Promise<TicketSummary[]> =>
  runStorageMethod((storage) => storage.listQueuedReadyTickets(projectPath));

export const saveTicket = (input: TicketSaveInput): Promise<TicketRecord> =>
  runStorageMethod((storage) => storage.saveTicket(input));

export const moveTicket = (input: TicketMoveInput): Promise<BoardSnapshot> =>
  runStorageMethod((storage) => storage.moveTicket(input));

export const readClarificationQuestions = (projectPath: string, ticketId: string): Promise<ClarificationQuestion[]> =>
  runStorageMethod((storage) => storage.getClarificationQuestions(projectPath, ticketId));

export const createClarificationQuestions = (
  projectPath: string,
  ticketId: string,
  inputs: ClarificationQuestionCreateInput[],
  options: ClarificationQuestionCreateOptions
): Promise<ClarificationQuestion[]> =>
  runStorageMethod((storage) => storage.createClarificationQuestions(projectPath, ticketId, inputs, options));

export const answerClarificationQuestion = (
  projectPath: string,
  ticketId: string,
  questionId: string,
  answer: string
): Promise<ClarificationQuestion> =>
  runStorageMethod((storage) => storage.answerClarificationQuestion(projectPath, ticketId, questionId, answer));

export const deleteTicket = (projectPath: string, ticketId: string): Promise<BoardSnapshot> =>
  runStorageMethod((storage) => storage.deleteTicket(projectPath, ticketId));

export const duplicateTicket = (projectPath: string, ticketId: string): Promise<TicketRecord> =>
  runStorageMethod((storage) => storage.duplicateTicket(projectPath, ticketId));

export const revealTicketFile = (projectPath: string, ticketId: string): Promise<void> =>
  runStorageMethod((storage) => storage.revealTicketFile(projectPath, ticketId));

export const ticketMarkdownFromDraft = FileSystemStorage.ticketMarkdownFromDraft;

export const ticketMarkdownFromSubticketDraft = (draft: TicketDraftSubticket, parentTitle: string): string =>
  FileSystemStorage.ticketMarkdownFromSubticketDraft(draft, parentTitle);
