import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import {
  agentTicketUpdateInputSchema,
  agentTicketUpdateStartResultSchema,
  boardSnapshotSchema,
  cancelRunInputSchema,
  clarificationAnswerInputSchema,
  clarificationQuestionSchema,
  codexRunPreflightResultSchema,
  codexRunStartResultSchema,
  codexStatusSchema,
  createDraftInputSchema,
  draftIntakeInputSchema,
  draftIntakeResultSchema,
  epicSubticketCreateInputSchema,
  epicSubticketLinkInputSchema,
  gitMetadataOptionsSchema,
  gitMetadataSchema,
  projectOpenInEditorInputSchema,
  projectOpenInEditorResultSchema,
  projectSummarySchema,
  relayApprovalDecisionSchema,
  relayRpcErrorSchema,
  rendererRunEventSchema,
  repositoryChatInputSchema,
  repositoryChatResponseSchema,
  runSummarySchema,
  startRunInputSchema,
  ticketAttachmentSaveInputSchema,
  ticketAttachmentSaveResultSchema,
  ticketCreateInputSchema,
  ticketDraftStartResultSchema,
  ticketMoveInputSchema,
  ticketRecordSchema,
  ticketRedraftInputSchema,
  ticketReferenceCandidateSchema,
  ticketSaveInputSchema,
  ticketSuggestionsGenerateResultSchema,
  type RelaySchema
} from "./schemas";
export type { RelayRpcError } from "./schemas";
import type {
  AddProjectResult,
  ClarificationQuestion,
  ProjectSummary,
  RendererRunEvent,
  RunSummary,
  TicketReferenceCandidate
} from "./types";

const arrayOf = <A>(schema: RelaySchema<A>): RelaySchema<A[]> => Schema.mutable(Schema.Array(schema)) as RelaySchema<A[]>;

export const relayRpcTags = {
  projectsList: "projects:list",
  projectsAddFolder: "projects:addFolder",
  projectsRemoveFromSidebar: "projects:removeFromSidebar",
  projectsRead: "projects:read",
  projectsGitMetadata: "projects:gitMetadata",
  projectsRevealInFinder: "projects:revealInFinder",
  projectsOpenInEditor: "projects:openInEditor",
  boardRead: "board:read",
  ticketIntakeDraft: "ticket:intakeDraft",
  ticketCreateDraft: "ticket:createDraft",
  ticketRedraft: "ticket:redraft",
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
} as const;

export type RelayRpcTag = (typeof relayRpcTags)[keyof typeof relayRpcTags];

const projectPathPayload = Schema.Struct({ projectPath: Schema.String });
const projectTicketPayload = Schema.Struct({ projectPath: Schema.String, ticketId: Schema.String });
const projectTicketRunPayload = Schema.Struct({ projectPath: Schema.String, ticketId: Schema.String, runId: Schema.String });
const gitMetadataPayload = Schema.Struct({ projectPath: Schema.String, options: Schema.optional(gitMetadataOptionsSchema) });
const createManualTicketPayload = Schema.Struct({ projectPath: Schema.String, input: ticketCreateInputSchema });
const cancelTicketUpdatePayload = Schema.Struct({ runId: Schema.String });
const approveActionPayload = Schema.Struct({ approvalId: Schema.String, decision: relayApprovalDecisionSchema });

const addProjectResultSchema: RelaySchema<AddProjectResult> = Schema.Struct({
  project: projectSummarySchema,
  initialized: Schema.Boolean
});

export class ProjectsList extends Rpc.make(relayRpcTags.projectsList, {
  success: arrayOf<ProjectSummary>(projectSummarySchema),
  error: relayRpcErrorSchema
}) {}

export class ProjectsAddFolder extends Rpc.make(relayRpcTags.projectsAddFolder, {
  success: Schema.NullOr(addProjectResultSchema),
  error: relayRpcErrorSchema
}) {}

export class ProjectsRemoveFromSidebar extends Rpc.make(relayRpcTags.projectsRemoveFromSidebar, {
  payload: projectPathPayload,
  success: arrayOf<ProjectSummary>(projectSummarySchema),
  error: relayRpcErrorSchema
}) {}

