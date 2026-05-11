import { Context, Effect, Layer } from "effect";
import { RELAY_SCHEMA_VERSION, type RelayCodexEvent, type RendererRunEvent, type RunLogLine } from "../../../shared/types";
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

  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parsed = runLogLineSchema.parse(JSON.parse(line));
      const event = relayCodexEventSchema.parse({
        ...parsed.payload,
        type: parsed.type,
        timestamp: parsed.timestamp
      });
      return rendererRunEventFromRelayEvent(projectPath, parsed.ticketId, parsed.runId, event);
    });
};
