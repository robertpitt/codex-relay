import { Context, Effect, Layer, Path } from "effect";
import { ulid } from "ulid";
import { RegistryStore } from "../../registry";
import { BackendClock } from "../../../platform";
import type { BackendIoServices, BackendServicesBase } from "../../../runtime";
import { isTicketNotFoundError, readTicket, writeTicket } from "../../../storage";
import {
  isTerminalWorkStatus,
  snapshotToWorkHandle,
  type ProviderSessionRef,
  type WorkAttemptReportInput,
  type WorkAttemptSnapshot,
  type WorkClaimInput,
  type WorkCancelInput,
  type WorkClaim,
  type WorkClaimNextInput,
  type WorkHandle,
  type WorkReportBlockedInput,
  type WorkReportCancelledInput,
  type WorkReportCompletedInput,
  type WorkReportFailedInput,
  type WorkReportProgressInput,
  type WorkReportStartedInput,
  type WorkResumeInput,
  type WorkRunSnapshot,
  type WorkStatus,
  type WorkSubmitInput
} from "../domain";
import {
  WorkLeaseMismatchError,
  WorkNotFoundError,
  type WorkError,
  workPersistenceError
} from "../domain";
import { WorkLedger, type WorkLedgerService } from "../ledger";
import { WorkScheduler } from "../scheduler";

type WorkEngineCoreServices =
  | BackendServicesBase
  | BackendIoServices
  | Context.Service.Identifier<typeof WorkLedger>
  | Context.Service.Identifier<typeof WorkScheduler>
  | Context.Service.Identifier<typeof WorkEngine>;

type WorkEngineEffect<A, Extra = never> = Effect.Effect<A, WorkError, WorkEngineCoreServices | Extra>;

export type WorkRecoveryReport = {
  readonly projectPath: string;
  readonly recovered: readonly WorkHandle[];
  readonly wakeProjectPaths?: readonly string[];
};

export type WorkEngineService = {
  readonly submit: (input: WorkSubmitInput) => WorkEngineEffect<WorkHandle>;
  readonly claimWork: (input: WorkClaimInput) => WorkEngineEffect<WorkClaim | null>;
  readonly claimNext: (input: WorkClaimNextInput) => WorkEngineEffect<WorkClaim | null>;
  readonly heartbeat: (input: WorkAttemptReportInput) => WorkEngineEffect<void>;
  readonly reportStarted: (input: WorkReportStartedInput) => WorkEngineEffect<WorkRunSnapshot>;
  readonly reportProgress: (input: WorkReportProgressInput) => WorkEngineEffect<WorkRunSnapshot>;
  readonly reportBlocked: (input: WorkReportBlockedInput) => WorkEngineEffect<WorkRunSnapshot>;
  readonly reportCompleted: (input: WorkReportCompletedInput) => WorkEngineEffect<WorkRunSnapshot>;
  readonly reportFailed: (input: WorkReportFailedInput) => WorkEngineEffect<WorkRunSnapshot>;
  readonly reportCancelled: (input: WorkReportCancelledInput) => WorkEngineEffect<WorkRunSnapshot>;
  readonly cancel: (input: WorkCancelInput) => WorkEngineEffect<WorkRunSnapshot | null>;
  readonly resume: (input: WorkResumeInput) => WorkEngineEffect<WorkRunSnapshot | null>;
  readonly poll: (projectPath: string, workId: string) => WorkEngineEffect<WorkRunSnapshot | null>;
  readonly findByRunId: (projectPath: string, runId: string) => WorkEngineEffect<WorkRunSnapshot | null>;
  readonly recoverProject: (projectPath: string) => WorkEngineEffect<WorkRecoveryReport>;
  readonly recoverAll: () => WorkEngineEffect<WorkRecoveryReport[], Context.Service.Identifier<typeof RegistryStore>>;
};

export const WorkEngine = Context.Service<WorkEngineService>("relay/WorkEngine");

const resolvePath = (target: string): Effect.Effect<string, never, Path.Path> =>
  Path.Path.use((path) => Effect.succeed(path.resolve(target)));

