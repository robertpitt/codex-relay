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
  ticketAttachmentSaveInputSchema,
  ticketAttachmentSaveResultSchema,
  ticketDraftStartResultSchema,
  ticketMoveInputSchema,
  ticketRecordSchema,
  ticketRedraftInputSchema,
  ticketReferenceCandidateSchema,
  ticketSaveInputSchema,
  ticketSuggestionsGenerateResultSchema
} from "../schemas";
import { arrayOf, defineEndpoint } from "./contract";
import {
  cancelTicketUpdateRequestSchema,
  createManualTicketRequestSchema,
  projectPathRequestSchema,
  projectTicketRequestSchema
} from "./common";

export const ticketEndpoints = {
  intakeDraft: defineEndpoint({
    method: "POST",
    path: "/api/tickets/intake-draft",
    request: { location: "body", schema: draftIntakeInputSchema },
    response: draftIntakeResultSchema
  }),
  createDraft: defineEndpoint({
    method: "POST",
    path: "/api/tickets/draft",
    request: { location: "body", schema: createDraftInputSchema },
    response: ticketDraftStartResultSchema
  }),
  redraft: defineEndpoint({
    method: "POST",
    path: "/api/tickets/redraft",
    request: { location: "body", schema: ticketRedraftInputSchema },
    response: ticketDraftStartResultSchema
  }),
  generateSuggestions: defineEndpoint({
    method: "POST",
    path: "/api/tickets/suggestions",
    request: { location: "body", schema: projectPathRequestSchema },
    response: ticketSuggestionsGenerateResultSchema
  }),
  createManual: defineEndpoint({
    method: "POST",
    path: "/api/tickets/manual",
    request: { location: "body", schema: createManualTicketRequestSchema },
    response: ticketRecordSchema
  }),
  createSubticket: defineEndpoint({
    method: "POST",
    path: "/api/tickets/subticket",
    request: { location: "body", schema: epicSubticketCreateInputSchema },
    response: ticketRecordSchema
  }),
  linkSubticket: defineEndpoint({
    method: "POST",
    path: "/api/tickets/subticket/link",
    request: { location: "body", schema: epicSubticketLinkInputSchema },
    response: boardSnapshotSchema
  }),
  unlinkSubticket: defineEndpoint({
    method: "POST",
    path: "/api/tickets/subticket/unlink",
    request: { location: "body", schema: epicSubticketLinkInputSchema },
    response: boardSnapshotSchema
  }),
  startAgentUpdate: defineEndpoint({
    method: "POST",
    path: "/api/tickets/agent-update",
    request: { location: "body", schema: agentTicketUpdateInputSchema },
    response: agentTicketUpdateStartResultSchema
  }),
  cancelAgentUpdate: defineEndpoint({
    method: "POST",
    path: "/api/tickets/agent-update/cancel",
    request: { location: "body", schema: cancelTicketUpdateRequestSchema }
  }),
  references: defineEndpoint({
    method: "GET",
    path: "/api/tickets/references",
    request: { location: "query", schema: projectPathRequestSchema },
    response: arrayOf(ticketReferenceCandidateSchema)
  }),
  read: defineEndpoint({
    method: "GET",
    path: "/api/tickets/item",
    request: { location: "query", schema: projectTicketRequestSchema },
    response: ticketRecordSchema
  }),
  save: defineEndpoint({
    method: "PUT",
    path: "/api/tickets/item",
    request: { location: "body", schema: ticketSaveInputSchema },
    response: ticketRecordSchema
  }),
  saveAttachment: defineEndpoint({
    method: "POST",
    path: "/api/tickets/attachment",
    request: { location: "body", schema: ticketAttachmentSaveInputSchema },
    response: ticketAttachmentSaveResultSchema
  }),
  move: defineEndpoint({
    method: "POST",
    path: "/api/tickets/move",
    request: { location: "body", schema: ticketMoveInputSchema },
    response: boardSnapshotSchema
  }),
  clarifications: defineEndpoint({
    method: "GET",
    path: "/api/tickets/clarifications",
    request: { location: "query", schema: projectTicketRequestSchema },
    response: arrayOf(clarificationQuestionSchema)
  }),
  answerClarification: defineEndpoint({
    method: "POST",
    path: "/api/tickets/clarifications/answer",
    request: { location: "body", schema: clarificationAnswerInputSchema },
    response: clarificationQuestionSchema
  }),
  delete: defineEndpoint({
    method: "DELETE",
    path: "/api/tickets/item",
    request: { location: "query", schema: projectTicketRequestSchema },
    response: boardSnapshotSchema
  }),
  duplicate: defineEndpoint({
    method: "POST",
    path: "/api/tickets/duplicate",
    request: { location: "body", schema: projectTicketRequestSchema },
    response: ticketRecordSchema
  }),
  revealFile: defineEndpoint({
    method: "POST",
    path: "/api/tickets/reveal",
    request: { location: "body", schema: projectTicketRequestSchema }
  })
} as const;
