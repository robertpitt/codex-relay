import { Context, Effect, Layer, Option } from "effect";
import type { AgentTicketUpdateInput, CreateDraftInput, StartRunInput } from "@shared/types";
import { appendTextFileEffect, makeDirectoryEffect, pathDirname, pathResolve } from "../../io";
import { RegistryStore } from "../registry";
import { BackendClock, runBackendEffect } from "../../runtime";
import { kernelAuditLogPath } from "../../storage/paths";
import { RelayWorkflowEngineLive } from "./engine";
import { JobLedger, JobLedgerLive } from "./ledger";
import {
  type JobCommandType,
  type JobExecutionHandle,
  type JobExecutionSnapshot,
  type JobExecutionStatus,
  type JobSubmitInput,
  RELAY_KERNEL_SCHEMA_VERSION,
  snapshotToHandle
} from "./types";
import { RelayExternalJobWorkflow, RELAY_EXTERNAL_JOB_WORKFLOW_NAME, type ExternalJobWorkflowPayload } from "./workflows";

type SupervisorEffect<A> = Effect.Effect<A, unknown, any>;

export type IdempotencyService = {
  readonly key: (parts: readonly unknown[]) => string;
};

export const IdempotencyService = Context.Service<IdempotencyService>("relay/IdempotencyService");

const normalizeIdempotencyValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

export const IdempotencyServiceLive = Layer.succeed(IdempotencyService)({
  key: (parts) => parts.map(normalizeIdempotencyValue).join(":")
});

export type AuditService = {
  readonly emit: (event: {
    readonly projectPath: string;
    readonly eventType: string;
    readonly actor?: "system" | "codex" | "user";
    readonly executionId?: string;
    readonly runId?: string | null;
    readonly ticketId?: string | null;
    readonly payload?: Record<string, unknown>;
  }) => SupervisorEffect<void>;
};

export const AuditService = Context.Service<AuditService>("relay/AuditService");

export const AuditServiceLive = Layer.succeed(AuditService)({
  emit: (event) =>
    Effect.gen(function*() {
      const clock = yield* BackendClock;
      const record = {
        schemaVersion: RELAY_KERNEL_SCHEMA_VERSION,
        timestamp: clock.nowIso(),
        actor: event.actor ?? "system",
        source: "backend_kernel",
        eventType: event.eventType,
        projectPath: event.projectPath,
        executionId: event.executionId,
        runId: event.runId ?? null,
        ticketId: event.ticketId ?? null,
        payload: event.payload ?? {}
      };
      const target = kernelAuditLogPath(event.projectPath);
      yield* makeDirectoryEffect(pathDirname(target));
      yield* appendTextFileEffect(target, `${JSON.stringify(record)}\n`);
    })
});

export type WorkerRegistry = {
  readonly dispatch: (command: {
    readonly projectPath: string;
    readonly workerType: "local" | "remote";
    readonly payload: Record<string, unknown>;
  }) => SupervisorEffect<JobExecutionHandle>;
};

export const WorkerRegistry = Context.Service<WorkerRegistry>("relay/WorkerRegistry");

export type JobSupervisorService = {
  readonly submit: (input: JobSubmitInput) => SupervisorEffect<JobExecutionHandle>;
  readonly submitCodexImplementation: (
    input: StartRunInput,
    options: { readonly runId: string; readonly resume: boolean }
  ) => SupervisorEffect<JobExecutionHandle>;
  readonly submitTicketDraft: (
    input: CreateDraftInput,
    options: { readonly runId: string; readonly ticketId: string }
  ) => SupervisorEffect<JobExecutionHandle>;
  readonly submitTicketUpdate: (
    input: AgentTicketUpdateInput,
    options: { readonly runId: string }
  ) => SupervisorEffect<JobExecutionHandle>;
  readonly markRunStatus: (
    projectPath: string,
    runId: string,
    status: JobExecutionStatus,
    options?: { readonly result?: unknown; readonly error?: unknown; readonly message?: string; readonly metadata?: Record<string, unknown> }
  ) => SupervisorEffect<JobExecutionSnapshot | null>;
  readonly poll: (projectPath: string, executionId: string) => SupervisorEffect<JobExecutionSnapshot | null>;
  readonly cancel: (projectPath: string, executionId: string) => SupervisorEffect<void>;
  readonly resume: (projectPath: string, executionId: string) => SupervisorEffect<void>;
  readonly recoverProject: (projectPath: string) => SupervisorEffect<JobExecutionHandle[]>;
  readonly recoverFromRegistry: () => SupervisorEffect<JobExecutionHandle[]>;
};

export const JobSupervisor = Context.Service<JobSupervisorService>("relay/JobSupervisor");

const externalPayload = (input: JobSubmitInput): ExternalJobWorkflowPayload => ({
  projectPath: input.projectPath,
  commandType: input.commandType,
  idempotencyKey: input.idempotencyKey,
  runId: input.runId ?? null,
  ticketId: input.ticketId ?? null,
  payload: input.payload
});