const logWorkInfo = (message: string, metadata: Record<string, unknown> = {}): Effect.Effect<void> =>
  Effect.logInfo(message).pipe(Effect.annotateLogs({ scope: "work", ...metadata }));

const newAttemptId = (): string => `attempt_${ulid().toLowerCase()}`;
const newLeaseToken = (): string => `lease_${ulid().toLowerCase()}`;

const makeAttempt = (
  clock: { readonly nowIso: () => string; readonly nowMs: () => number },
  executor: "agent" | "system" | "worker",
  providerId: string | null | undefined,
  providerSessionRef?: ProviderSessionRef | null
): WorkAttemptSnapshot => {
  const now = clock.nowIso();
  return {
    attemptId: newAttemptId(),
    leaseToken: newLeaseToken(),
    executor,
    providerId: providerId ?? null,
    claimedAt: now,
    heartbeatAt: now,
    startedAt: null,
    providerSessionRef: providerSessionRef ?? null
  };
};

const readRequiredSnapshot = (
  ledger: WorkLedgerService,
  projectPath: string,
  workId: string
): WorkEngineEffect<WorkRunSnapshot> =>
  Effect.gen(function*() {
    const snapshot = yield* ledger.readSnapshot(projectPath, workId);
    if (snapshot) return snapshot;
    return yield* Effect.fail(
      new WorkNotFoundError({
        projectPath,
        workId,
        message: `Work does not exist: ${workId}`
      })
    );
  });

const assertAttempt = (snapshot: WorkRunSnapshot, input: WorkAttemptReportInput): WorkEngineEffect<WorkAttemptSnapshot> =>
  Effect.gen(function*() {
    const attempt = snapshot.currentAttempt;
    if (!attempt || attempt.attemptId !== input.attemptId) {
      return yield* Effect.fail(
        new WorkLeaseMismatchError({
          workId: snapshot.workId,
          attemptId: input.attemptId,
          message: `Attempt ${input.attemptId} is not active for work ${snapshot.workId}.`
        })
      );
    }
    if (attempt.leaseToken !== input.leaseToken) {
      return yield* Effect.fail(
        new WorkLeaseMismatchError({
          workId: snapshot.workId,
          attemptId: input.attemptId,
          message: `Lease token does not match active attempt for work ${snapshot.workId}.`
        })
      );
    }
    return attempt;
  });

const readTicketForRecovery = (projectPath: string, ticketId: string): Effect.Effect<Awaited<ReturnType<typeof readTicket>> | null> =>
  Effect.promise(async () => {
    try {
      return await readTicket(projectPath, ticketId);
    } catch (error) {
      if (isTicketNotFoundError(error)) return null;
      throw error;
    }
  }).pipe(Effect.catch(() => Effect.succeed(null)));

const writeRecoveredTicketRunState = (
  projectPath: string,
  ticket: Awaited<ReturnType<typeof readTicket>>,
  patch: {
    readonly authoringState?: NonNullable<Awaited<ReturnType<typeof readTicket>>["frontMatter"]["authoringState"]>;
    readonly runStatus?: NonNullable<Awaited<ReturnType<typeof readTicket>>["frontMatter"]["runStatus"]>;
    readonly lastRunId?: string | null;
  }
): Effect.Effect<void> =>
  Effect.promise(() =>
    writeTicket(projectPath, {
      ...ticket,
      frontMatter: {
        ...ticket.frontMatter,
        ...patch
      }
    }).then(() => undefined)
  ).pipe(Effect.catch(() => Effect.void));

const submit: WorkEngineService["submit"] = (input) =>
  Effect.gen(function*() {
    const ledger = yield* WorkLedger;
    const created = yield* ledger.submit(input);
    const queued = created.status === "created"
      ? yield* ledger.transition({
        projectPath: created.projectPath,
        workId: created.workId,
        status: "queued",
        message: "Work queued."
      })
      : created;
    yield* logWorkInfo("Work submitted", {
      projectPath: queued.projectPath,
      workId: queued.workId,
      runId: queued.runId,
      ticketId: queued.ticketId,
      kind: queued.kind,
      status: queued.status,
      executor: queued.executor,
      providerId: queued.providerId
    });
    return snapshotToWorkHandle(queued);
  });

