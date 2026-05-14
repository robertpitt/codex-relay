import { Context, Effect, FileSystem, Layer, Logger, ManagedRuntime, Path } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { IoLive } from "../io";
import { SocketBoundary } from "../platform/SocketBoundary";
import { HostRuntime, HttpClient } from "../io";
import { BackendClock, BackendClockLive } from "./BackendClock";
import { BackendConfig, BackendConfigLive } from "./BackendConfig";

export type BackendServicesBase =
  | Context.Service.Identifier<typeof BackendClock>
  | Context.Service.Identifier<typeof BackendConfig>;

export type BackendIoServices =
  | Context.Service.Identifier<typeof FileSystem.FileSystem>
  | Context.Service.Identifier<typeof Path.Path>
  | Context.Service.Identifier<typeof ChildProcessSpawner.ChildProcessSpawner>
  | Context.Service.Identifier<typeof HostRuntime>
  | Context.Service.Identifier<typeof HttpClient>
  | Context.Service.Identifier<typeof SocketBoundary>;

export const BackendServicesBaseLive = Layer.mergeAll(BackendClockLive, BackendConfigLive);

export const BackendRuntimeLive = Layer.mergeAll(BackendServicesBaseLive, Logger.layer([]), IoLive);

export type BackendServices = BackendServicesBase | BackendIoServices;
export type BackendEffect<A, E = unknown, R = BackendServices> = Effect.Effect<A, E, R>;

const backendRuntime = ManagedRuntime.make(BackendRuntimeLive);

export const runBackendEffect = <A, E>(effect: Effect.Effect<A, E, BackendServices>): Promise<A> =>
  backendRuntime.runPromise(effect);

export const fromPromise = <A>(evaluate: (signal: AbortSignal) => PromiseLike<A>): Effect.Effect<A, unknown> =>
  Effect.tryPromise({
    try: evaluate,
    catch: (cause) => cause
  });

export const fromSync = <A>(evaluate: () => A): Effect.Effect<A, unknown> =>
  Effect.suspend(() => {
    try {
      return Effect.succeed(evaluate());
    } catch (cause) {
      return Effect.fail(cause);
    }
  });

export { BackendClock };
export {
  BackendConfig,
  BackendConfigDefaults,
  BackendConfigSpec,
  loadBackendConfig,
  type BackendConfigService
} from "./BackendConfig";
