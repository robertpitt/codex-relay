import { Context, Effect, Layer } from "effect";
import { ulid } from "ulid";
import { BackendClock, type BackendIoServices, type BackendServicesBase } from "../runtime";
import {
  appendTextFileEffect,
  isFileNotFoundError,
  makeDirectoryEffect,
  pathDirname,
  readDirectoryEffect,
  readTextFileEffect,
  renamePathEffect,
  writeTextFileEffect
} from "../io";
import { kernelJobEventsPath, kernelJobsPath, kernelJobSnapshotPath } from "../storage/paths";
import {
  isTerminalJobStatus,
  jobEventTypeForStatus,
  RELAY_KERNEL_SCHEMA_VERSION,
  type JobExecutionSnapshot,
  type JobLedgerEvent,
  type JobSubmitInput,
  type JobTransitionInput
} from "./types";

type KernelBaseServices = BackendServicesBase | BackendIoServices;
type KernelEffect<A> = Effect.Effect<A, unknown, KernelBaseServices>;

export type JobLedgerService = {
  readonly recordSubmitted: (input: JobSubmitInput) => KernelEffect<JobExecutionSnapshot>;
  readonly transition: (input: JobTransitionInput) => KernelEffect<JobExecutionSnapshot>;
  readonly readSnapshot: (projectPath: string, executionId: string) => KernelEffect<JobExecutionSnapshot | null>;
  readonly readEvents: (projectPath: string, executionId: string) => KernelEffect<JobLedgerEvent[]>;
  readonly listProjectExecutions: (projectPath: string) => KernelEffect<JobExecutionSnapshot[]>;
  readonly listIncomplete: (projectPath: string) => KernelEffect<JobExecutionSnapshot[]>;
  readonly findByRunId: (projectPath: string, runId: string) => KernelEffect<JobExecutionSnapshot | null>;
};

export const JobLedger = Context.Service<JobLedgerService>("relay/JobLedger");

const safeExecutionId = (executionId: string): string => executionId.replace(/[^a-zA-Z0-9._-]/g, "_");

const parseJson = <A>(raw: string, target: string): Effect.Effect<A, Error> =>
  Effect.try({
    try: () => JSON.parse(raw) as A,
    catch: (cause) => new Error(`Could not parse kernel JSON at ${target}: ${cause instanceof Error ? cause.message : String(cause)}`)
  });

const readJsonOrNull = <A>(target: string): Effect.Effect<A | null, unknown, BackendIoServices> =>
  readTextFileEffect(target).pipe(
    Effect.flatMap((raw) => parseJson<A>(raw, target)),
    Effect.catchIf(isFileNotFoundError, () => Effect.succeed(null))
  );

const atomicWriteTextEffect = (target: string, value: string): Effect.Effect<void, unknown, BackendIoServices> =>
  Effect.gen(function*() {
    yield* makeDirectoryEffect(pathDirname(target));
    const tmp = `${target}.${ulid().toLowerCase()}.tmp`;
    yield* writeTextFileEffect(tmp, value);
    yield* renamePathEffect(tmp, target);
  });

const appendEvent = (event: JobLedgerEvent): KernelEffect<void> =>
  Effect.gen(function*() {
    const target = kernelJobEventsPath(event.projectPath, safeExecutionId(event.executionId));
    yield* makeDirectoryEffect(pathDirname(target));
    yield* appendTextFileEffect(target, `${JSON.stringify(event)}\n`);
  });

const writeSnapshot = (snapshot: JobExecutionSnapshot): KernelEffect<void> =>
  atomicWriteTextEffect(
    kernelJobSnapshotPath(snapshot.projectPath, safeExecutionId(snapshot.executionId)),
    `${JSON.stringify(snapshot, null, 2)}\n`
  );

const makeEvent = (
  snapshot: JobExecutionSnapshot,
  type: JobLedgerEvent["type"],
  timestamp: string,
  options: Pick<JobLedgerEvent, "payload" | "message" | "metadata"> = {}
): JobLedgerEvent => ({
  schemaVersion: RELAY_KERNEL_SCHEMA_VERSION,
  id: newKernelEventId(),
  timestamp,
  executionId: snapshot.executionId,
  workflowName: snapshot.workflowName,
  commandType: snapshot.commandType,
  projectPath: snapshot.projectPath,
  runId: snapshot.runId,
  ticketId: snapshot.ticketId,
  type,
  ...options
});

const newKernelEventId = (): string => `kevt_${ulid().toLowerCase()}`;

const readSnapshot = (projectPath: string, executionId: string): KernelEffect<JobExecutionSnapshot | null> =>
  readJsonOrNull<JobExecutionSnapshot>(kernelJobSnapshotPath(projectPath, safeExecutionId(executionId)));

