import { Schema } from "effect";
import { mutableArray, type SchemaType } from "./common";
import { projectConfigSchema, projectSummarySchema } from "./project";
import { relayColumnSchema, type RelayColumn } from "./primitives";
import { ticketSummarySchema } from "./ticket";

export const RELAY_TODO_STATUS = "todo";
export const RELAY_READY_STATUS = "ready";
export const RELAY_IN_PROGRESS_STATUS = "in_progress";
export const RELAY_NEEDS_CLARIFICATION_STATUS = "needs_clarification";
export const RELAY_REVIEW_STATUS = "review";
export const RELAY_NOT_DOING_STATUS = "not_doing";
export const RELAY_COMPLETED_STATUS = "completed";

export const DEFAULT_COLUMNS: RelayColumn[] = [
  { id: RELAY_TODO_STATUS, name: "Todo", position: 1000, terminal: false },
  { id: RELAY_READY_STATUS, name: "Ready", position: 2000, terminal: false },
  { id: RELAY_IN_PROGRESS_STATUS, name: "In Progress", position: 3000, terminal: false },
  { id: RELAY_NEEDS_CLARIFICATION_STATUS, name: "Needs Clarification", position: 4000, terminal: false },
  { id: RELAY_REVIEW_STATUS, name: "Review", position: 5000, terminal: false },
  { id: RELAY_NOT_DOING_STATUS, name: "Not Doing", position: 6000, terminal: true },
  { id: RELAY_COMPLETED_STATUS, name: "Completed", position: 7000, terminal: true }
];

export const invalidTicketSchema = Schema.Struct({
  filePath: Schema.String,
  reason: Schema.String
});
export type InvalidTicket = SchemaType<typeof invalidTicketSchema>;

export const boardSnapshotSchema = Schema.Struct({
  project: projectSummarySchema,
  config: Schema.NullOr(projectConfigSchema),
  columns: mutableArray(relayColumnSchema),
  tickets: mutableArray(ticketSummarySchema),
  invalidTickets: mutableArray(invalidTicketSchema)
});
export type BoardSnapshot = SchemaType<typeof boardSnapshotSchema>;
