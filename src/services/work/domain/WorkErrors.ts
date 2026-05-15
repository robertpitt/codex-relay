import { Data } from "effect";
import type { WorkStatus } from "./Work";

export class WorkNotFoundError extends Data.TaggedError("WorkNotFoundError")<{
  readonly projectPath: string;
  readonly workId: string;
  readonly message: string;
}> {}

export class WorkJsonParseError extends Data.TaggedError("WorkJsonParseError")<{
  readonly target: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class WorkPersistenceError extends Data.TaggedError("WorkPersistenceError")<{
  readonly target: string;
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class WorkInvalidTransitionError extends Data.TaggedError("WorkInvalidTransitionError")<{
  readonly workId: string;
  readonly fromStatus: WorkStatus;
  readonly toStatus: WorkStatus;
  readonly message: string;
}> {}

export class WorkStaleAttemptError extends Data.TaggedError("WorkStaleAttemptError")<{
  readonly workId: string;
  readonly attemptId: string;
  readonly message: string;
}> {}

export class WorkLeaseMismatchError extends Data.TaggedError("WorkLeaseMismatchError")<{
  readonly workId: string;
  readonly attemptId: string;
  readonly message: string;
}> {}

export class WorkConflictError extends Data.TaggedError("WorkConflictError")<{
  readonly workId?: string;
  readonly resourceId: string;
  readonly message: string;
}> {}

export type WorkError =
  | WorkNotFoundError
  | WorkJsonParseError
  | WorkPersistenceError
  | WorkInvalidTransitionError
  | WorkStaleAttemptError
  | WorkLeaseMismatchError
  | WorkConflictError;

export const workPersistenceError = (
  target: string,
  operation: string,
  cause: unknown
): WorkPersistenceError =>
  new WorkPersistenceError({
    target,
    operation,
    message: `${operation} failed for ${target}.`,
    cause
  });
