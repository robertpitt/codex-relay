/**
 * Shared IPC/HTTP transport boundary helpers.
 */
import { TransportDecodeError, errorMessage } from "../domain/errors";

export type RelayTransportFailureCode = "relay_decode_error" | "relay_api_error";

export type RelayTransportFailure = {
  readonly status: number;
  readonly code: RelayTransportFailureCode;
  readonly message: string;
};

export const transportBodyDecodeError = (cause: unknown): TransportDecodeError =>
  new TransportDecodeError({
    channel: "http:body",
    message: "Relay API request body must be valid JSON.",
    cause
  });

export const relayTransportFailureFromError = (error: unknown): RelayTransportFailure => {
  if (error instanceof TransportDecodeError) {
    return { status: 400, code: "relay_decode_error", message: error.message };
  }
  return { status: 400, code: "relay_api_error", message: errorMessage(error) };
};
