import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { ulid } from "ulid";
import { BackendClock } from "../../../platform";
import { isFileNotFoundError } from "../../../platform/PlatformError";
import type { BackendIoServices, BackendServicesBase } from "../../../runtime";
import { workRunEventsPath, workRunsPath, workRunSnapshotPath } from "../../../storage/paths";
import {
  applyWorkTransition,
  isTerminalWorkStatus,
  RELAY_WORK_SCHEMA_VERSION,
  snapshotToWorkHandle,
  validateWorkTransition,
  workEventTypeForStatus,
  type WorkEvent,
  type WorkEventType,
  type WorkHandle,
  type WorkRunSnapshot,
  type WorkSubmitInput,
  type WorkTransitionInput
} from "../domain";
import {
  WorkJsonParseError,
  WorkNotFoundError,
  WorkPersistenceError,
  type WorkError,
  workPersistenceError
} from "../domain";

type WorkBaseServices = BackendServicesBase | BackendIoServices;
type WorkEffect<A> = Effect.Effect<A, WorkError, WorkBaseServices>;

const processLocks = new Map<string, Promise<void>>();

const acquireProcessLock = (key: string): Effect.Effect<() => void> =>
  Effect.promise(async () => {
    const previous = processLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = previous.catch(() => undefined).then(() => lock);
    processLocks.set(key, current);
    await previous.catch(() => undefined);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      release();
      if (processLocks.get(key) === current) processLocks.delete(key);
    };
  });

const withProcessLock = <A, E, R>(key: string, effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.flatMap(acquireProcessLock(key), (release) =>
      Effect.ensuring(restore(effect), Effect.sync(release))
    )
  );

export type WorkLedgerService = {
  readonly submit: (input: WorkSubmitInput) => WorkEffect<WorkRunSnapshot>;
  readonly transition: (input: WorkTransitionInput) => WorkEffect<WorkRunSnapshot>;
  readonly readSnapshot: (projectPath: string, workId: string) => WorkEffect<WorkRunSnapshot | null>;
  readonly readEvents: (projectPath: string, workId: string) => WorkEffect<WorkEvent[]>;
  readonly listProjectWork: (projectPath: string) => WorkEffect<WorkRunSnapshot[]>;
  readonly listIncomplete: (projectPath: string) => WorkEffect<WorkRunSnapshot[]>;
  readonly findByRunId: (projectPath: string, runId: string) => WorkEffect<WorkRunSnapshot | null>;
  readonly findByIdempotencyKey: (
    projectPath: string,
    kind: string,
    idempotencyKey: string
  ) => WorkEffect<WorkRunSnapshot | null>;
};

export const WorkLedger = Context.Service<WorkLedgerService>("relay/WorkLedger");

const safeWorkId = (workId: string): string => workId.replace(/[^a-zA-Z0-9._-]/g, "_");

const newWorkEventId = (): string => `wevt_${ulid().toLowerCase()}`;
const newWorkId = (): string => `work_${ulid().toLowerCase()}`;

const parseJson = <A>(raw: string, target: string): Effect.Effect<A, WorkJsonParseError> =>
  Effect.try({
    try: () => JSON.parse(raw) as A,
    catch: (cause) =>
      new WorkJsonParseError({
        target,
        message: `Could not parse work JSON at ${target}: ${cause instanceof Error ? cause.message : String(cause)}`,
        cause
      })
  });

const readJsonOrNull = <A>(target: string): Effect.Effect<A | null, WorkJsonParseError | WorkPersistenceError, BackendIoServices> =>
  FileSystem.FileSystem.use((fs) => fs.readFileString(target, "utf8")).pipe(
    Effect.catchIf(isFileNotFoundError, () => Effect.succeed(null as string | null)),
    Effect.mapError((cause) => workPersistenceError(target, "read work JSON", cause)),
    Effect.flatMap((raw) => raw === null ? Effect.succeed(null) : parseJson<A>(raw, target))
  );

const atomicWriteTextEffect = (target: string, value: string): Effect.Effect<void, WorkPersistenceError, BackendIoServices> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    const tmp = `${target}.${ulid().toLowerCase()}.tmp`;
    yield* fs.writeFileString(tmp, value);
    yield* fs.rename(tmp, target);
  }).pipe(Effect.mapError((cause) => workPersistenceError(target, "write work JSON", cause)));

