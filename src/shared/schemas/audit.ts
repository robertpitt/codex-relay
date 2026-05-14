import { Schema } from "effect";
import { RELAY_SCHEMA_VERSION, isoString, unknownRecordSchema, type SchemaType } from "./common";
import { relayActorSchema, relayEventSourceSchema } from "./primitives";

export const relayAuditEventSchema = Schema.Struct({
  schemaVersion: Schema.Literal(RELAY_SCHEMA_VERSION),
  timestamp: isoString,
  actor: relayActorSchema,
  source: relayEventSourceSchema,
  eventType: Schema.Literals(["ticket.status_changed", "clarification.question_created", "clarification.answer_submitted"]),
  ticketId: Schema.optional(Schema.String),
  runId: Schema.optional(Schema.NullOr(Schema.String)),
  payload: unknownRecordSchema
});
export type RelayAuditEvent = SchemaType<typeof relayAuditEventSchema>;
