export const RELAY_KERNEL_SCHEMA_VERSION = 1;

export type JobCommandType =
  | "codex.implementation"
  | "codex.ticketDraft"
  | "codex.ticketUpdate"
  | "git.sync"
  | "remote.sync"
  | "worker.dispatch";

export type JobExecutionStatus = "submitted" | "queued" | "running" | "suspended" | "cancelled" | "failed" | "completed";

export type JobLedgerEventType =
  | "job.submitted"
  | "job.queued"
  | "job.running"
  | "job.suspended"
  | "job.cancelled"
  | "job.failed"
  | "job.completed"
  | "job.recovered"
  | "job.corrupt_event_ignored";

export type JobLedgerEvent = {
  readonly schemaVersion: typeof RELAY_KERNEL_SCHEMA_VERSION;
  readonly id: string;
  readonly timestamp: string;
  readonly executionId: string;
  readonly workflowName: string;
  readonly commandType: JobCommandType;
  readonly projectPath: string;
  readonly type: JobLedgerEventType;
  readonly runId?: string | null;
  readonly ticketId?: string | null;
  readonly payload?: unknown;
  readonly message?: string;
  readonly metadata?: Record<string, unknown>;
};

export type JobExecutionSnapshot = {
  readonly schemaVersion: typeof RELAY_KERNEL_SCHEMA_VERSION;
  readonly executionId: string;
  readonly workflowName: string;
  readonly commandType: JobCommandType;
  readonly projectPath: string;
  readonly idempotencyKey: string;
  readonly status: JobExecutionStatus;
  readonly attempts: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly runId?: string | null;
  readonly ticketId?: string | null;
  readonly payload: Record<string, unknown>;
  readonly result?: unknown;
  readonly error?: unknown;
  readonly message?: string;
  readonly metadata?: Record<string, unknown>;
};

export type JobSubmitInput = {
  readonly executionId: string;
  readonly workflowName: string;
  readonly commandType: JobCommandType;
  readonly projectPath: string;
  readonly idempotencyKey: string;
  readonly runId?: string | null;
  readonly ticketId?: string | null;
  readonly payload: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
};

export type JobTransitionInput = {
  readonly projectPath: string;
  readonly executionId: string;
  readonly status: JobExecutionStatus;
  readonly result?: unknown;
  readonly error?: unknown;
  readonly message?: string;
  readonly metadata?: Record<string, unknown>;
};

export type JobExecutionHandle = {
  readonly executionId: string;
  readonly workflowName: string;
  readonly commandType: JobCommandType;
  readonly projectPath: string;
  readonly status: JobExecutionStatus;
  readonly runId?: string | null;
  readonly ticketId?: string | null;
};

export type KernelAuditEvent = {
  readonly schemaVersion: typeof RELAY_KERNEL_SCHEMA_VERSION;
  readonly timestamp: string;
  readonly eventType: string;
  readonly actor: "system" | "codex" | "user";
  readonly source: "backend_kernel";
  readonly projectPath: string;
  readonly executionId?: string;
  readonly runId?: string | null;
  readonly ticketId?: string | null;
  readonly payload: Record<string, unknown>;
};

export const isTerminalJobStatus = (status: JobExecutionStatus): boolean =>
  status === "cancelled" || status === "failed" || status === "completed";

export const jobEventTypeForStatus = (status: JobExecutionStatus): JobLedgerEventType => {
  switch (status) {
    case "submitted":
      return "job.submitted";
    case "queued":
      return "job.queued";
    case "running":
      return "job.running";
    case "suspended":
      return "job.suspended";
    case "cancelled":
      return "job.cancelled";
    case "failed":
      return "job.failed";
    case "completed":
      return "job.completed";
  }
};

export const snapshotToHandle = (snapshot: JobExecutionSnapshot): JobExecutionHandle => ({
  executionId: snapshot.executionId,
  workflowName: snapshot.workflowName,
  commandType: snapshot.commandType,
  projectPath: snapshot.projectPath,
  status: snapshot.status,
  runId: snapshot.runId,
  ticketId: snapshot.ticketId
});
