import { Context, Effect, FileSystem, Layer, Logger, ManagedRuntime, Path } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { BackendPlatformLive, ElectronApp, ElectronAppServiceLive } from "../platform";
import { BackendClock, BackendClockLive } from "../platform/Clock";
import { BackendConfig, BackendConfigLive } from "../config/AppConfig";

export type BackendServicesBase =
  | Context.Service.Identifier<typeof BackendClock>
  | Context.Service.Identifier<typeof BackendConfig>;

export type BackendIoServices =
  | Context.Service.Identifier<typeof FileSystem.FileSystem>
  | Context.Service.Identifier<typeof Path.Path>
  | Context.Service.Identifier<typeof ChildProcessSpawner.ChildProcessSpawner>
  | Context.Service.Identifier<typeof ElectronApp>;

export const BackendServicesBaseLive = Layer.mergeAll(BackendClockLive, BackendConfigLive);

export const BackendRuntimeLive = Layer.mergeAll(
  BackendServicesBaseLive,
  Logger.layer([]),
  BackendPlatformLive,
  ElectronAppServiceLive
);

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

export { BackendClock };
export {
  BackendConfig,
  BackendConfigDefaults,
  BackendConfigSpec,
  loadBackendConfig,
  type BackendConfigService
} from "../config/AppConfig";
