import { Schema } from "effect";

export const RELAY_WORK_SCHEMA_VERSION = 1;

export const workSubjectSchema = Schema.Literals(["ticket", "project", "worker"]);
export type WorkSubject = typeof workSubjectSchema.Type;

export const workActionSchema = Schema.Literals(["draft", "redraft", "update", "implement", "sync", "dispatch"]);
export type WorkAction = typeof workActionSchema.Type;

export type WorkKind =
  | "ticket.draft"
  | "ticket.redraft"
  | "ticket.update"
  | "ticket.implementation"
  | "project.sync"
  | "worker.dispatch";

export type WorkExecutor = "agent" | "system" | "worker";

export type WorkStatus =
  | "created"
  | "queued"
  | "running"
  | "blocked"
  | "cancelling"
  | "stale"
  | "cancelled"
  | "failed"
  | "completed";

export type WorkEventType =
  | "work.submitted"
  | "work.queued"
  | "work.claimed"
  | "work.running"
  | "work.progress"
  | "work.heartbeat"
  | "work.blocked"
  | "work.cancelling"
  | "work.cancelled"
  | "work.failed"
  | "work.completed"
  | "work.stale"
  | "work.recovered"
  | "work.recovery_conflict"
  | "work.corrupt_event_ignored";

export type ProviderSessionRef = {
  readonly providerId: string;
  readonly externalId: string;
  readonly parts?: Record<string, string>;
  readonly metadata?: Record<string, string>;
};

export type WorkClassification = {
  readonly subject: WorkSubject;
  readonly action: WorkAction;
  readonly kind: WorkKind;
};

export type WorkAttemptSnapshot = {
  readonly attemptId: string;
  readonly leaseToken: string;
  readonly executor: WorkExecutor;
  readonly providerId?: string | null;
  readonly claimedAt: string;
  readonly heartbeatAt: string;
  readonly startedAt?: string | null;
  readonly providerSessionRef?: ProviderSessionRef | null;
};

export type WorkEvent = {
  readonly schemaVersion: typeof RELAY_WORK_SCHEMA_VERSION;
  readonly eventId: string;
  readonly workId: string;
  readonly attemptId?: string | null;
  readonly sequence: number;
  readonly timestamp: string;
  readonly type: WorkEventType;
  readonly projectPath: string;
  readonly ticketId?: string | null;
  readonly runId?: string | null;
  readonly payload?: unknown;
  readonly message?: string;
  readonly metadata?: Record<string, unknown>;
};

export type WorkRunSnapshot = WorkClassification & {
  readonly schemaVersion: typeof RELAY_WORK_SCHEMA_VERSION;
  readonly workId: string;
  readonly projectPath: string;
  readonly ticketId?: string | null;
  readonly runId?: string | null;
  readonly idempotencyKey: string;
  readonly status: WorkStatus;
  readonly attempts: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastAppliedEventSequence: number;
  readonly executor: WorkExecutor;
  readonly providerId?: string | null;
  readonly requiredCapabilities?: readonly string[];
  readonly providerCapabilities?: readonly string[];
  readonly providerSessionRef?: ProviderSessionRef | null;
  readonly currentAttempt?: WorkAttemptSnapshot | null;
  readonly payload: Record<string, unknown>;
  readonly result?: unknown;
  readonly error?: unknown;
  readonly message?: string;
  readonly metadata?: Record<string, unknown>;
};

export type WorkSubmitInput = WorkClassification & {
  readonly workId?: string;
  readonly projectPath: string;
  readonly ticketId?: string | null;
  readonly runId?: string | null;
  readonly idempotencyKey: string;
  readonly executor: WorkExecutor;
  readonly providerId?: string | null;
  readonly requiredCapabilities?: readonly string[];
  readonly providerCapabilities?: readonly string[];
  readonly providerSessionRef?: ProviderSessionRef | null;
  readonly payload: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
};

export type WorkTransitionInput = {
  readonly projectPath: string;
  readonly workId: string;
  readonly status: WorkStatus;
  readonly eventType?: WorkEventType;
  readonly attempt?: WorkAttemptSnapshot | null;
  readonly attemptId?: string | null;
  readonly leaseToken?: string | null;
  readonly providerSessionRef?: ProviderSessionRef | null;
  readonly result?: unknown;
  readonly error?: unknown;
  readonly message?: string;
  readonly payload?: unknown;
  readonly metadata?: Record<string, unknown>;
};