const submit = (input: JobSubmitInput): SupervisorEffect<JobExecutionHandle> =>
  Effect.gen(function*() {
    const ledger = yield* JobLedger;
    const audit = yield* AuditService;
    const payload = externalPayload(input);
    const submitted = yield* ledger.recordSubmitted(input);
    const queued = submitted.status === "submitted"
      ? yield* ledger.transition({ projectPath: input.projectPath, executionId: input.executionId, status: "queued" })
      : submitted;
    yield* audit.emit({
      projectPath: input.projectPath,
      eventType: "kernel.job.submitted",
      executionId: input.executionId,
      runId: input.runId,
      ticketId: input.ticketId,
      payload: { commandType: input.commandType, status: queued.status }
    });
    yield* RelayExternalJobWorkflow.execute(payload, { discard: true });
    return snapshotToHandle(queued);
  });

const submitCommand = (
  commandType: JobCommandType,
  projectPathInput: string,
  idempotencyKeyParts: readonly unknown[],
  payload: Record<string, unknown>,
  options: {
    readonly runId?: string | null;
    readonly ticketId?: string | null;
    readonly metadata?: Record<string, unknown>;
  } = {}
): SupervisorEffect<JobExecutionHandle> =>
  Effect.gen(function*() {
    const idempotency = yield* IdempotencyService;
    const projectPath = pathResolve(projectPathInput);
    const idempotencyKey = idempotency.key([commandType, projectPath, ...idempotencyKeyParts]);
    const workflowPayload: ExternalJobWorkflowPayload = {
      projectPath,
      commandType,
      idempotencyKey,
      runId: options.runId ?? null,
      ticketId: options.ticketId ?? null,
      payload
    };
    const executionId = yield* RelayExternalJobWorkflow.executionId(workflowPayload);
    return yield* submit({
      executionId,
      workflowName: RELAY_EXTERNAL_JOB_WORKFLOW_NAME,
      commandType,
      projectPath,
      idempotencyKey,
      runId: options.runId ?? null,
      ticketId: options.ticketId ?? null,
      payload,
      metadata: options.metadata
    });
  });

const submitCodexImplementation: JobSupervisorService["submitCodexImplementation"] = (input, options) =>
  submitCommand(
    "codex.implementation",
    input.projectPath,
    [input.ticketId, options.runId],
    { ...input, projectPath: pathResolve(input.projectPath), runId: options.runId, resume: options.resume },
    { runId: options.runId, ticketId: input.ticketId, metadata: { resume: options.resume } }
  );

const submitTicketDraft: JobSupervisorService["submitTicketDraft"] = (input, options) =>
  submitCommand(
    "codex.ticketDraft",
    input.projectPath,
    [options.ticketId, options.runId],
    { ...input, projectPath: pathResolve(input.projectPath), runId: options.runId, ticketId: options.ticketId },
    { runId: options.runId, ticketId: options.ticketId }
  );

const submitTicketUpdate: JobSupervisorService["submitTicketUpdate"] = (input, options) =>
  submitCommand(
    "codex.ticketUpdate",
    input.projectPath,
    [input.ticketId, options.runId],
    { ...input, projectPath: pathResolve(input.projectPath), runId: options.runId },
    { runId: options.runId, ticketId: input.ticketId }
  );

const markRunStatus: JobSupervisorService["markRunStatus"] = (projectPathInput, runId, status, options = {}) =>
  Effect.gen(function*() {
    const projectPath = pathResolve(projectPathInput);
    const ledger = yield* JobLedger;
    const audit = yield* AuditService;
    const snapshot = yield* ledger.findByRunId(projectPath, runId);
    if (!snapshot) return null;
    const updated = yield* ledger.transition({
      projectPath,
      executionId: snapshot.executionId,
      status,
      result: options.result,
      error: options.error,
      message: options.message,
      metadata: options.metadata
    });
    yield* audit.emit({
      projectPath,
      eventType: "kernel.job.status_changed",
      executionId: snapshot.executionId,
      runId,
      ticketId: snapshot.ticketId,
      payload: { fromStatus: snapshot.status, toStatus: status, message: options.message }
    });
    if (status === "cancelled") {
      yield* Effect.catch(RelayExternalJobWorkflow.interrupt(snapshot.executionId), () => Effect.void);
    } else if (status === "suspended") {
      yield* Effect.catch(RelayExternalJobWorkflow.resume(snapshot.executionId), () => Effect.void);
    }
    return updated;
  });

const poll: JobSupervisorService["poll"] = (projectPath, executionId) =>
  JobLedger.use((ledger) => ledger.readSnapshot(pathResolve(projectPath), executionId));