export class ProjectsRead extends Rpc.make(relayRpcTags.projectsRead, {
  payload: projectPathPayload,
  success: projectSummarySchema,
  error: relayRpcErrorSchema
}) {}

export class ProjectsGitMetadata extends Rpc.make(relayRpcTags.projectsGitMetadata, {
  payload: gitMetadataPayload,
  success: gitMetadataSchema,
  error: relayRpcErrorSchema
}) {}

export class ProjectsRevealInFinder extends Rpc.make(relayRpcTags.projectsRevealInFinder, {
  payload: projectPathPayload,
  success: Schema.Void,
  error: relayRpcErrorSchema
}) {}

export class ProjectsOpenInEditor extends Rpc.make(relayRpcTags.projectsOpenInEditor, {
  payload: projectOpenInEditorInputSchema,
  success: projectOpenInEditorResultSchema,
  error: relayRpcErrorSchema
}) {}

export class BoardRead extends Rpc.make(relayRpcTags.boardRead, {
  payload: projectPathPayload,
  success: boardSnapshotSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketIntakeDraft extends Rpc.make(relayRpcTags.ticketIntakeDraft, {
  payload: draftIntakeInputSchema,
  success: draftIntakeResultSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketCreateDraft extends Rpc.make(relayRpcTags.ticketCreateDraft, {
  payload: createDraftInputSchema,
  success: ticketDraftStartResultSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketRedraft extends Rpc.make(relayRpcTags.ticketRedraft, {
  payload: ticketRedraftInputSchema,
  success: ticketDraftStartResultSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketGenerateSuggestions extends Rpc.make(relayRpcTags.ticketGenerateSuggestions, {
  payload: projectPathPayload,
  success: ticketSuggestionsGenerateResultSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketCreateManual extends Rpc.make(relayRpcTags.ticketCreateManual, {
  payload: createManualTicketPayload,
  success: ticketRecordSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketCreateSubticket extends Rpc.make(relayRpcTags.ticketCreateSubticket, {
  payload: epicSubticketCreateInputSchema,
  success: ticketRecordSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketLinkSubticket extends Rpc.make(relayRpcTags.ticketLinkSubticket, {
  payload: epicSubticketLinkInputSchema,
  success: boardSnapshotSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketUnlinkSubticket extends Rpc.make(relayRpcTags.ticketUnlinkSubticket, {
  payload: epicSubticketLinkInputSchema,
  success: boardSnapshotSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketStartAgentUpdate extends Rpc.make(relayRpcTags.ticketStartAgentUpdate, {
  payload: agentTicketUpdateInputSchema,
  success: agentTicketUpdateStartResultSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketCancelAgentUpdate extends Rpc.make(relayRpcTags.ticketCancelAgentUpdate, {
  payload: cancelTicketUpdatePayload,
  success: Schema.Void,
  error: relayRpcErrorSchema
}) {}

export class TicketReferences extends Rpc.make(relayRpcTags.ticketReferences, {
  payload: projectPathPayload,
  success: arrayOf<TicketReferenceCandidate>(ticketReferenceCandidateSchema),
  error: relayRpcErrorSchema
}) {}

export class TicketRead extends Rpc.make(relayRpcTags.ticketRead, {
  payload: projectTicketPayload,
  success: ticketRecordSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketSave extends Rpc.make(relayRpcTags.ticketSave, {
  payload: ticketSaveInputSchema,
  success: ticketRecordSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketSaveAttachment extends Rpc.make(relayRpcTags.ticketSaveAttachment, {
  payload: ticketAttachmentSaveInputSchema,
  success: ticketAttachmentSaveResultSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketMove extends Rpc.make(relayRpcTags.ticketMove, {
  payload: ticketMoveInputSchema,
  success: boardSnapshotSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketClarifications extends Rpc.make(relayRpcTags.ticketClarifications, {
  payload: projectTicketPayload,
  success: arrayOf<ClarificationQuestion>(clarificationQuestionSchema),
  error: relayRpcErrorSchema
}) {}

export class TicketAnswerClarification extends Rpc.make(relayRpcTags.ticketAnswerClarification, {
  payload: clarificationAnswerInputSchema,
  success: clarificationQuestionSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketDelete extends Rpc.make(relayRpcTags.ticketDelete, {
  payload: projectTicketPayload,
  success: boardSnapshotSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketDuplicate extends Rpc.make(relayRpcTags.ticketDuplicate, {
  payload: projectTicketPayload,
  success: ticketRecordSchema,
  error: relayRpcErrorSchema
}) {}

export class TicketRevealFile extends Rpc.make(relayRpcTags.ticketRevealFile, {
  payload: projectTicketPayload,
  success: Schema.Void,
  error: relayRpcErrorSchema
}) {}

export class CodexStatus extends Rpc.make(relayRpcTags.codexStatus, {
  success: codexStatusSchema,
  error: relayRpcErrorSchema
}) {}

export class CodexPreflightRun extends Rpc.make(relayRpcTags.codexPreflightRun, {
  payload: startRunInputSchema,
  success: codexRunPreflightResultSchema,
  error: relayRpcErrorSchema
}) {}

export class CodexStartRun extends Rpc.make(relayRpcTags.codexStartRun, {
  payload: startRunInputSchema,
  success: codexRunStartResultSchema,
  error: relayRpcErrorSchema
}) {}

export class CodexResumeRun extends Rpc.make(relayRpcTags.codexResumeRun, {
  payload: startRunInputSchema,
  success: codexRunStartResultSchema,
  error: relayRpcErrorSchema
}) {}

export class CodexCancelRun extends Rpc.make(relayRpcTags.codexCancelRun, {
  payload: cancelRunInputSchema,
  success: Schema.Void,
  error: relayRpcErrorSchema
}) {}

export class CodexApproveAction extends Rpc.make(relayRpcTags.codexApproveAction, {
  payload: approveActionPayload,
  success: Schema.Void,
  error: relayRpcErrorSchema
}) {}

export class CodexSendRepositoryChatMessage extends Rpc.make(relayRpcTags.codexSendRepositoryChatMessage, {
  payload: repositoryChatInputSchema,
  success: repositoryChatResponseSchema,
  error: relayRpcErrorSchema
}) {}

export class CodexReadRunEvents extends Rpc.make(relayRpcTags.codexReadRunEvents, {
  payload: projectTicketRunPayload,
  success: arrayOf<RendererRunEvent>(rendererRunEventSchema),
  error: relayRpcErrorSchema
}) {}

export class CodexReadLatestRunSummary extends Rpc.make(relayRpcTags.codexReadLatestRunSummary, {
  payload: projectTicketPayload,
  success: Schema.NullOr(runSummarySchema) as RelaySchema<RunSummary | null>,
  error: relayRpcErrorSchema
}) {}

export class RelayRpcGroup extends RpcGroup.make(
  ProjectsList,
  ProjectsAddFolder,
  ProjectsRemoveFromSidebar,
  ProjectsRead,
  ProjectsGitMetadata,
  ProjectsRevealInFinder,
  ProjectsOpenInEditor,
  BoardRead,
  TicketIntakeDraft,
  TicketCreateDraft,
  TicketRedraft,
  TicketGenerateSuggestions,
  TicketCreateManual,
  TicketCreateSubticket,
  TicketLinkSubticket,
  TicketUnlinkSubticket,
  TicketStartAgentUpdate,
  TicketCancelAgentUpdate,
  TicketReferences,
  TicketRead,
  TicketSave,
  TicketSaveAttachment,
  TicketMove,
  TicketClarifications,
  TicketAnswerClarification,
  TicketDelete,
  TicketDuplicate,
  TicketRevealFile,
  CodexStatus,
  CodexPreflightRun,
  CodexStartRun,
  CodexResumeRun,
  CodexCancelRun,
  CodexApproveAction,
  CodexSendRepositoryChatMessage,
  CodexReadRunEvents,
  CodexReadLatestRunSummary
) {}

export const relayRpcGroup = RelayRpcGroup;
export type RelayRpcs = RpcGroup.Rpcs<typeof RelayRpcGroup>;
export type RelayRpcClient = import("effect/unstable/rpc").RpcClient.RpcClient.Flat<RelayRpcs>;
