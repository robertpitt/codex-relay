import type { WorkRunSnapshot, WorkStatus, WorkTransitionInput } from "./Work";
import { isTerminalWorkStatus } from "./Work";
import { WorkInvalidTransitionError, WorkLeaseMismatchError, WorkStaleAttemptError } from "./WorkErrors";

export const mergeWorkMetadata = (
  current: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  if (!current) return next;
  if (!next) return current;
  return { ...current, ...next };
};

const validTransitions: Record<WorkStatus, readonly WorkStatus[]> = {
  created: ["queued", "cancelled"],
  queued: ["running", "cancelled"],
  running: ["blocked", "cancelling", "completed", "failed", "stale", "running"],
  blocked: ["queued", "cancelling", "cancelled", "blocked"],
  cancelling: ["cancelled", "failed", "cancelling"],
  stale: ["queued", "cancelled", "failed", "stale"],
  cancelled: [],
  failed: [],
  completed: []
};

export const canTransitionWorkStatus = (fromStatus: WorkStatus, toStatus: WorkStatus): boolean =>
  fromStatus === toStatus || validTransitions[fromStatus].includes(toStatus);

export const validateWorkTransition = (
  current: WorkRunSnapshot,
  input: WorkTransitionInput
): WorkInvalidTransitionError | WorkStaleAttemptError | WorkLeaseMismatchError | null => {
  if (isTerminalWorkStatus(current.status) && current.status !== input.status) {
    return new WorkInvalidTransitionError({
      workId: current.workId,
      fromStatus: current.status,
      toStatus: input.status,
      message: `Terminal work ${current.workId} cannot transition from ${current.status} to ${input.status}.`
    });
  }
  if (!canTransitionWorkStatus(current.status, input.status)) {
    return new WorkInvalidTransitionError({
      workId: current.workId,
      fromStatus: current.status,
      toStatus: input.status,
      message: `Work ${current.workId} cannot transition from ${current.status} to ${input.status}.`
    });
  }
  if (input.attemptId && current.currentAttempt && current.currentAttempt.attemptId !== input.attemptId) {
    return new WorkStaleAttemptError({
      workId: current.workId,
      attemptId: input.attemptId,
      message: `Attempt ${input.attemptId} is stale for work ${current.workId}.`
    });
  }
  if (
    input.leaseToken &&
    current.currentAttempt &&
    current.currentAttempt.attemptId === input.attemptId &&
    current.currentAttempt.leaseToken !== input.leaseToken
  ) {
    return new WorkLeaseMismatchError({
      workId: current.workId,
      attemptId: input.attemptId ?? current.currentAttempt.attemptId,
      message: `Lease token does not match active attempt for work ${current.workId}.`
    });
  }
  return null;
};

export const applyWorkTransition = (
  current: WorkRunSnapshot,
  input: WorkTransitionInput,
  updatedAt: string,
  lastAppliedEventSequence: number
): WorkRunSnapshot => ({
  ...current,
  status: input.status,
  attempts: input.status === "running" && input.attempt && current.currentAttempt?.attemptId !== input.attempt.attemptId
    ? current.attempts + 1
    : current.attempts,
  updatedAt,
  lastAppliedEventSequence,
  currentAttempt: input.attempt === undefined ? current.currentAttempt : input.attempt,
  providerSessionRef: input.providerSessionRef ?? current.providerSessionRef,
  providerCapabilities: Array.isArray(input.metadata?.providerCapabilities)
    ? input.metadata?.providerCapabilities.filter((value): value is string => typeof value === "string")
    : current.providerCapabilities,
  result: input.result ?? current.result,
  error: input.error ?? current.error,
  message: input.message ?? current.message,
  metadata: mergeWorkMetadata(current.metadata, input.metadata)
});
