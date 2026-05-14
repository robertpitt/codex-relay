import { Context, Layer } from "effect";
import { WorkflowEngine } from "effect/unstable/workflow";
import type { BackendIoServices, BackendServicesBase } from "../../runtime";
import { JobLedger, JobLedgerLive } from "./ledger";
import { RelayWorkflowEngineLive } from "./engine";
import { KernelRunRegistry, KernelRunRegistryLive } from "./runRegistry";
import {
  AuditService,
  AuditServiceLive,
  IdempotencyService,
  IdempotencyServiceLive,
  JobSupervisor,
  JobSupervisorLive,
  WorkerRegistry,
  WorkerRegistryLive
} from "./supervisor";

export {
  KernelJobNotFoundError,
  KernelJsonParseError,
  KernelPersistenceError,
  KernelWorkflowError,
  type KernelError
} from "./errors";
export {
  applyJobTransition,
  isBlockedByTerminalStatus,
  mergeJobMetadata
} from "./state";
export {
  isTerminalJobStatus,
  jobEventTypeForStatus,
  RELAY_KERNEL_SCHEMA_VERSION,
  snapshotToHandle,
  type JobCommandType,
  type JobExecutionHandle,
  type JobExecutionSnapshot,
  type JobExecutionStatus,
  type JobLedgerEvent,
  type JobLedgerEventType,
  type JobSubmitInput,
  type JobTransitionInput,
  type KernelAuditEvent
} from "./types";
export { JobLedger, JobLedgerLive, type JobLedgerService } from "./ledger";
export {
  ExternalJobWorkflowPayloadSchema,
  RelayExternalJobWorkflow,
  RELAY_EXTERNAL_JOB_WORKFLOW_NAME,
  type ExternalJobWorkflowPayload
} from "./workflows";
export { RelayWorkflowEngineLive } from "./engine";
export {
  AuditService,
  AuditServiceLive,
  IdempotencyService,
  IdempotencyServiceLive,
  JobSupervisor,
  JobSupervisorLive,
  markKernelRunStatus,
  recoverKernelFromRegistry,
  submitCodexImplementationJob,
  submitTicketDraftJob,
  submitTicketUpdateJob,
  WorkerRegistry,
  WorkerRegistryLive,
  type AuditService as AuditServiceType,
  type IdempotencyService as IdempotencyServiceType,
  type JobSupervisorService,
  type WorkerRegistry as WorkerRegistryService
} from "./supervisor";
export {
  KernelRunRegistry,
  KernelRunRegistryLive,
  runKernelRunRegistryEffect,
  type KernelActiveRun,
  type KernelQueuedRunIntent,
  type KernelRunRegistryService,
  type KernelStartingRun,
  type KernelTicketUpdateBeginResult
} from "./runRegistry";

export const BackendKernelBaseLive = Layer.mergeAll(
  JobLedgerLive,
  IdempotencyServiceLive,
  AuditServiceLive,
  WorkerRegistryLive,
  JobSupervisorLive,
  KernelRunRegistryLive
);

export type BackendKernelBaseServices =
  | Context.Service.Identifier<typeof JobLedger>
  | Context.Service.Identifier<typeof IdempotencyService>
  | Context.Service.Identifier<typeof AuditService>
  | Context.Service.Identifier<typeof WorkerRegistry>
  | Context.Service.Identifier<typeof JobSupervisor>
  | Context.Service.Identifier<typeof KernelRunRegistry>;

export type BackendKernelServices =
  | BackendKernelBaseServices
  | Context.Service.Identifier<typeof WorkflowEngine.WorkflowEngine>;

export type BackendKernelRequirements = BackendServicesBase | BackendIoServices;

const BackendKernelLiveInternal = Layer.mergeAll(
  BackendKernelBaseLive,
  RelayWorkflowEngineLive.pipe(Layer.provide(BackendKernelBaseLive))
);

export const BackendKernelLive: Layer.Layer<BackendKernelServices, never, BackendKernelRequirements> = BackendKernelLiveInternal;