const claimSnapshot = (
  snapshot: WorkRunSnapshot,
  input: Pick<WorkClaimInput, "executor" | "providerId" | "providerSessionRef">
): WorkEngineEffect<WorkClaim> =>
  Effect.gen(function*() {
    const ledger = yield* WorkLedger;
    const clock = yield* BackendClock;
    const attempt = makeAttempt(clock, input.executor, input.providerId, input.providerSessionRef ?? snapshot.providerSessionRef);
    const queued = snapshot.status === "created" || snapshot.status === "stale"
      ? yield* ledger.transition({
        projectPath: snapshot.projectPath,
        workId: snapshot.workId,
        status: "queued",
        message: "Work queued before claim."
      })
      : snapshot;
    const running = yield* ledger.transition({
      projectPath: queued.projectPath,
      workId: queued.workId,
      status: "running",
      eventType: "work.claimed",
      attempt,
      attemptId: attempt.attemptId,
      leaseToken: attempt.leaseToken,
      providerSessionRef: input.providerSessionRef ?? undefined,
      message: "Work claimed by executor.",
      metadata: {
        executor: input.executor,
        providerId: input.providerId ?? null
      }
    });
    yield* logWorkInfo("Work claimed", {
      projectPath: running.projectPath,
      workId: running.workId,
      runId: running.runId,
      ticketId: running.ticketId,
      kind: running.kind,
      attemptId: attempt.attemptId,
      executor: attempt.executor,
      providerId: attempt.providerId
    });
    return {
      ...snapshotToWorkHandle(running),
      attemptId: attempt.attemptId,
      leaseToken: attempt.leaseToken,
      payload: running.payload
    };
  });

const claimWork: WorkEngineService["claimWork"] = (input) =>
  Effect.gen(function*() {
    const projectPath = yield* resolvePath(input.projectPath);
    const ledger = yield* WorkLedger;
    const snapshot = yield* ledger.findByRunId(projectPath, input.workId);
    if (!snapshot || isTerminalWorkStatus(snapshot.status)) return null;
    if (snapshot.status !== "created" && snapshot.status !== "queued" && snapshot.status !== "stale") {
      return yield* Effect.fail(
        new WorkLeaseMismatchError({
          workId: snapshot.workId,
          attemptId: snapshot.currentAttempt?.attemptId ?? input.workId,
          message: `Work ${snapshot.workId} is already claimed.`
        })
      );
    }
    return yield* claimSnapshot(snapshot, input);
  });

const claimNext: WorkEngineService["claimNext"] = (input) =>
  Effect.gen(function*() {
    const projectPath = yield* resolvePath(input.projectPath);
    const scheduler = yield* WorkScheduler;
    const ledger = yield* WorkLedger;
    const queued = yield* scheduler.firstQueuedImplementation(projectPath, input.workId);
    if (!queued) return null;
    const [workId, intent] = queued;
    const snapshot = yield* ledger.readSnapshot(projectPath, workId);
    if (!snapshot || isTerminalWorkStatus(snapshot.status)) {
      yield* scheduler.removeQueuedImplementation(workId);
      return null;
    }
    const claim = yield* claimSnapshot(snapshot, input);
    yield* scheduler.markImplementationStarting(workId, {
      projectPath,
      ticketId: intent.input.ticketId,
      attemptId: claim.attemptId,
      leaseToken: claim.leaseToken
    });
    yield* logWorkInfo("Queued implementation work claimed", {
      projectPath,
      workId,
      runId: claim.runId,
      ticketId: claim.ticketId,
      attemptId: claim.attemptId,
      providerId: claim.providerId
    });
    return claim;
  });