const appendEvent = (event: WorkEvent): WorkEffect<void> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = workRunEventsPath(path, event.projectPath, safeWorkId(event.workId));
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.writeFileString(target, `${JSON.stringify(event)}\n`, { flag: "a" });
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof WorkPersistenceError
        ? cause
        : workPersistenceError(`${event.projectPath}:${event.workId}`, "append work event", cause)
    )
  );

const writeSnapshot = (snapshot: WorkRunSnapshot): WorkEffect<void> =>
  Effect.gen(function*() {
    const path = yield* Path.Path;
    yield* atomicWriteTextEffect(
      workRunSnapshotPath(path, snapshot.projectPath, safeWorkId(snapshot.workId)),
      `${JSON.stringify(snapshot, null, 2)}\n`
    );
  });

const makeEvent = (
  snapshot: WorkRunSnapshot,
  type: WorkEventType,
  timestamp: string,
  options: Pick<WorkEvent, "attemptId" | "payload" | "message" | "metadata"> = {}
): WorkEvent => ({
  schemaVersion: RELAY_WORK_SCHEMA_VERSION,
  eventId: newWorkEventId(),
  workId: snapshot.workId,
  attemptId: options.attemptId ?? snapshot.currentAttempt?.attemptId ?? null,
  sequence: snapshot.lastAppliedEventSequence + 1,
  timestamp,
  type,
  projectPath: snapshot.projectPath,
  ticketId: snapshot.ticketId,
  runId: snapshot.runId,
  payload: options.payload,
  message: options.message,
  metadata: options.metadata
});

const readSnapshot = (projectPath: string, workId: string): WorkEffect<WorkRunSnapshot | null> =>
  Effect.gen(function*() {
    const path = yield* Path.Path;
    return yield* readJsonOrNull<WorkRunSnapshot>(workRunSnapshotPath(path, projectPath, safeWorkId(workId)));
  });

const submit = (input: WorkSubmitInput): WorkEffect<WorkRunSnapshot> =>
  withProcessLock(`work-submit:${input.projectPath}`, Effect.gen(function*() {
    const existingById = input.workId ? yield* readSnapshot(input.projectPath, input.workId) : null;
    if (existingById) return existingById;
    const existingByKey = yield* findByIdempotencyKey(input.projectPath, input.kind, input.idempotencyKey);
    if (existingByKey) return existingByKey;

    const clock = yield* BackendClock;
    const now = clock.nowIso();
    const workId = input.workId ?? input.runId ?? newWorkId();
    const snapshot: WorkRunSnapshot = {
      schemaVersion: RELAY_WORK_SCHEMA_VERSION,
      workId,
      projectPath: input.projectPath,
      ticketId: input.ticketId ?? null,
      runId: input.runId ?? workId,
      subject: input.subject,
      action: input.action,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      status: "created",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      lastAppliedEventSequence: 0,
      executor: input.executor,
      providerId: input.providerId ?? null,
      requiredCapabilities: input.requiredCapabilities,
      providerCapabilities: input.providerCapabilities,
      providerSessionRef: input.providerSessionRef ?? null,
      currentAttempt: null,
      payload: input.payload,
      metadata: input.metadata
    };
    const event = makeEvent(snapshot, "work.submitted", now, {
      payload: input.payload,
      metadata: input.metadata
    });
    const submitted = { ...snapshot, lastAppliedEventSequence: event.sequence };
    yield* appendEvent(event);
    yield* writeSnapshot(submitted);
    return submitted;
  }));

