import type { TicketEffort } from "@shared/schemas";
import type { ProviderSessionRef } from "../work";

export type AgentWorkMode = "read_only" | "write";

export type AgentWorkKind =
  | "ticket.draft"
  | "ticket.draft_intake"
  | "ticket.update"
  | "ticket.implementation"
  | "ticket.suggestions"
  | "repository.chat";

export type AgentWebSearchMode = "disabled" | "cached" | "live";

export type StructuredAgentRequest = {
  readonly kind: AgentWorkKind;
  readonly projectPath: string;
  readonly prompt: string;
  readonly outputSchema: unknown;
  readonly mode: AgentWorkMode;
  readonly effort?: TicketEffort;
  readonly networkAccessEnabled?: boolean;
  readonly webSearchMode?: AgentWebSearchMode;
  readonly signal?: AbortSignal;
};

export type StructuredAgentResult<T = unknown> = {
  readonly providerId: string;
  readonly output: T;
  readonly rawResponse: string;
  readonly providerSessionRef?: ProviderSessionRef | null;
};

export type StructuredAgentProvider = {
  readonly providerId: string;
  readonly runStructured: <T = unknown>(request: StructuredAgentRequest) => Promise<StructuredAgentResult<T>>;
};

export const parseStructuredAgentJsonResponse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    const first = value.indexOf("{");
    const last = value.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(value.slice(first, last + 1));
    }
    throw new Error("Agent did not return valid JSON.");
  }
};
