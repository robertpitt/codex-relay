import { Context, Effect, Layer, Schema, Scope } from "effect";
import { ElectronIpc, type ElectronIpcService } from "../electron";
import { runBackendEffect } from "../services/runtime";
import type { RelayIpcArgs, RelayIpcChannel, RelayIpcResult } from "./channels";
import type { RelaySchema } from "./schema";

export type RelayIpcMethod<Channel extends RelayIpcChannel = RelayIpcChannel, R = never> = {
  readonly channel: Channel;
  readonly payload: RelaySchema<RelayIpcArgs<Channel>>;
  readonly result: RelaySchema<RelayIpcResult<Channel>>;
  readonly handler: (
    event: unknown,
    ...args: RelayIpcArgs<Channel>
  ) => Effect.Effect<RelayIpcResult<Channel>, unknown, R>;
};

// TypeScript cannot preserve the channel-specific tuple relationship for a heterogeneous IPC method registry without
// collapsing handlers to an unusable union of all channel argument lists, so this app boundary keeps the registry erased.
export type AnyRelayIpcMethod = RelayIpcMethod<any, any>;

export type RelayIpcRunner = <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>;

export type RelayIpcService = {
  readonly handle: (method: AnyRelayIpcMethod) => Effect.Effect<void, unknown>;
  readonly handleScoped: (method: AnyRelayIpcMethod) => Effect.Effect<void, unknown, Scope.Scope>;
};

export const RelayIpc = Context.Service<RelayIpcService>("relay/RelayIpc");

export const defineRelayIpcMethod = <Channel extends RelayIpcChannel, R = never>(
  method: RelayIpcMethod<Channel, R>
): RelayIpcMethod<Channel, R> => method;

export const makeRelayIpcService = (
  electronIpc: ElectronIpcService,
  runEffect: RelayIpcRunner = runBackendEffect
): RelayIpcService => {
  const register = <Channel extends RelayIpcChannel, R>(method: RelayIpcMethod<Channel, R>): Effect.Effect<void, unknown> =>
    Effect.gen(function*() {
      const handler = async (event: unknown, ...rawArgs: unknown[]): Promise<unknown> => {
        const effect = Effect.gen(function*() {
          const args = yield* Schema.decodeUnknownEffect(method.payload)(rawArgs);
          const result = yield* method.handler(event, ...args);
          return yield* Schema.encodeUnknownEffect(method.result)(result);
        });

        return runEffect(effect);
      };

      yield* electronIpc.removeHandler(method.channel);
      yield* electronIpc.handle(method.channel, handler);
    });

  return {
    handle: register,
    handleScoped: (method) =>
      Effect.acquireRelease(register(method), () => electronIpc.removeHandler(method.channel)).pipe(Effect.asVoid)
  };
};

export const RelayIpcLive = Layer.effect(
  RelayIpc,
  Effect.gen(function*() {
    const electronIpc = yield* ElectronIpc;
    return makeRelayIpcService(electronIpc);
  })
);
