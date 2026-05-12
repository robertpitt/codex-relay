import { Layer } from "effect";
import { JobLedgerLive } from "./ledger";
import { RelayWorkflowEngineLive } from "./engine";
import { KernelRunRegistryLive } from "./runRegistry";
import {
  AuditServiceLive,
  IdempotencyServiceLive,
  JobSupervisorLive,
  WorkerRegistryLive
} from "./supervisor";

export * from "./types";
export * from "./ledger";
export * from "./workflows";
export * from "./engine";
export * from "./supervisor";
export * from "./runRegistry";

export const BackendKernelBaseLive = Layer.mergeAll(
  JobLedgerLive,
  IdempotencyServiceLive,
  AuditServiceLive,
  WorkerRegistryLive,
  JobSupervisorLive,
  KernelRunRegistryLive
);

const BackendKernelLiveInternal = Layer.mergeAll(
  BackendKernelBaseLive,
  RelayWorkflowEngineLive.pipe(Layer.provide(BackendKernelBaseLive))
);

export const BackendKernelLive = BackendKernelLiveInternal as Layer.Layer<any>;