const heartbeat: WorkEngineService["heartbeat"] = (input) =>
  Effect.gen(function*() {
    const ledger = yield* WorkLedger;
    const clock = yield* BackendClock;
    const snapshot = yield* readRequiredSnapshot(ledger, input.projectPath, input.workId);
    const attempt = yield* assertAttempt(snapshot, input);
    yield* ledger.transition({
      projectPath: input.projectPath,
      workId: input.workId,
      status: snapshot.status,
      eventType: "work.heartbeat",
      attempt: { ...attempt, heartbeatAt: clock.nowIso() },
      attemptId: attempt.attemptId,
      leaseToken: attempt.leaseToken,
      message: "Work heartbeat."
    });
  });

const reportStarted: WorkEngineService["reportStarted"] = (input) =>
  Effect.gen(function*() {
    const ledger = yield* WorkLedger;
    const clock = yield* BackendClock;
    const snapshot = yield* readRequiredSnapshot(ledger, input.projectPath, input.workId);
    const attempt = yield* assertAttempt(snapshot, input);
    const started = yield* ledger.transition({
      projectPath: input.projectPath,
      workId: input.workId,
      status: "running",
      attempt: {
        ...attempt,
        startedAt: attempt.startedAt ?? clock.nowIso(),
        heartbeatAt: clock.nowIso(),
        providerSessionRef: input.providerSessionRef ?? attempt.providerSessionRef
      },
      attemptId: input.attemptId,
      leaseToken: input.leaseToken,
      providerSessionRef: input.providerSessionRef ?? undefined,
      message: input.message ?? "Work started.",
      metadata: {
        ...input.metadata,
        providerCapabilities: input.providerCapabilities
      }
    });
    yield* logWorkInfo("Work started", {
      projectPath: started.projectPath,
      workId: started.workId,
      runId: started.runId,
      ticketId: started.ticketId,
      kind: started.kind,
      attemptId: input.attemptId,
      providerId: started.currentAttempt?.providerId ?? started.providerId,
      providerSessionId: started.providerSessionRef?.externalId
    });
    return started;
  });

const reportProgress: WorkEngineService["reportProgress"] = (input) =>
  Effect.gen(function*() {
    const ledger = yield* WorkLedger;
    const clock = yield* BackendClock;
    const snapshot = yield* readRequiredSnapshot(ledger, input.projectPath, input.workId);
    const attempt = yield* assertAttempt(snapshot, input);
    const progressed = yield* ledger.transition({
      projectPath: input.projectPath,
      workId: input.workId,
      status: snapshot.status,
      eventType: "work.progress",
      attempt: { ...attempt, heartbeatAt: clock.nowIso() },
      attemptId: input.attemptId,
      leaseToken: input.leaseToken,
      payload: input.payload,
      message: input.message ?? "Work progress reported.",
      metadata: input.metadata
    });
    yield* logWorkInfo("Work progress reported", {
      projectPath: progressed.projectPath,
      workId: progressed.workId,
      runId: progressed.runId,
      ticketId: progressed.ticketId,
      kind: progressed.kind,
      status: progressed.status,
      attemptId: input.attemptId
    });
    return progressed;
  });

const reportBlocked: WorkEngineService["reportBlocked"] = (input) =>
  Effect.gen(function*() {
    const ledger = yield* WorkLedger;
    const snapshot = yield* readRequiredSnapshot(ledger, input.projectPath, input.workId);
    yield* assertAttempt(snapshot, input);
    const blocked = yield* ledger.transition({
      projectPath: input.projectPath,
      workId: input.workId,
      status: "blocked",
      attempt: snapshot.currentAttempt,
      attemptId: input.attemptId,
      leaseToken: input.leaseToken,
      result: input.result,
      message: input.reason,
      metadata: input.metadata
    });
    yield* logWorkInfo("Work blocked", {
      projectPath: blocked.projectPath,
      workId: blocked.workId,
      runId: blocked.runId,
      ticketId: blocked.ticketId,
      kind: blocked.kind,
      attemptId: input.attemptId,
      reason: input.reason
    });
    return blocked;
  });