const mergeMetadata = (
  current: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  if (!current) return next;
  if (!next) return current;
  return { ...current, ...next };
};

const transition = (input: JobTransitionInput): KernelEffect<JobExecutionSnapshot> =>
  Effect.gen(function*() {
    const current = yield* readSnapshot(input.projectPath, input.executionId);
    if (!current) {
      return yield* Effect.fail(new Error(`Kernel job does not exist: ${input.executionId}`));
    }
    if (isTerminalJobStatus(current.status) && current.status !== input.status) {
      return current;
    }

    const clock = yield* BackendClock;
    const now = clock.nowIso();
    const next: JobExecutionSnapshot = {
      ...current,
      status: input.status,
      attempts: input.status === "running" && current.status !== "running" ? current.attempts + 1 : current.attempts,
      updatedAt: now,
      result: input.result ?? current.result,
      error: input.error ?? current.error,
      message: input.message ?? current.message,
      metadata: mergeMetadata(current.metadata, input.metadata)
    };

    yield* appendEvent(makeEvent(next, jobEventTypeForStatus(input.status), now, {
      payload: input.result,
      message: input.message,
      metadata: input.metadata
    }));
    yield* writeSnapshot(next);
    return next;
  });

const recordSubmitted = (input: JobSubmitInput): KernelEffect<JobExecutionSnapshot> =>
  Effect.gen(function*() {
    const existing = yield* readSnapshot(input.projectPath, input.executionId);
    if (existing) return existing;

    const clock = yield* BackendClock;
    const now = clock.nowIso();
    const snapshot: JobExecutionSnapshot = {
      schemaVersion: RELAY_KERNEL_SCHEMA_VERSION,
      executionId: input.executionId,
      workflowName: input.workflowName,
      commandType: input.commandType,
      projectPath: input.projectPath,
      idempotencyKey: input.idempotencyKey,
      status: "submitted",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      runId: input.runId ?? null,
      ticketId: input.ticketId ?? null,
      payload: input.payload,
      metadata: input.metadata
    };

    yield* appendEvent(makeEvent(snapshot, "job.submitted", now, {
      payload: input.payload,
      metadata: input.metadata
    }));
    yield* writeSnapshot(snapshot);
    return snapshot;
  });

const readEvents = (projectPath: string, executionId: string): KernelEffect<JobLedgerEvent[]> =>
  Effect.gen(function*() {
    const target = kernelJobEventsPath(projectPath, safeExecutionId(executionId));
    const raw = yield* readTextFileEffect(target).pipe(
      Effect.catchIf(isFileNotFoundError, () => Effect.succeed(""))
    );
    const clock = yield* BackendClock;
    const events: JobLedgerEvent[] = [];
    for (const [index, line] of raw.split("\n").entries()) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as JobLedgerEvent);
      } catch {
        events.push({
          schemaVersion: RELAY_KERNEL_SCHEMA_VERSION,
          id: newKernelEventId(),
          timestamp: clock.nowIso(),
          executionId,
          workflowName: "unknown",
          commandType: "worker.dispatch",
          projectPath,
          type: "job.corrupt_event_ignored",
          message: `Ignored corrupt kernel event at line ${index + 1}.`,
          metadata: { line: index + 1 }
        });
      }
    }
    return events;
  });

const listProjectExecutions = (projectPath: string): KernelEffect<JobExecutionSnapshot[]> =>
  Effect.gen(function*() {
    const names = yield* readDirectoryEffect(kernelJobsPath(projectPath)).pipe(
      Effect.catchIf(isFileNotFoundError, () => Effect.succeed<string[]>([]))
    );
    const snapshots: JobExecutionSnapshot[] = [];
    for (const name of names) {
      const snapshot = yield* Effect.catch(readSnapshot(projectPath, name), () => Effect.succeed(null));
      if (snapshot) snapshots.push(snapshot);
    }
    return snapshots.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  });

const listIncomplete = (projectPath: string): KernelEffect<JobExecutionSnapshot[]> =>
  Effect.map(listProjectExecutions(projectPath), (snapshots) => snapshots.filter((snapshot) => !isTerminalJobStatus(snapshot.status)));

const findByRunId = (projectPath: string, runId: string): KernelEffect<JobExecutionSnapshot | null> =>
  Effect.map(
    listProjectExecutions(projectPath),
    (snapshots) => snapshots.find((snapshot) => snapshot.runId === runId || snapshot.payload.runId === runId) ?? null
  );

export const JobLedgerLive = Layer.succeed(JobLedger)({
  recordSubmitted,
  transition,
  readSnapshot,
  readEvents,
  listProjectExecutions,
  listIncomplete,
  findByRunId
});