export type WorkHandle = {
  readonly workId: string;
  readonly runId?: string | null;
  readonly ticketId?: string | null;
  readonly projectPath: string;
  readonly kind: WorkKind;
  readonly subject: WorkSubject;
  readonly action: WorkAction;
  readonly status: WorkStatus;
  readonly executor: WorkExecutor;
  readonly providerId?: string | null;
};

export type WorkClaim = WorkHandle & {
  readonly attemptId: string;
  readonly leaseToken: string;
  readonly payload: Record<string, unknown>;
};

export type WorkClaimNextInput = {
  readonly projectPath: string;
  readonly executor: WorkExecutor;
  readonly providerId?: string | null;
  readonly workId?: string | null;
};

export type WorkClaimInput = {
  readonly projectPath: string;
  readonly workId: string;
  readonly executor: WorkExecutor;
  readonly providerId?: string | null;
  readonly providerSessionRef?: ProviderSessionRef | null;
};

export type WorkAttemptReportInput = {
  readonly projectPath: string;
  readonly workId: string;
  readonly attemptId: string;
  readonly leaseToken: string;
};

export type WorkReportStartedInput = WorkAttemptReportInput & {
  readonly providerSessionRef?: ProviderSessionRef | null;
  readonly providerCapabilities?: readonly string[];
  readonly message?: string;
  readonly metadata?: Record<string, unknown>;
};

export type WorkReportProgressInput = WorkAttemptReportInput & {
  readonly message?: string;
  readonly payload?: unknown;
  readonly metadata?: Record<string, unknown>;
};

export type WorkReportBlockedInput = WorkAttemptReportInput & {
  readonly reason: string;
  readonly result?: unknown;
  readonly metadata?: Record<string, unknown>;
};

export type WorkReportCompletedInput = WorkAttemptReportInput & {
  readonly result?: unknown;
  readonly message?: string;
  readonly metadata?: Record<string, unknown>;
};

export type WorkReportFailedInput = WorkAttemptReportInput & {
  readonly error?: unknown;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
};

export type WorkReportCancelledInput = WorkAttemptReportInput & {
  readonly message?: string;
  readonly metadata?: Record<string, unknown>;
};

export type WorkCancelInput = {
  readonly projectPath: string;
  readonly workId: string;
  readonly message?: string;
  readonly metadata?: Record<string, unknown>;
};

export type WorkResumeInput = {
  readonly projectPath: string;
  readonly workId: string;
  readonly message?: string;
  readonly metadata?: Record<string, unknown>;
};

export const workKindFor = (subject: WorkSubject, action: WorkAction): WorkKind => {
  switch (`${subject}.${action}`) {
    case "ticket.draft":
      return "ticket.draft";
    case "ticket.redraft":
      return "ticket.redraft";
    case "ticket.update":
      return "ticket.update";
    case "ticket.implement":
      return "ticket.implementation";
    case "project.sync":
      return "project.sync";
    case "worker.dispatch":
      return "worker.dispatch";
    default:
      throw new Error(`Invalid work classification: ${subject}.${action}`);
  }
};

export const isTerminalWorkStatus = (status: WorkStatus): boolean =>
  status === "cancelled" || status === "failed" || status === "completed";

export const workEventTypeForStatus = (status: WorkStatus): WorkEventType => {
  switch (status) {
    case "created":
      return "work.submitted";
    case "queued":
      return "work.queued";
    case "running":
      return "work.running";
    case "blocked":
      return "work.blocked";
    case "cancelling":
      return "work.cancelling";
    case "stale":
      return "work.stale";
    case "cancelled":
      return "work.cancelled";
    case "failed":
      return "work.failed";
    case "completed":
      return "work.completed";
  }
};

export const snapshotToWorkHandle = (snapshot: WorkRunSnapshot): WorkHandle => ({
  workId: snapshot.workId,
  runId: snapshot.runId,
  ticketId: snapshot.ticketId,
  projectPath: snapshot.projectPath,
  kind: snapshot.kind,
  subject: snapshot.subject,
  action: snapshot.action,
  status: snapshot.status,
  executor: snapshot.executor,
  providerId: snapshot.providerId
});