const reportCompleted: WorkEngineService["reportCompleted"] = (input) =>
  Effect.gen(function*() {
    const ledger = yield* WorkLedger;
    const snapshot = yield* readRequiredSnapshot(ledger, input.projectPath, input.workId);
    if (snapshot.status === "completed") return snapshot;
    yield* assertAttempt(snapshot, input);
    const completed = yield* ledger.transition({
      projectPath: input.projectPath,
      workId: input.workId,
      status: "completed",
      attempt: snapshot.currentAttempt,
      attemptId: input.attemptId,
      leaseToken: input.leaseToken,
      result: input.result,
      message: input.message ?? "Work completed.",
      metadata: input.metadata
    });
    yield* logWorkInfo("Work completed", {
      projectPath: completed.projectPath,
      workId: completed.workId,
      runId: completed.runId,
      ticketId: completed.ticketId,
      kind: completed.kind,
      attemptId: input.attemptId
    });
    return completed;
  });

const reportFailed: WorkEngineService["reportFailed"] = (input) =>
  Effect.gen(function*() {
    const ledger = yield* WorkLedger;
    const snapshot = yield* readRequiredSnapshot(ledger, input.projectPath, input.workId);
    if (snapshot.status === "failed") return snapshot;
    yield* assertAttempt(snapshot, input);
    const failed = yield* ledger.transition({
      projectPath: input.projectPath,
      workId: input.workId,
      status: "failed",
      attempt: snapshot.currentAttempt,
      attemptId: input.attemptId,
      leaseToken: input.leaseToken,
      error: input.error,
      message: input.message,
      metadata: input.metadata
    });
    yield* logWorkInfo("Work failed", {
      projectPath: failed.projectPath,
      workId: failed.workId,
      runId: failed.runId,
      ticketId: failed.ticketId,
      kind: failed.kind,
      attemptId: input.attemptId,
      message: input.message
    });
    return failed;
  });

const reportCancelled: WorkEngineService["reportCancelled"] = (input) =>
  Effect.gen(function*() {
    const ledger = yield* WorkLedger;
    const snapshot = yield* readRequiredSnapshot(ledger, input.projectPath, input.workId);
    if (snapshot.status === "cancelled") return snapshot;
    yield* assertAttempt(snapshot, input);
    const cancellable = snapshot.status === "running"
      ? yield* ledger.transition({
        projectPath: input.projectPath,
        workId: input.workId,
        status: "cancelling",
        attempt: snapshot.currentAttempt,
        attemptId: input.attemptId,
        leaseToken: input.leaseToken,
        message: input.message ?? "Work cancellation acknowledged.",
        metadata: input.metadata
      })
      : snapshot;
    const cancelled = yield* ledger.transition({
      projectPath: input.projectPath,
      workId: input.workId,
      status: "cancelled",
      attempt: cancellable.currentAttempt,
      attemptId: input.attemptId,
      leaseToken: input.leaseToken,
      message: input.message ?? "Work cancelled.",
      metadata: input.metadata
    });
    yield* logWorkInfo("Work cancelled", {
      projectPath: cancelled.projectPath,
      workId: cancelled.workId,
      runId: cancelled.runId,
      ticketId: cancelled.ticketId,
      kind: cancelled.kind,
      attemptId: input.attemptId
    });
    return cancelled;
  });

const cancel: WorkEngineService["cancel"] = (input) =>
  Effect.gen(function*() {
    const projectPath = yield* resolvePath(input.projectPath);
    const ledger = yield* WorkLedger;
    const snapshot = yield* ledger.findByRunId(projectPath, input.workId);
    if (!snapshot) return null;
    if (isTerminalWorkStatus(snapshot.status)) return snapshot;
    if (snapshot.status === "running") {
      const cancelling = yield* ledger.transition({
        projectPath,
        workId: snapshot.workId,
        status: "cancelling",
        message: input.message ?? "Cancellation requested.",
        metadata: input.metadata
      });
      yield* logWorkInfo("Work cancellation requested", {
        projectPath,
        workId: cancelling.workId,
        runId: cancelling.runId,
        ticketId: cancelling.ticketId,
        kind: cancelling.kind,
        status: cancelling.status
      });
      return cancelling;
    }
    const cancelled = yield* ledger.transition({
      projectPath,
      workId: snapshot.workId,
      status: "cancelled",
      message: input.message ?? "Cancellation requested.",
      metadata: input.metadata
    });
    yield* logWorkInfo("Work cancelled before start", {
      projectPath,
      workId: cancelled.workId,
      runId: cancelled.runId,
      ticketId: cancelled.ticketId,
      kind: cancelled.kind
    });
    return cancelled;
  });

