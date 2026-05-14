import { Schema } from "effect";
import {
  gitMetadataOptionsSchema,
  relayApprovalDecisionSchema,
  ticketCreateInputSchema,
  type RelaySchema
} from "../schemas";

export const arrayOf = <A>(schema: RelaySchema<A>): RelaySchema<A[]> =>
  Schema.mutable(Schema.Array(schema)) as RelaySchema<A[]>;

export const projectPathPayload = Schema.Struct({ projectPath: Schema.String });
export const projectTicketPayload = Schema.Struct({ projectPath: Schema.String, ticketId: Schema.String });
export const projectTicketRunPayload = Schema.Struct({
  projectPath: Schema.String,
  ticketId: Schema.String,
  runId: Schema.String
});
export const gitMetadataPayload = Schema.Struct({
  projectPath: Schema.String,
  options: Schema.optional(gitMetadataOptionsSchema)
});
export const createManualTicketPayload = Schema.Struct({ projectPath: Schema.String, input: ticketCreateInputSchema });
export const cancelTicketUpdatePayload = Schema.Struct({ runId: Schema.String });
export const approveActionPayload = Schema.Struct({ approvalId: Schema.String, decision: relayApprovalDecisionSchema });