const cancel: JobSupervisorService["cancel"] = (projectPath, executionId) =>
  Effect.gen(function*() {
    const ledger = yield* JobLedger;
    const snapshot = yield* ledger.readSnapshot(pathResolve(projectPath), executionId);
    if (snapshot && snapshot.status !== "cancelled") {
      yield* ledger.transition({
        projectPath: snapshot.projectPath,
        executionId,
        status: "cancelled",
        message: "Cancellation requested."
      });
    }
    yield* Effect.catch(RelayExternalJobWorkflow.interrupt(executionId), () => Effect.void);
  });

const resume: JobSupervisorService["resume"] = (projectPath, executionId) =>
  Effect.gen(function*() {
    const ledger = yield* JobLedger;
    const snapshot = yield* ledger.readSnapshot(pathResolve(projectPath), executionId);
    if (!snapshot) return;
    if (snapshot.status === "suspended") {
      yield* ledger.transition({
        projectPath: snapshot.projectPath,
        executionId,
        status: "running",
        message: "Workflow resumed."
      });
    }
    yield* RelayExternalJobWorkflow.resume(executionId);
  });

const recoverProject: JobSupervisorService["recoverProject"] = (projectPathInput) =>
  Effect.gen(function*() {
    const projectPath = pathResolve(projectPathInput);
    const ledger = yield* JobLedger;
    const incomplete = yield* ledger.listIncomplete(projectPath);
    const handles: JobExecutionHandle[] = [];
    for (const snapshot of incomplete) {
      yield* ledger.transition({
        projectPath,
        executionId: snapshot.executionId,
        status: snapshot.status,
        message: "Recovered incomplete workflow on boot.",
        metadata: { recovered: true }
      }).pipe(Effect.catch(() => Effect.succeed(snapshot)));
      yield* Effect.catch(RelayExternalJobWorkflow.resume(snapshot.executionId), () => Effect.void);
      handles.push(snapshotToHandle(snapshot));
    }
    return handles;
  });

const recoverFromRegistry = (): SupervisorEffect<JobExecutionHandle[]> =>
  Effect.gen(function*() {
    const registry = yield* RegistryStore.use((store) => store.read());
    const handles: JobExecutionHandle[] = [];
    for (const project of registry.projects) {
      const recovered = yield* Effect.catch(recoverProject(project.path), () => Effect.succeed<JobExecutionHandle[]>([]));
      handles.push(...recovered);
    }
    return handles;
  });

export const WorkerRegistryLive = Layer.succeed(WorkerRegistry)({
  dispatch: (command) =>
    submitCommand(
      "worker.dispatch",
      command.projectPath,
      [command.workerType, command.payload],
      { workerType: command.workerType, ...command.payload },
      { metadata: { workerType: command.workerType } }
    )
});

export const JobSupervisorLive = Layer.succeed(JobSupervisor)({
  submit,
  submitCodexImplementation,
  submitTicketDraft,
  submitTicketUpdate,
  markRunStatus,
  poll,
  cancel,
  resume,
  recoverProject,
  recoverFromRegistry
});

const SupervisorRuntimeLive = Layer.mergeAll(
  JobLedgerLive,
  IdempotencyServiceLive,
  AuditServiceLive,
  WorkerRegistryLive,
  JobSupervisorLive,
  RelayWorkflowEngineLive.pipe(Layer.provide(JobLedgerLive))
);

const runSupervisor = <A>(effect: Effect.Effect<A, unknown, any>): Promise<A> =>
  runBackendEffect(
    Effect.gen(function*() {
      const supervisor = yield* Effect.serviceOption(JobSupervisor);
      if (Option.isSome(supervisor)) {
        return yield* effect;
      }
      return yield* Effect.provide(effect, SupervisorRuntimeLive);
    })
  );

export const submitCodexImplementationJob = (
  input: StartRunInput,
  options: { readonly runId: string; readonly resume: boolean }
): Promise<JobExecutionHandle> =>
  runSupervisor(JobSupervisor.use((supervisor) => supervisor.submitCodexImplementation(input, options)));

export const submitTicketDraftJob = (
  input: CreateDraftInput,
  options: { readonly runId: string; readonly ticketId: string }
): Promise<JobExecutionHandle> => runSupervisor(JobSupervisor.use((supervisor) => supervisor.submitTicketDraft(input, options)));

export const submitTicketUpdateJob = (
  input: AgentTicketUpdateInput,
  options: { readonly runId: string }
): Promise<JobExecutionHandle> => runSupervisor(JobSupervisor.use((supervisor) => supervisor.submitTicketUpdate(input, options)));

export const markKernelRunStatus = (
  projectPath: string,
  runId: string,
  status: JobExecutionStatus,
  options?: { readonly result?: unknown; readonly error?: unknown; readonly message?: string; readonly metadata?: Record<string, unknown> }
): Promise<JobExecutionSnapshot | null> =>
  runSupervisor(JobSupervisor.use((supervisor) => supervisor.markRunStatus(projectPath, runId, status, options)));

export const recoverKernelFromRegistry = (): Promise<JobExecutionHandle[]> =>
  runSupervisor(JobSupervisor.use((supervisor) => supervisor.recoverFromRegistry()));