const resume: WorkEngineService["resume"] = (input) =>
  Effect.gen(function*() {
    const projectPath = yield* resolvePath(input.projectPath);
    const ledger = yield* WorkLedger;
    const snapshot = yield* ledger.findByRunId(projectPath, input.workId);
    if (!snapshot) return null;
    if (snapshot.status !== "blocked" && snapshot.status !== "stale") return snapshot;
    const resumed = yield* ledger.transition({
      projectPath,
      workId: snapshot.workId,
      status: "queued",
      attempt: null,
      message: input.message ?? "Work resumed.",
      metadata: input.metadata
    });
    yield* logWorkInfo("Work resumed", {
      projectPath,
      workId: resumed.workId,
      runId: resumed.runId,
      ticketId: resumed.ticketId,
      kind: resumed.kind,
      fromStatus: snapshot.status
    });
    return resumed;
  });

const poll: WorkEngineService["poll"] = (projectPathInput, workId) =>
  Effect.gen(function*() {
    const projectPath = yield* resolvePath(projectPathInput);
    const ledger = yield* WorkLedger;
    return yield* ledger.readSnapshot(projectPath, workId);
  });

const findByRunId: WorkEngineService["findByRunId"] = (projectPathInput, runId) =>
  Effect.gen(function*() {
    const projectPath = yield* resolvePath(projectPathInput);
    const ledger = yield* WorkLedger;
    return yield* ledger.findByRunId(projectPath, runId);
  });

