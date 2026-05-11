import { Context, Effect, Layer } from "effect";
import {
  RELAY_SCHEMA_VERSION,
  type RelayCodexEvent,
  type RendererRunEvent,
  type RunLogLine,
  type RunStatus,
  type RunSummary,
  type RunUsageSummary
} from "../../../shared/types";
import { RelayWindow } from "../../window/RelayWindow";
import { type BackendServices, fromPromise, runBackendEffect } from "../runtime";
import { appendTextFileEffect, isFileNotFoundError, makeDirectoryEffect, pathDirname, pathJoin, readTextFileEffect } from "../io";
import { relayCodexEventSchema, runLogLineSchema } from "../schemas";
import { runsPath } from "../storage";

export type RendererRunEventSink = {
  readonly emit: (event: RendererRunEvent) => void | Promise<void>;
};

export type RunEventSinkService = {
  readonly emit: (
    projectPath: string,
    ticketId: string,
    runId: string,
    threadId: string,
    event: RelayCodexEvent
  ) => Effect.Effect<void, unknown, BackendServices | Context.Service.Identifier<typeof RelayWindow>>;
};

export const RunEventSink = Context.Service<RunEventSinkService>("relay/RunEventSink");

export const rendererRunEventFromRelayEvent = (
  projectPath: string,
  ticketId: string,
  runId: string,
  event: RelayCodexEvent
): RendererRunEvent => ({
  ...event,
  projectPath,
  ticketId,
  runId
});

const relayEventFromRunLogLine = (line: RunLogLine): RelayCodexEvent =>
  relayCodexEventSchema.parse({
    ...line.payload,
    type: line.type,
    timestamp: line.timestamp
  });

const parseRunLogLines = (raw: string): RunLogLine[] =>
  raw
    .split("\n")
    .filter(Boolean)
    .map((line) => runLogLineSchema.parse(JSON.parse(line)));

const timestampMs = (timestamp: string | null): number | null => {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? null : parsed;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numberFromRecord = (record: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
};

const nestedNumberFromRecord = (record: Record<string, unknown>, parentKeys: string[], childKeys: string[]): number | null => {
  for (const parentKey of parentKeys) {
    const nested = record[parentKey];
    if (!isRecord(nested)) continue;
    const value = numberFromRecord(nested, childKeys);
    if (value !== null) return value;
  }
  return null;
};

export const summarizeRunUsage = (usage: unknown): RunUsageSummary | null => {
  if (!isRecord(usage)) return null;

  const inputTokens = numberFromRecord(usage, ["input_tokens", "inputTokens", "prompt_tokens", "promptTokens"]);
  const cachedInputTokens =
    numberFromRecord(usage, ["cached_input_tokens", "cachedInputTokens", "cached_prompt_tokens", "cachedPromptTokens"]) ??
    nestedNumberFromRecord(usage, ["input_token_details", "inputTokenDetails", "prompt_tokens_details", "promptTokensDetails"], [
      "cached_tokens",
      "cachedTokens"
    ]);
  const outputTokens = numberFromRecord(usage, ["output_tokens", "outputTokens", "completion_tokens", "completionTokens"]);
  const reasoningOutputTokens =
    numberFromRecord(usage, ["reasoning_output_tokens", "reasoningOutputTokens", "reasoning_tokens", "reasoningTokens"]) ??
    nestedNumberFromRecord(usage, ["output_token_details", "outputTokenDetails", "completion_tokens_details", "completionTokensDetails"], [
      "reasoning_tokens",
      "reasoningTokens"
    ]);
  const explicitTotal = numberFromRecord(usage, ["total_tokens", "totalTokens"]);
  const totalTokens = explicitTotal ?? (inputTokens !== null || outputTokens !== null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null);

  if (
    inputTokens === null &&
    cachedInputTokens === null &&
    outputTokens === null &&
    reasoningOutputTokens === null &&
    totalTokens === null
  ) {
    return null;
  }

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens
  };
};

const isInactiveStatus = (status: RunStatus | null | undefined): status is RunStatus =>
  Boolean(status && status !== "idle" && status !== "running" && status !== "drafting");

const terminalStatusFromEvent = (event: RelayCodexEvent | null, statusOverride?: RunStatus | null): RunStatus | null => {
  if (isInactiveStatus(statusOverride)) return statusOverride;
  if (!event) return null;
  if (event.type === "run.completed") return event.finalStatus ?? "completed";
  if (event.type === "clarification.requested") return "blocked";
  if (event.type === "run.failed") {
    if (event.finalStatus) return event.finalStatus;
    const detailsCode = isRecord(event.details) && typeof event.details.code === "string" ? event.details.code : "";
    return /cancel|abort/i.test(event.message) || detailsCode === "cancelled" ? "cancelled" : "failed";
  }
  return null;
};

const isTerminalEvent = (event: RelayCodexEvent): boolean =>
  event.type === "run.completed" || event.type === "run.failed" || event.type === "clarification.requested";