const transition = (input: WorkTransitionInput): WorkEffect<WorkRunSnapshot> =>
  withProcessLock(`work:${input.projectPath}:${input.workId}`, Effect.gen(function*() {
    const current = yield* readSnapshot(input.projectPath, input.workId);
    if (!current) {
      return yield* Effect.fail(
        new WorkNotFoundError({
          projectPath: input.projectPath,
          workId: input.workId,
          message: `Work does not exist: ${input.workId}`
        })
      );
    }

    if (current.status === input.status && isTerminalWorkStatus(current.status)) return current;
    const invalid = validateWorkTransition(current, input);
    if (invalid) return yield* Effect.fail(invalid);

    const clock = yield* BackendClock;
    const now = clock.nowIso();
    const event = makeEvent(current, input.eventType ?? workEventTypeForStatus(input.status), now, {
      attemptId: input.attemptId ?? input.attempt?.attemptId ?? current.currentAttempt?.attemptId ?? null,
      payload: input.payload ?? input.result ?? input.error,
      message: input.message,
      metadata: input.metadata
    });
    const next = applyWorkTransition(current, input, now, event.sequence);
    yield* appendEvent(event);
    yield* writeSnapshot(next);
    return next;
  }));

const readEvents = (projectPath: string, workId: string): WorkEffect<WorkEvent[]> =>
  Effect.gen(function*() {
    const path = yield* Path.Path;
    const target = workRunEventsPath(path, projectPath, safeWorkId(workId));
    const raw = yield* FileSystem.FileSystem.use((fs) => fs.readFileString(target, "utf8")).pipe(
      Effect.catchIf(isFileNotFoundError, () => Effect.succeed("")),
      Effect.mapError((cause) => workPersistenceError(target, "read work events", cause))
    );
    const clock = yield* BackendClock;
    const lines = raw.split("\n");
    const events: WorkEvent[] = [];
    for (const [index, line] of lines.entries()) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as WorkEvent);
      } catch (cause) {
        const hasLaterNonEmptyLine = lines.slice(index + 1).some((later) => later.trim());
        if (hasLaterNonEmptyLine) {
          return yield* Effect.fail(
            new WorkJsonParseError({
              target,
              message: `Could not parse work event at ${target}:${index + 1}.`,
              cause
            })
          );
        }
        events.push({
          schemaVersion: RELAY_WORK_SCHEMA_VERSION,
          eventId: newWorkEventId(),
          workId,
          attemptId: null,
          sequence: events.length + 1,
          timestamp: clock.nowIso(),
          type: "work.corrupt_event_ignored",
          projectPath,
          payload: { line: index + 1 },
          message: `Ignored corrupt trailing work event at line ${index + 1}.`,
          metadata: { line: index + 1 }
        });
      }
    }
    return events;
  });

const listProjectWork = (projectPath: string): WorkEffect<WorkRunSnapshot[]> =>
  Effect.gen(function*() {
    const path = yield* Path.Path;
    const target = workRunsPath(path, projectPath);
    const names = yield* FileSystem.FileSystem.use((fs) => fs.readDirectory(target)).pipe(
      Effect.catchIf(isFileNotFoundError, () => Effect.succeed<string[]>([])),
      Effect.mapError((cause) => workPersistenceError(target, "list work runs", cause))
    );
    const snapshots: WorkRunSnapshot[] = [];
    for (const name of names) {
      const snapshot = yield* Effect.catch(readSnapshot(projectPath, name), () => Effect.succeed(null));
      if (snapshot) snapshots.push(snapshot);
    }
    return snapshots.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  });

const listIncomplete = (projectPath: string): WorkEffect<WorkRunSnapshot[]> =>
  Effect.map(listProjectWork(projectPath), (snapshots) => snapshots.filter((snapshot) => !isTerminalWorkStatus(snapshot.status)));

const findByRunId = (projectPath: string, runId: string): WorkEffect<WorkRunSnapshot | null> =>
  Effect.map(
    listProjectWork(projectPath),
    (snapshots) => snapshots.find((snapshot) => snapshot.runId === runId || snapshot.workId === runId || snapshot.payload.runId === runId) ?? null
  );

const findByIdempotencyKey = (projectPath: string, kind: string, idempotencyKey: string): WorkEffect<WorkRunSnapshot | null> =>
  Effect.map(
    listProjectWork(projectPath),
    (snapshots) =>
      snapshots.find((snapshot) => snapshot.kind === kind && snapshot.idempotencyKey === idempotencyKey) ?? null
  );

export const WorkLedgerLive = Layer.succeed(WorkLedger)({
  submit,
  transition,
  readSnapshot,
  readEvents,
  listProjectWork,
  listIncomplete,
  findByRunId,
  findByIdempotencyKey
});

export { snapshotToWorkHandle };
