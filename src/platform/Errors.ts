import { Data } from "effect";

export class ElectronError extends Data.TaggedError("ElectronError")<{
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const electronError = (operation: string, cause: unknown): ElectronError =>
  new ElectronError({
    operation,
    message: cause instanceof Error ? cause.message : `${operation} failed.`,
    cause
  });

export const electronSecurityError = (operation: string, message: string, cause?: unknown): ElectronError =>
  new ElectronError({
    operation,
    message,
    cause
  });
