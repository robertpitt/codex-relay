import type { RendererRunEvent, RunStatus } from "@shared/types";

export type AgentProgressStatus = RunStatus;

export type AgentProgressMetrics = {
  elapsedMs: number | null;
  elapsedLabel: string;
  filesEdited: number | null;
  webSearches: number | null;
  totalEvents: number;
  startedAt: string | null;
  endedAt: string | null;
  lastEventAt: string | null;
  statusLabel: string;
  statusDetail: string;
  statusTone: "idle" | "active" | "success" | "warning" | "danger";
  active: boolean;
  metricsAvailable: boolean;
};

export type AgentProgressInput = {
  events: RendererRunEvent[];
  status: AgentProgressStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  now?: number;
  metricsAvailable?: boolean;
};

const pad2 = (value: number): string => String(value).padStart(2, "0");

const timestampMs = (timestamp?: string | null): number | null => {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? null : parsed;
};

const eventTime = (event: RendererRunEvent): number => timestampMs(event.timestamp) ?? 0;

export const isAgentSessionActive = (status: AgentProgressStatus): boolean =>
  status === "queued" || status === "running" || status === "drafting";

export const formatElapsedDuration = (durationMs: number | null): string => {
  if (durationMs === null) return "Unavailable";
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(seconds)}` : `${pad2(minutes)}:${pad2(seconds)}`;
};

export const isWebSearchEvent = (event: RendererRunEvent): boolean =>
  event.type === "web.search" || (event.type === "agent.message.delta" && /^web search:/i.test(event.text.trim()));

const formatMcpStatus = (status: "in_progress" | "completed" | "failed"): string => status.replace("_", " ");

export const agentEventText = (event: RendererRunEvent): string => {
  switch (event.type) {
    case "run.started":
      return `Run started (${event.threadId})`;
    case "agent.message.delta":
    case "agent.message.completed":
      return event.text;
    case "command.started":
      return `$ ${event.command}`;
    case "command.output":
      return event.text;
    case "command.completed":
      return `Command ${event.status}`;
    case "file.change":
      return event.summary ?? event.path;
    case "web.search":
      return `Web search: ${event.query}`;
    case "todo.updated": {
      const completed = event.items.filter((item) => item.completed).length;
      const summary =
        event.items.length === 0
          ? "Todo list updated: no items"
          : `Todo list updated: ${completed}/${event.items.length} completed`;
      const items = event.items.map((item) => `[${item.completed ? "x" : " "}] ${item.text}`).join("\n");
      return items ? `${summary}\n${items}` : summary;
    }
    case "mcp.tool_call": {
      const call = `${event.server}.${event.tool}`;
      const status = formatMcpStatus(event.status);
      return event.error ? `MCP tool ${status}: ${call}: ${event.error}` : `MCP tool ${status}: ${call}`;
    }
    case "approval.requested":
      return `Approval requested: ${event.kind}`;
    case "approval.resolved":
      return `Approval ${event.decision}`;
    case "ticket.status_changed":
      return `Status moved from ${event.fromStatus} to ${event.toStatus}`;
    case "clarification.requested":
      return `${event.questions.length} clarification question${event.questions.length === 1 ? "" : "s"} requested`;
    case "run.completed":
      return event.finalResponse;
    case "run.failed":
      return event.message;
    default:
      return "";
  }
};

export const isMarkdownAgentEvent = (event: RendererRunEvent): boolean =>
  event.type === "agent.message.completed" || event.type === "run.completed";

export const agentEventLabel = (event: RendererRunEvent): string => {
  switch (event.type) {
    case "run.started":
    case "run.completed":
    case "run.failed":
      return "Run";
    case "agent.message.delta":
    case "agent.message.completed":
      return isWebSearchEvent(event) ? "Web Search" : "Message";
    case "command.started":
    case "command.output":
    case "command.completed":
      return "Command";
    case "file.change":
      return "File";
    case "web.search":
      return "Web Search";
    case "todo.updated":
      return "Todo";
    case "mcp.tool_call":
      return "MCP Tool";
    case "approval.requested":
    case "approval.resolved":
      return "Approval";
    case "ticket.status_changed":
      return "Status";
    case "clarification.requested":
      return "Clarification";
    default:
      return "Event";
  }
};

export const agentEventTone = (event: RendererRunEvent): "neutral" | "success" | "warning" | "danger" | "info" => {
  if (event.type === "mcp.tool_call" && event.status === "failed") return "danger";
  if (event.type === "run.failed" || (event.type === "command.completed" && event.status === "failed")) return "danger";
  if (
    event.type === "run.completed" ||
    (event.type === "command.completed" && event.status === "completed") ||
    (event.type === "mcp.tool_call" && event.status === "completed")
  )
    return "success";
  if (event.type === "clarification.requested" || event.type === "approval.requested") return "warning";
  if (
    isWebSearchEvent(event) ||
    event.type === "file.change" ||
    event.type === "ticket.status_changed" ||
    event.type === "todo.updated" ||
    event.type === "mcp.tool_call"
  )
    return "info";
  return "neutral";
};

export const sortAgentEvents = (events: RendererRunEvent[]): RendererRunEvent[] =>
  events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => eventTime(a.event) - eventTime(b.event) || a.index - b.index)
    .map(({ event }) => event);

export const mergeRunEvents = (...eventGroups: RendererRunEvent[][]): RendererRunEvent[] => {
  const merged = new Map<string, RendererRunEvent>();
  for (const event of eventGroups.flat()) {
    const key = `${event.runId}|${event.timestamp}|${event.type}|${agentEventText(event)}`;
    if (!merged.has(key)) merged.set(key, event);
  }
  return sortAgentEvents([...merged.values()]);
};

const statusCopy = (
  status: AgentProgressStatus
): Pick<AgentProgressMetrics, "statusLabel" | "statusDetail" | "statusTone"> => {
  switch (status) {
    case "queued":
      return { statusLabel: "Queued", statusDetail: "Codex is waiting to start this ticket.", statusTone: "active" };
    case "drafting":
      return { statusLabel: "Drafting", statusDetail: "Codex is preparing a ticket draft.", statusTone: "active" };
    case "draft_failed":
      return { statusLabel: "Draft failed", statusDetail: "The ticket draft run ended with an error.", statusTone: "danger" };
    case "draft_complete":
      return { statusLabel: "Draft ready", statusDetail: "The generated ticket draft is ready.", statusTone: "success" };
    case "running":
      return { statusLabel: "Active", statusDetail: "Codex is working on this ticket.", statusTone: "active" };
    case "blocked":
      return { statusLabel: "Needs input", statusDetail: "Codex is waiting on clarification.", statusTone: "warning" };
    case "failed":
      return { statusLabel: "Failed", statusDetail: "The agent session ended with an error.", statusTone: "danger" };
    case "completed":
      return { statusLabel: "Completed", statusDetail: "The latest agent session has finished.", statusTone: "success" };
    case "cancelled":
      return { statusLabel: "Cancelled", statusDetail: "The latest agent session was stopped.", statusTone: "danger" };
    case "idle":
    default:
      return { statusLabel: "Inactive", statusDetail: "No agent session is currently active.", statusTone: "idle" };
  }
};

export const deriveAgentProgress = ({
  events,
  status,
  startedAt,
  endedAt,
  now = Date.now(),
  metricsAvailable
}: AgentProgressInput): AgentProgressMetrics => {
  const sorted = sortAgentEvents(events);
  const active = isAgentSessionActive(status);
  const firstEvent = sorted[0] ?? null;
  const lastEvent = sorted.at(-1) ?? null;
  const runStarted = sorted.find((event) => event.type === "run.started") ?? null;
  const terminalEvent =
    [...sorted].reverse().find((event) => event.type === "run.completed" || event.type === "run.failed" || event.type === "clarification.requested") ??
    null;

  const effectiveStartedAt = startedAt ?? runStarted?.timestamp ?? firstEvent?.timestamp ?? null;
  const effectiveEndedAt = endedAt ?? (active ? null : terminalEvent?.timestamp ?? lastEvent?.timestamp ?? null);
  const startMs = timestampMs(effectiveStartedAt);
  const endMs = active ? now : timestampMs(effectiveEndedAt);
  const elapsedMs = startMs !== null && endMs !== null ? Math.max(0, endMs - startMs) : null;
  const haveMetrics = metricsAvailable ?? sorted.length > 0;
  const filesEdited = haveMetrics ? new Set(sorted.filter((event) => event.type === "file.change").map((event) => event.path)).size : null;
  const webSearches = haveMetrics ? sorted.filter(isWebSearchEvent).length : null;

  return {
    ...statusCopy(status),
    active,
    elapsedMs,
    elapsedLabel: formatElapsedDuration(elapsedMs),
    filesEdited,
    webSearches,
    totalEvents: sorted.length,
    startedAt: effectiveStartedAt,
    endedAt: effectiveEndedAt,
    lastEventAt: lastEvent?.timestamp ?? null,
    metricsAvailable: haveMetrics
  };
};
