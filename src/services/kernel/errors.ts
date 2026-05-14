import { Data } from "effect";

export class KernelJobNotFoundError extends Data.TaggedError("KernelJobNotFoundError")<{
  readonly projectPath: string;
  readonly executionId: string;
  readonly message: string;
}> {}

export class KernelJsonParseError extends Data.TaggedError("KernelJsonParseError")<{
  readonly target: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class KernelPersistenceError extends Data.TaggedError("KernelPersistenceError")<{
  readonly target: string;
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class KernelWorkflowError extends Data.TaggedError("KernelWorkflowError")<{
  readonly executionId?: string;
  readonly workflowName?: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type KernelError =
  | KernelJobNotFoundError
  | KernelJsonParseError
  | KernelPersistenceError
  | KernelWorkflowError;

export const kernelPersistenceError = (
  target: string,
  operation: string,
  cause: unknown
): KernelPersistenceError =>
  new KernelPersistenceError({
    target,
    operation,
    message: `${operation} failed for ${target}.`,
    cause
  });
