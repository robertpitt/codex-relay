import { Schema } from "effect";
import {
  gitMetadataOptionsSchema,
  relayApprovalDecisionSchema,
  ticketCreateInputSchema
} from "../schemas";

export const projectPathRequestSchema = Schema.Struct({ projectPath: Schema.String });
export const projectTicketRequestSchema = Schema.Struct({ projectPath: Schema.String, ticketId: Schema.String });
export const projectTicketRunRequestSchema = Schema.Struct({
  projectPath: Schema.String,
  ticketId: Schema.String,
  runId: Schema.String
});

export const projectGitMetadataRequestSchema = Schema.Struct({
  projectPath: Schema.String,
  options: Schema.optional(gitMetadataOptionsSchema)
});

export const projectGitMetadataQuerySchema = Schema.Struct({
  projectPath: Schema.String,
  force: Schema.optional(Schema.String)
});

export const createManualTicketRequestSchema = Schema.Struct({
  projectPath: Schema.String,
  input: ticketCreateInputSchema
});

export const cancelTicketUpdateRequestSchema = Schema.Struct({ runId: Schema.String });

export const approveActionRequestSchema = Schema.Struct({
  approvalId: Schema.String,
  decision: relayApprovalDecisionSchema
});

export const addProjectPathRequestSchema = Schema.Struct({
  projectPath: Schema.String,
  initializeIfMissing: Schema.optional(Schema.Boolean)
});
