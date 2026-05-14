/**
 * Shared IPC/HTTP transport boundary helpers.
 */
import {
  TransportDecodeError,
  TransportEncodeError,
  TransportHandlerError,
  errorMessage
} from "../domain";

export type RelayTransportFailureCode = "relay_decode_error" | "relay_encode_error" | "relay_api_error";

export type RelayTransportFailure = {
  readonly status: number;
  readonly code: RelayTransportFailureCode;
  readonly message: string;
};

export const transportDecodeError = (channel: string) => (cause: unknown): TransportDecodeError =>
  new TransportDecodeError({
    channel,
    message: errorMessage(cause, `Relay payload could not be decoded for ${channel}.`),
    cause
  });

export const transportEncodeError = (channel: string) => (cause: unknown): TransportEncodeError =>
  new TransportEncodeError({
    channel,
    message: errorMessage(cause, `Relay result could not be encoded for ${channel}.`),
    cause
  });

export const transportHandlerError = (channel: string) => (cause: unknown): TransportHandlerError =>
  new TransportHandlerError({
    channel,
    message: errorMessage(cause, `Relay handler failed for ${channel}.`),
    cause
  });

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
  if (error instanceof TransportEncodeError) {
    return { status: 400, code: "relay_encode_error", message: error.message };
  }
  if (error instanceof TransportHandlerError) {
    return { status: 400, code: "relay_api_error", message: error.message };
  }
  return { status: 400, code: "relay_api_error", message: errorMessage(error) };
};
