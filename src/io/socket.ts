import { Context, Effect, Layer } from "effect";

export type SocketBoundaryService = {
  readonly unavailable: () => Effect.Effect<never, Error>;
};

export const SocketBoundary = Context.Service<SocketBoundaryService>("relay/SocketBoundary");

export const SocketBoundaryLive = Layer.succeed(SocketBoundary)({
  unavailable: () => Effect.fail(new Error("Socket support is not implemented for Relay yet."))
});
