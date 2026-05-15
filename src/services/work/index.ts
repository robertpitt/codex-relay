import { Context, Effect, Layer } from "effect";
import type { AgentTicketUpdateInput, CreateDraftInput, StartRunInput, TicketRedraftInput } from "@shared/schemas";
import { RegistryStore, RegistryStoreLive } from "../registry";
import type { BackendIoServices, BackendServicesBase } from "../../runtime";
import { runBackendEffect } from "../../runtime";
import { WorkEngine, WorkEngineLive, workStatusFromLegacyStatus, type WorkRecoveryReport } from "./engine";
import { WorkLedger, WorkLedgerLive } from "./ledger";
import { WorkRecovery, WorkRecoveryLive } from "./recovery";
import { WorkRuntime, WorkRuntimeLive } from "./runtime";
import { WorkScheduler, WorkSchedulerLive } from "./scheduler";
import { TicketWorkService, TicketWorkServiceLive } from "./ticket";
import { WorkLeaseMismatchError, type WorkError, type WorkHandle, type WorkRunSnapshot, type WorkStatus } from "./domain";

export * from "./domain";
export * from "./engine";
export * from "./ledger";
export * from "./ports";
export * from "./recovery";
export * from "./runtime";
export * from "./scheduler";
export * from "./ticket";

export type WorkExecutionStatus = WorkStatus;

export const BackendWorkBaseLive = Layer.mergeAll(
  WorkLedgerLive,
  WorkSchedulerLive,
  WorkEngineLive,
  TicketWorkServiceLive,
  WorkRuntimeLive,
  WorkRecoveryLive
);

export type BackendWorkBaseServices =
  | Context.Service.Identifier<typeof WorkLedger>
  | Context.Service.Identifier<typeof WorkScheduler>
  | Context.Service.Identifier<typeof WorkEngine>
  | Context.Service.Identifier<typeof TicketWorkService>
  | Context.Service.Identifier<typeof WorkRuntime>
  | Context.Service.Identifier<typeof WorkRecovery>;

export type BackendWorkServices = BackendWorkBaseServices;
export type BackendWorkRequirements = BackendServicesBase | BackendIoServices;

export const BackendWorkLive: Layer.Layer<BackendWorkServices, never, BackendWorkRequirements> = BackendWorkBaseLive;

type WorkPromiseServices = BackendWorkServices | BackendWorkRequirements | Context.Service.Identifier<typeof RegistryStore>;

const WorkPromiseLive = Layer.mergeAll(BackendWorkLive, RegistryStoreLive);

const runWork = <A>(effect: Effect.Effect<A, WorkError, WorkPromiseServices>): Promise<A> =>
  runBackendEffect(Effect.provide(effect, WorkPromiseLive));

export const submitTicketDraftWork = (
  input: CreateDraftInput,
  options: { readonly runId: string; readonly ticketId: string }
): Promise<WorkHandle> =>
  runWork(TicketWorkService.use((service) => service.submitDraft(input, options)));

export const submitTicketRedraftWork = (
  input: TicketRedraftInput,
  options: { readonly runId: string }
): Promise<WorkHandle> =>
  runWork(TicketWorkService.use((service) => service.submitRedraft(input, options)));

export const submitTicketUpdateWork = (
  input: AgentTicketUpdateInput,
  options: { readonly runId: string }
): Promise<WorkHandle> =>
  runWork(TicketWorkService.use((service) => service.submitUpdate(input, options)));

export const submitTicketImplementationWork = (
  input: StartRunInput,
  options: { readonly runId: string; readonly resume: boolean }
): Promise<WorkHandle> =>
  runWork(TicketWorkService.use((service) => service.submitImplementation(input, options)));

export const claimImplementationWork = async (
  projectPath: string,
  workId?: string | null
): Promise<import("./domain").WorkClaim | null> =>
  runWork(
    WorkEngine.use((engine) =>
      engine.claimNext({
        projectPath,
        workId,
        executor: "agent",
        providerId: "codex"
      })
    )
  );

export const claimWorkRun = (
  projectPath: string,
  runId: string,
  options: {
    readonly executor?: import("./domain").WorkExecutor;
    readonly providerId?: string | null;
    readonly providerSessionRef?: import("./domain").ProviderSessionRef | null;
  } = {}
): Promise<import("./domain").WorkClaim | null> =>
  runWork(
    WorkEngine.use((engine) =>
      engine.claimWork({
        projectPath,
        workId: runId,
        executor: options.executor ?? "agent",
        providerId: options.providerId ?? "codex",
        providerSessionRef: options.providerSessionRef
      })
    )
  );

