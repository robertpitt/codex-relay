/**
 * Shared Effect helpers for filesystem-backed Relay stores.
 */
import { Effect } from "effect";
import { StorageReadError, StorageWriteError, errorMessage, type RelayDomainError } from "../../domain/errors";
import { TicketNotFoundError, isTicketNotFoundError } from "../errors";

export type StoreError = RelayDomainError | TicketNotFoundError;
export type StoreEffect<A, R = never> = Effect.Effect<A, StoreError, R>;

export const storeReadError = (path: string, operation: string, cause: unknown): StoreError => {
  if (isTicketNotFoundError(cause)) return cause;
  return new StorageReadError({
    path,
    message: errorMessage(cause, `${operation} failed.`),
    cause
  });
};

export const storeWriteError = (path: string, operation: string, cause: unknown): StoreError => {
  if (isTicketNotFoundError(cause)) return cause;
  return new StorageWriteError({
    path,
    message: errorMessage(cause, `${operation} failed.`),
    cause
  });
};

export const storeRead = <A>(
  path: string,
  operation: string,
  evaluate: () => PromiseLike<A>
): StoreEffect<A> =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => storeReadError(path, operation, cause)
  });

export const storeWrite = <A>(
  path: string,
  operation: string,
  evaluate: () => PromiseLike<A>
): StoreEffect<A> =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => storeWriteError(path, operation, cause)
  });

export const mapStoreReadError = (path: string, operation: string) => (cause: unknown): StoreError =>
  storeReadError(path, operation, cause);

export const mapStoreWriteError = (path: string, operation: string) => (cause: unknown): StoreError =>
  storeWriteError(path, operation, cause);