const recoverProject: WorkEngineService["recoverProject"] = (projectPathInput) =>
  Effect.gen(function*() {
    const projectPath = yield* resolvePath(projectPathInput);
    const ledger = yield* WorkLedger;
    const scheduler = yield* WorkScheduler;
    const incomplete = yield* ledger.listIncomplete(projectPath);
    yield* logWorkInfo("Work recovery started", {
      projectPath,
      incompleteCount: incomplete.length
    });
    const recovered: WorkHandle[] = [];
    const wakeProjectPaths = new Set<string>();
    for (const snapshot of incomplete) {
      const ticket = snapshot.ticketId ? yield* readTicketForRecovery(projectPath, snapshot.ticketId) : null;
      if (snapshot.subject === "ticket" && snapshot.ticketId && !ticket) {
        const cancelled = yield* ledger.transition({
          projectPath,
          workId: snapshot.workId,
          status: "cancelled",
          attempt: null,
          eventType: "work.recovery_conflict",
          message: "Recovered ticket work by cancelling it because the ticket is missing.",
          metadata: { recovered: true, reason: "missing_ticket", ticketId: snapshot.ticketId }
        }).pipe(Effect.catch(() => Effect.succeed(snapshot)));
        yield* logWorkInfo("Recovered orphaned work", {
          projectPath,
          workId: cancelled.workId,
          runId: cancelled.runId,
          ticketId: snapshot.ticketId,
          kind: cancelled.kind,
          status: cancelled.status,
          reason: "missing_ticket"
        });
        recovered.push(snapshotToWorkHandle(cancelled));
        continue;
      }
      if (snapshot.kind === "ticket.implementation" && snapshot.ticketId && (snapshot.status === "created" || snapshot.status === "queued")) {
        if (ticket && ticket.frontMatter.lastRunId === snapshot.runId && ticket.frontMatter.runStatus !== "queued") {
          yield* writeRecoveredTicketRunState(projectPath, ticket, {
            authoringState: "ready",
            runStatus: "queued",
            lastRunId: snapshot.runId ?? snapshot.workId
          });
        }
        yield* scheduler.enqueueImplementation(snapshot.workId, {
          input: {
            projectPath,
            ticketId: snapshot.ticketId
          },
          resume: Boolean(snapshot.payload.resume),
          dependencies: {}
        });
        yield* scheduler.wakeProjectScheduler(projectPath);
        wakeProjectPaths.add(projectPath);
        const queued = yield* ledger.transition({
          projectPath,
          workId: snapshot.workId,
          status: snapshot.status === "created" ? "queued" : snapshot.status,
          eventType: "work.recovered",
          message: "Recovered queued implementation work on boot.",
          metadata: { recovered: true }
        }).pipe(Effect.catch(() => Effect.succeed(snapshot)));
        yield* logWorkInfo("Recovered queued implementation work", {
          projectPath,
          workId: queued.workId,
          runId: queued.runId,
          ticketId: queued.ticketId,
          status: queued.status,
          wakeProject: true
        });
      } else if (snapshot.status === "running" && snapshot.kind === "ticket.implementation" && snapshot.ticketId) {
        const stale = yield* ledger.transition({
          projectPath,
          workId: snapshot.workId,
          status: "stale",
          eventType: "work.recovered",
          message: "Running implementation work marked stale during app recovery.",
          metadata: { recovered: true }
        }).pipe(Effect.catch(() => Effect.succeed(snapshot)));
        const resumable = Boolean(snapshot.providerSessionRef ?? snapshot.payload.resume);
        if (resumable) {
          if (ticket && ticket.frontMatter.lastRunId === snapshot.runId) {
            yield* writeRecoveredTicketRunState(projectPath, ticket, {
              authoringState: "ready",
              runStatus: "queued",
              lastRunId: snapshot.runId ?? snapshot.workId
            });
          }
          const queued = yield* ledger.transition({
            projectPath,
            workId: snapshot.workId,
            status: "queued",
            attempt: null,
            eventType: "work.recovered",
            message: "Recovered stale implementation work by requeueing it.",
            metadata: { recovered: true, resumedFrom: stale.status }
          }).pipe(Effect.catch(() => Effect.succeed(stale)));
          yield* scheduler.enqueueImplementation(snapshot.workId, {
            input: {
              projectPath,
              ticketId: snapshot.ticketId
            },
            resume: true,
            dependencies: {}
          });
          yield* scheduler.wakeProjectScheduler(projectPath);
          wakeProjectPaths.add(projectPath);
          yield* logWorkInfo("Recovered stale implementation work by requeueing", {
            projectPath,
            workId: queued.workId,
            runId: queued.runId,
            ticketId: queued.ticketId,
            fromStatus: snapshot.status,
            status: queued.status,
            wakeProject: true
          });
          recovered.push(snapshotToWorkHandle(queued));
          continue;
        }
        if (ticket && ticket.frontMatter.lastRunId === snapshot.runId) {
          yield* writeRecoveredTicketRunState(projectPath, ticket, {
            runStatus: "cancelled",
            lastRunId: snapshot.runId ?? snapshot.workId
          });
        }
        const cancelled = yield* ledger.transition({
          projectPath,
          workId: snapshot.workId,
          status: "cancelled",
          attempt: null,
          eventType: "work.recovered",
          message: "Recovered stale implementation work by cancelling it because it is not resumable.",
          metadata: { recovered: true, reason: "not_resumable" }
        }).pipe(Effect.catch(() => Effect.succeed(stale)));
        yield* logWorkInfo("Recovered stale implementation work by cancelling", {
          projectPath,
          workId: cancelled.workId,
          runId: cancelled.runId,
          ticketId: cancelled.ticketId,
          status: cancelled.status,
          reason: "not_resumable"
        });
      } else if (snapshot.status === "running" && (snapshot.kind === "ticket.draft" || snapshot.kind === "ticket.update")) {
        const stale = yield* ledger.transition({
          projectPath,
          workId: snapshot.workId,
          status: "stale",
          eventType: "work.recovered",
          message: "Running ticket work marked stale during app recovery.",
          metadata: { recovered: true }
        }).pipe(Effect.catch(() => Effect.succeed(snapshot)));
        const cancelled = yield* ledger.transition({
          projectPath,
          workId: snapshot.workId,
          status: "cancelled",
          attempt: null,
          eventType: "work.recovered",
          message: "Recovered non-resumable ticket work by cancelling it.",
          metadata: { recovered: true, reason: "not_resumable", staleStatus: stale.status }
        }).pipe(Effect.catch(() => Effect.succeed(stale)));
        yield* logWorkInfo("Recovered non-resumable ticket work", {
          projectPath,
          workId: cancelled.workId,
          runId: cancelled.runId,
          ticketId: cancelled.ticketId,
          kind: cancelled.kind,
          status: cancelled.status
        });
        if (ticket && ticket.frontMatter.lastRunId === snapshot.runId) {
          yield* writeRecoveredTicketRunState(projectPath, ticket, {
            authoringState: snapshot.kind === "ticket.draft" ? "rough" : ticket.frontMatter.authoringState,
            runStatus: "cancelled",
            lastRunId: snapshot.runId ?? snapshot.workId
          });
        }
      } else if (snapshot.status === "blocked" && ticket && ticket.frontMatter.lastRunId === snapshot.runId && ticket.frontMatter.runStatus !== "blocked") {
        yield* writeRecoveredTicketRunState(projectPath, ticket, {
          authoringState: "needs_input",
          runStatus: "blocked",
          lastRunId: snapshot.runId ?? snapshot.workId
        });
        yield* ledger.transition({
          projectPath,
          workId: snapshot.workId,
          status: snapshot.status,
          eventType: "work.recovered",
          message: "Recovered blocked work and restored ticket-visible blocked state.",
          metadata: { recovered: true }
        }).pipe(Effect.catch(() => Effect.succeed(snapshot)));
        yield* logWorkInfo("Recovered blocked work", {
          projectPath,
          workId: snapshot.workId,
          runId: snapshot.runId,
          ticketId: snapshot.ticketId,
          kind: snapshot.kind,
          restoredTicketState: true
        });
      } else {
        const recoveredSnapshot = yield* ledger.transition({
          projectPath,
          workId: snapshot.workId,
          status: snapshot.status,
          eventType: "work.recovered",
          message: "Recovered incomplete work on boot.",
          metadata: { recovered: true }
        }).pipe(Effect.catch(() => Effect.succeed(snapshot)));
        yield* logWorkInfo("Recovered incomplete work", {
          projectPath,
          workId: recoveredSnapshot.workId,
          runId: recoveredSnapshot.runId,
          ticketId: recoveredSnapshot.ticketId,
          kind: recoveredSnapshot.kind,
          status: recoveredSnapshot.status
        });
      }
      recovered.push(snapshotToWorkHandle(snapshot));
    }
    yield* logWorkInfo("Work recovery finished", {
      projectPath,
      recoveredCount: recovered.length,
      wakeProjectCount: wakeProjectPaths.size
    });
    return { projectPath, recovered, wakeProjectPaths: [...wakeProjectPaths] };
  });

const recoverAll: WorkEngineService["recoverAll"] = () =>
  Effect.gen(function*() {
    const registry = yield* RegistryStore.use((store) => store.read()).pipe(
      Effect.catch((cause: unknown) =>
        Effect.fail(workPersistenceError("app registry", "read work recovery registry", cause))
      )
    );
    const reports: WorkRecoveryReport[] = [];
    for (const project of registry.projects) {
      const recovered = yield* Effect.catch(recoverProject(project.path), () =>
        Effect.succeed<WorkRecoveryReport>({ projectPath: project.path, recovered: [] })
      );
      reports.push(recovered);
    }
    return reports;
  });

export const WorkEngineLive = Layer.succeed(WorkEngine)({
  submit,
  claimWork,
  claimNext,
  heartbeat,
  reportStarted,
  reportProgress,
  reportBlocked,
  reportCompleted,
  reportFailed,
  reportCancelled,
  cancel,
  resume,
  poll,
  findByRunId,
  recoverProject,
  recoverAll
});

export const workStatusFromLegacyStatus = (status: WorkStatus | "submitted" | "suspended"): WorkStatus => {
  switch (status) {
    case "submitted":
      return "created";
    case "suspended":
      return "blocked";
    default:
      return status;
  }
};