export const markWorkRunStatus = (
  projectPath: string,
  runId: string,
  status: WorkStatus | "submitted" | "suspended",
  options: {
    readonly result?: unknown;
    readonly error?: unknown;
    readonly message?: string;
    readonly metadata?: Record<string, unknown>;
    readonly attemptId?: string | null;
    readonly leaseToken?: string | null;
  } = {}
): Promise<WorkRunSnapshot | null> =>
  runWork(
    Effect.gen(function*() {
      const workStatus = workStatusFromLegacyStatus(status);
      const providerSessionRef = options.metadata?.providerSessionRef as import("./domain").ProviderSessionRef | undefined;
      const engine = yield* WorkEngine;
      const ledger = yield* WorkLedger;
      const snapshot = yield* engine.findByRunId(projectPath, runId);
      if (!snapshot) return null;
      const attempt = options.attemptId && options.leaseToken
        ? {
          attemptId: options.attemptId,
          leaseToken: options.leaseToken
        }
        : null;

      if (attempt && workStatus === "running") {
        return yield* engine.reportStarted({
          projectPath: snapshot.projectPath,
          workId: snapshot.workId,
          attemptId: attempt.attemptId,
          leaseToken: attempt.leaseToken,
          providerSessionRef: options.metadata?.providerSessionRef as import("./domain").ProviderSessionRef | undefined,
          message: options.message,
          metadata: options.metadata
        });
      }
      if (attempt && workStatus === "blocked") {
        return yield* engine.reportBlocked({
          projectPath: snapshot.projectPath,
          workId: snapshot.workId,
          attemptId: attempt.attemptId,
          leaseToken: attempt.leaseToken,
          reason: options.message ?? "Work blocked.",
          result: options.result,
          metadata: options.metadata
        });
      }
      if (attempt && workStatus === "completed") {
        return yield* engine.reportCompleted({
          projectPath: snapshot.projectPath,
          workId: snapshot.workId,
          attemptId: attempt.attemptId,
          leaseToken: attempt.leaseToken,
          result: options.result,
          message: options.message,
          metadata: options.metadata
        });
      }
      if (attempt && workStatus === "failed") {
        return yield* engine.reportFailed({
          projectPath: snapshot.projectPath,
          workId: snapshot.workId,
          attemptId: attempt.attemptId,
          leaseToken: attempt.leaseToken,
          error: options.error,
          message: options.message ?? "Work failed.",
          metadata: options.metadata
        });
      }
      if (attempt && workStatus === "cancelled") {
        return yield* engine.reportCancelled({
          projectPath: snapshot.projectPath,
          workId: snapshot.workId,
          attemptId: attempt.attemptId,
          leaseToken: attempt.leaseToken,
          message: options.message,
          metadata: options.metadata
        });
      }

      if (!attempt && workStatus === "running") {
        const claim = yield* engine.claimWork({
          projectPath: snapshot.projectPath,
          workId: snapshot.workId,
          executor: "agent",
          providerId: typeof options.metadata?.providerId === "string" ? options.metadata.providerId : "codex",
          providerSessionRef
        });
        if (!claim) return snapshot;
        return yield* engine.reportStarted({
          projectPath: claim.projectPath,
          workId: claim.workId,
          attemptId: claim.attemptId,
          leaseToken: claim.leaseToken,
          providerSessionRef,
          message: options.message,
          metadata: options.metadata
        });
      }

      if (!attempt && snapshot.currentAttempt) {
        return yield* Effect.fail(
          new WorkLeaseMismatchError({
            workId: snapshot.workId,
            attemptId: snapshot.currentAttempt.attemptId,
            message: `Work ${snapshot.workId} has an active attempt and requires attempt credentials.`
          })
        );
      }

      let transitionBase = snapshot;
      if (
        (transitionBase.status === "created" && workStatus !== "created") ||
        (transitionBase.status === "queued" && (workStatus === "blocked" || workStatus === "completed" || workStatus === "failed"))
      ) {
        transitionBase = yield* ledger.transition({
          projectPath: transitionBase.projectPath,
          workId: transitionBase.workId,
          status: transitionBase.status === "created" ? "queued" : "running",
          providerSessionRef,
          message: "Work advanced for terminal report compatibility."
        });
      }

      return yield* ledger.transition({
        projectPath: transitionBase.projectPath,
        workId: transitionBase.workId,
        status: workStatus,
        result: options.result,
        error: options.error,
        providerSessionRef,
        message: options.message,
        metadata: options.metadata
      });
    })
  );

export const recoverWorkFromRegistry = (): Promise<WorkRecoveryReport[]> =>
  runWork(WorkEngine.use((engine) => engine.recoverAll()));
