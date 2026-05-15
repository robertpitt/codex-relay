export type AgentProviderId = string;

export type AgentSessionRef = {
  readonly providerId: AgentProviderId;
  readonly externalId: string;
  readonly parts?: Record<string, string>;
  readonly metadata?: Record<string, string>;
};