export const summarizeRunLogLines = (
  ticketId: string,
  runId: string,
  lines: RunLogLine[],
  statusOverride?: RunStatus | null
): RunSummary | null => {
  if (lines.length === 0) return null;

  const entries = lines.map((line) => ({ line, event: relayEventFromRunLogLine(line) }));
  const startedEntry = entries.find(({ event }) => event.type === "run.started") ?? null;
  const terminalEntry = [...entries].reverse().find(({ event }) => isTerminalEvent(event)) ?? null;
  const latestEventAt = entries.reduce<string | null>((latest, { line }) => {
    if (!latest) return line.timestamp;
    const latestMs = timestampMs(latest) ?? 0;
    const currentMs = timestampMs(line.timestamp) ?? 0;
    return currentMs >= latestMs ? line.timestamp : latest;
  }, null);
  const finalStatus = terminalStatusFromEvent(terminalEntry?.event ?? null, statusOverride);
  const startedAt = startedEntry?.line.timestamp ?? entries[0]?.line.timestamp ?? null;
  const endedAt = terminalEntry?.line.timestamp ?? (isInactiveStatus(finalStatus) ? latestEventAt : null);
  const startMs = timestampMs(startedAt);
  const endMs = timestampMs(endedAt);
  const completedEntryWithUsage = [...entries]
    .reverse()
    .find(({ event }) => event.type === "run.completed" && event.usage !== undefined);
  const usage =
    completedEntryWithUsage?.event.type === "run.completed" ? summarizeRunUsage(completedEntryWithUsage.event.usage) : null;
  const threadId =
    (startedEntry?.event.type === "run.started" ? startedEntry.event.threadId : null) ??
    entries.find(({ line }) => line.threadId)?.line.threadId ??
    null;

  return {
    schemaVersion: RELAY_SCHEMA_VERSION,
    ticketId,
    runId,
    threadId,
    startedAt,
    endedAt,
    durationMs: startMs !== null && endMs !== null ? Math.max(0, endMs - startMs) : null,
    finalStatus,
    usage,
    eventCount: entries.length,
    latestEventAt
  };
};

export const writeRunLogEffect = (
  projectPath: string,
  ticketId: string,
  runId: string,
  threadId: string,
  event: RelayCodexEvent
): Effect.Effect<void, unknown, BackendServices> =>
  Effect.gen(function*() {
    const filePath = pathJoin(runsPath(projectPath), ticketId, `${runId}.jsonl`);
    yield* makeDirectoryEffect(pathDirname(filePath));
    const { type, timestamp, ...payload } = event;
    const record: RunLogLine = {
      schemaVersion: RELAY_SCHEMA_VERSION,
      timestamp,
      ticketId,
      runId,
      threadId,
      type,
      payload
    };
    yield* appendTextFileEffect(filePath, `${JSON.stringify(record)}\n`);
  });

export const writeRunLog = (
  projectPath: string,
  ticketId: string,
  runId: string,
  threadId: string,
  event: RelayCodexEvent
): Promise<void> => runBackendEffect(writeRunLogEffect(projectPath, ticketId, runId, threadId, event));

export const emitRunEventEffect = (
  projectPath: string,
  ticketId: string,
  runId: string,
  threadId: string,
  event: RelayCodexEvent
): Effect.Effect<void, unknown, BackendServices | Context.Service.Identifier<typeof RelayWindow>> =>
  Effect.gen(function*() {
    yield* writeRunLogEffect(projectPath, ticketId, runId, threadId, event);
    const relayWindow = yield* RelayWindow;
    yield* relayWindow.sendRunEvent(rendererRunEventFromRelayEvent(projectPath, ticketId, runId, event));
  });

export const RunEventSinkLive = Layer.succeed(RunEventSink)({
  emit: emitRunEventEffect
});

export const emitRunEvent = (
  projectPath: string,
  ticketId: string,
  runId: string,
  threadId: string,
  event: RelayCodexEvent
): Promise<void> => runBackendEffect(RunEventSink.use((sink) => sink.emit(projectPath, ticketId, runId, threadId, event)));

export const emitRunEventToRendererSink = (
  rendererSink: RendererRunEventSink,
  projectPath: string,
  ticketId: string,
  runId: string,
  threadId: string,
  event: RelayCodexEvent
): Promise<void> =>
  runBackendEffect(
    Effect.gen(function*() {
      yield* writeRunLogEffect(projectPath, ticketId, runId, threadId, event);
      yield* fromPromise(() => Promise.resolve(rendererSink.emit(rendererRunEventFromRelayEvent(projectPath, ticketId, runId, event))));
    })
  );

export const readRunEvents = async (projectPath: string, ticketId: string, runId: string): Promise<RendererRunEvent[]> => {
  const filePath = pathJoin(runsPath(projectPath), ticketId, `${runId}.jsonl`);
  let raw = "";
  try {
    raw = await runBackendEffect(readTextFileEffect(filePath));
  } catch (error) {
    if (isFileNotFoundError(error)) return [];
    throw error;
  }

  return parseRunLogLines(raw).map((parsed) => {
    const event = relayEventFromRunLogLine(parsed);
    return rendererRunEventFromRelayEvent(projectPath, parsed.ticketId, parsed.runId, event);
  });
};

export const readRunSummary = async (
  projectPath: string,
  ticketId: string,
  runId: string,
  statusOverride?: RunStatus | null
): Promise<RunSummary | null> => {
  const filePath = pathJoin(runsPath(projectPath), ticketId, `${runId}.jsonl`);
  let raw = "";
  try {
    raw = await runBackendEffect(readTextFileEffect(filePath));
  } catch (error) {
    if (isFileNotFoundError(error)) return null;
    throw error;
  }

  return summarizeRunLogLines(ticketId, runId, parseRunLogLines(raw), statusOverride);
};
