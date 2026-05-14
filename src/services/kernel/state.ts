import type { JobExecutionSnapshot, JobTransitionInput } from "./types";
import { isTerminalJobStatus } from "./types";

export const mergeJobMetadata = (
  current: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  if (!current) return next;
  if (!next) return current;
  return { ...current, ...next };
};

export const isBlockedByTerminalStatus = (
  current: JobExecutionSnapshot,
  input: Pick<JobTransitionInput, "status">
): boolean => isTerminalJobStatus(current.status) && current.status !== input.status;

export const applyJobTransition = (
  current: JobExecutionSnapshot,
  input: JobTransitionInput,
  updatedAt: string
): JobExecutionSnapshot => {
  if (isBlockedByTerminalStatus(current, input)) return current;

  return {
    ...current,
    status: input.status,
    attempts: input.status === "running" && current.status !== "running" ? current.attempts + 1 : current.attempts,
    updatedAt,
    result: input.result ?? current.result,
    error: input.error ?? current.error,
    message: input.message ?? current.message,
    metadata: mergeJobMetadata(current.metadata, input.metadata)
  };
};
