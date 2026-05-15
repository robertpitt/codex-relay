import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { ulid } from "ulid";
import { BackendClock } from "../../platform";
import type { BackendIoServices, BackendServicesBase } from "../../runtime";
import { isFileNotFoundError } from "../../platform/PlatformError";
import { kernelJobEventsPath, kernelJobsPath, kernelJobSnapshotPath } from "../../storage/paths";
import {
  isTerminalJobStatus,
  jobEventTypeForStatus,
  RELAY_KERNEL_SCHEMA_VERSION,
  type JobExecutionSnapshot,
  type JobLedgerEvent,
  type JobSubmitInput,
  type JobTransitionInput
} from "./types";
import {
  KernelJobNotFoundError,
  KernelJsonParseError,
  KernelPersistenceError,
  type KernelError,
  kernelPersistenceError
} from "./errors";
import { applyJobTransition, isBlockedByTerminalStatus } from "./state";

type KernelBaseServices = BackendServicesBase | BackendIoServices;
type KernelEffect<A> = Effect.Effect<A, KernelError, KernelBaseServices>;

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

const parseJson = <A>(raw: string, target: string): Effect.Effect<A, KernelJsonParseError> =>
  Effect.try({
    try: () => JSON.parse(raw) as A,
    catch: (cause) =>
      new KernelJsonParseError({
        target,
        message: `Could not parse kernel JSON at ${target}: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause
      })
  });

const readJsonOrNull = <A>(target: string): Effect.Effect<A | null, KernelJsonParseError | KernelPersistenceError, BackendIoServices> =>
  FileSystem.FileSystem.use((fs) => fs.readFileString(target, "utf8")).pipe(
    Effect.catchIf(isFileNotFoundError, () => Effect.succeed(null as string | null)),
    Effect.mapError((cause) => kernelPersistenceError(target, "read kernel JSON", cause)),
    Effect.flatMap((raw) => raw === null ? Effect.succeed(null) : parseJson<A>(raw, target))
  );

const atomicWriteTextEffect = (target: string, value: string): Effect.Effect<void, KernelPersistenceError, BackendIoServices> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    const tmp = `${target}.${ulid().toLowerCase()}.tmp`;
    yield* fs.writeFileString(tmp, value);
    yield* fs.rename(tmp, target);
  }).pipe(Effect.mapError((cause) => kernelPersistenceError(target, "write kernel JSON", cause)));

const appendEvent = (event: JobLedgerEvent): KernelEffect<void> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = kernelJobEventsPath(path, event.projectPath, safeExecutionId(event.executionId));
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.writeFileString(target, `${JSON.stringify(event)}\n`, { flag: "a" });
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof KernelPersistenceError
        ? cause
        : kernelPersistenceError(`${event.projectPath}:${event.executionId}`, "append kernel event", cause)
    )
  );

const writeSnapshot = (snapshot: JobExecutionSnapshot): KernelEffect<void> =>
  Effect.gen(function*() {
    const path = yield* Path.Path;
    yield* atomicWriteTextEffect(
      kernelJobSnapshotPath(path, snapshot.projectPath, safeExecutionId(snapshot.executionId)),
      `${JSON.stringify(snapshot, null, 2)}\n`
    );
  });

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
  Effect.gen(function*() {
    const path = yield* Path.Path;
    return yield* readJsonOrNull<JobExecutionSnapshot>(kernelJobSnapshotPath(path, projectPath, safeExecutionId(executionId)));
  });

const transition = (input: JobTransitionInput): KernelEffect<JobExecutionSnapshot> =>
  Effect.gen(function*() {
    const current = yield* readSnapshot(input.projectPath, input.executionId);
    if (!current) {
      return yield* Effect.fail(
        new KernelJobNotFoundError({
          projectPath: input.projectPath,
          executionId: input.executionId,
          message: `Kernel job does not exist: ${input.executionId}`
        })
      );
    }
    if (isBlockedByTerminalStatus(current, input)) return current;

    const clock = yield* BackendClock;
    const now = clock.nowIso();
    const next = applyJobTransition(current, input, now);

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
    const path = yield* Path.Path;
    const target = kernelJobEventsPath(path, projectPath, safeExecutionId(executionId));
    const raw = yield* FileSystem.FileSystem.use((fs) => fs.readFileString(target, "utf8")).pipe(
      Effect.catchIf(isFileNotFoundError, () => Effect.succeed("")),
      Effect.mapError((cause) => kernelPersistenceError(target, "read kernel events", cause))
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
    const path = yield* Path.Path;
    const target = kernelJobsPath(path, projectPath);
    const names = yield* FileSystem.FileSystem.use((fs) => fs.readDirectory(target)).pipe(
      Effect.catchIf(isFileNotFoundError, () => Effect.succeed<string[]>([])),
      Effect.mapError((cause) => kernelPersistenceError(target, "list kernel jobs", cause))
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
