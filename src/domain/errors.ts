/**
 * Relay-owned domain errors used by Effect-first backend services.
 *
 * These errors are intentionally internal to the main process. Renderer and
 * IPC contracts continue to receive the existing shared payloads.
 */
import { Data } from "effect";

export class ProjectPathUnavailable extends Data.TaggedError("ProjectPathUnavailable")<{
  readonly projectPath: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class ProjectPathNotDirectory extends Data.TaggedError("ProjectPathNotDirectory")<{
  readonly projectPath: string;
  readonly message: string;
}> {}

export class StorageReadError extends Data.TaggedError("StorageReadError")<{
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class StorageWriteError extends Data.TaggedError("StorageWriteError")<{
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class StorageNotFoundError extends Data.TaggedError("StorageNotFoundError")<{
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class StorageParseError extends Data.TaggedError("StorageParseError")<{
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class TransportDecodeError extends Data.TaggedError("TransportDecodeError")<{
  readonly channel: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class TransportEncodeError extends Data.TaggedError("TransportEncodeError")<{
  readonly channel: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class TransportHandlerError extends Data.TaggedError("TransportHandlerError")<{
  readonly channel: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class IpcBoundaryError extends Data.TaggedError("IpcBoundaryError")<{
  readonly channel: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class CodexServiceError extends Data.TaggedError("CodexServiceError")<{
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type RelayDomainError =
  | ProjectPathUnavailable
  | ProjectPathNotDirectory
  | StorageReadError
  | StorageWriteError
  | StorageNotFoundError
  | StorageParseError
  | TransportDecodeError
  | TransportEncodeError
  | TransportHandlerError
  | IpcBoundaryError
  | CodexServiceError;

export const errorMessage = (error: unknown, fallback = "Operation failed."): string =>
  error instanceof Error ? error.message : typeof error === "string" && error.length > 0 ? error : fallback;

export const isRelayDomainError = (error: unknown): error is RelayDomainError => {
  if (typeof error !== "object" || error === null || !("_tag" in error)) return false;
  switch ((error as { readonly _tag?: unknown })._tag) {
    case "ProjectPathUnavailable":
    case "ProjectPathNotDirectory":
    case "StorageReadError":
    case "StorageWriteError":
    case "StorageNotFoundError":
    case "StorageParseError":
    case "TransportDecodeError":
    case "TransportEncodeError":
    case "TransportHandlerError":
    case "IpcBoundaryError":
    case "CodexServiceError":
      return true;
    default:
      return false;
  }
};
