import { Schema } from "effect";
import { Rpc } from "effect/unstable/rpc";
import {
  agentTicketUpdateInputSchema,
  agentTicketUpdateStartResultSchema,
  boardSnapshotSchema,
  clarificationAnswerInputSchema,
  clarificationQuestionSchema,
  createDraftInputSchema,
  draftIntakeInputSchema,
  draftIntakeResultSchema,
  epicSubticketCreateInputSchema,
  epicSubticketLinkInputSchema,
  relayRpcErrorSchema,
  ticketAttachmentSaveInputSchema,
  ticketAttachmentSaveResultSchema,
  ticketDraftStartResultSchema,
  ticketMoveInputSchema,
  ticketRecordSchema,
  ticketRedraftInputSchema,
  ticketReferenceCandidateSchema,
  ticketSaveInputSchema,
  ticketSuggestionsGenerateResultSchema,
  type ClarificationQuestion,
  type TicketReferenceCandidate
} from "../schemas";
import {
  arrayOf,
  cancelTicketUpdatePayload,
  createManualTicketPayload,
  projectPathPayload,
  projectTicketPayload
} from "./common";
import { relayRpcTags } from "./tags";

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
