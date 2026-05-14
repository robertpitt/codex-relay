import { Schema } from "effect";
import { numberSchema, type SchemaType } from "./common";

export const ticketPrioritySchema = Schema.Literals(["low", "medium", "high", "urgent"]);
export type TicketPriority = SchemaType<typeof ticketPrioritySchema>;

export const ticketTypeSchema = Schema.Literals(["task", "epic"]);
export type TicketType = SchemaType<typeof ticketTypeSchema>;

export const ticketEffortSchema = Schema.Literals(["low", "medium", "high", "xhigh"]);
export type TicketEffort = SchemaType<typeof ticketEffortSchema>;

export const draftScopeSchema = Schema.Literals([
  "quick_bug",
  "task",
  "product_feature",
  "rewrite",
  "epic"
]);
export type DraftScope = SchemaType<typeof draftScopeSchema>;

export const ticketAuthoringStateSchema = Schema.Literals([
  "rough",
  "drafting",
  "reviewing",
  "refining",
  "needs_input",
  "ready"
]);
export type TicketAuthoringState = SchemaType<typeof ticketAuthoringStateSchema>;

export const runStatusSchema = Schema.Literals([
  "idle",
  "queued",
  "drafting",
  "draft_failed",
  "draft_complete",
  "running",
  "blocked",
  "failed",
  "completed",
  "cancelled"
]);
export type RunStatus = SchemaType<typeof runStatusSchema>;

export const projectHealthSchema = Schema.Literals(["ok", "warning", "error"]);
export type ProjectHealth = SchemaType<typeof projectHealthSchema>;

export const relayActorSchema = Schema.Literals(["user", "codex", "system"]);
export type RelayActor = SchemaType<typeof relayActorSchema>;

export const relayEventSourceSchema = Schema.Literals([
  "manual_board",
  "manual_ticket_edit",
  "draft_generation",
  "agent_execution",
  "clarification_ui",
  "system_reconciliation"
]);
export type RelayEventSource = SchemaType<typeof relayEventSourceSchema>;

export const relayColumnSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String.check(Schema.isMinLength(1)),
  position: numberSchema,
  terminal: Schema.Boolean
});
export type RelayColumn = SchemaType<typeof relayColumnSchema>;

export const themePreferenceSchema = Schema.Literals(["system", "light", "dark"]);
export type ThemePreference = SchemaType<typeof themePreferenceSchema>;
