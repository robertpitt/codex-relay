import { Effect, Layer, ManagedRuntime } from "effect";
import { HttpRunEventSinkLive } from "../http";
import { PlatformLive } from "../platform";
import { AtomicFileLive, StorageLive } from "../storage";
import { BackendWorkLive } from "../services/work";
import { GitServiceLive } from "../services/git";
import { RegistryStoreLive } from "../services/registry";
import { BackendServicesBaseLive } from "../runtime";
import { LoggerLive } from "../runtime/Logging";
import { RelayWindowLive } from "./RelayWindow";

export const BackendBaseLive = Layer.mergeAll(BackendServicesBaseLive, PlatformLive);

export const RelayWindowServiceLive = RelayWindowLive.pipe(Layer.provide(PlatformLive));

export const CoreServicesLive = Layer.mergeAll(
  BackendBaseLive,
  RelayWindowServiceLive,
  LoggerLive.pipe(Layer.provide(PlatformLive)),
  AtomicFileLive,
  GitServiceLive,
  RegistryStoreLive.pipe(Layer.provide(PlatformLive)),
  BackendWorkLive.pipe(Layer.provide(BackendBaseLive)),
  StorageLive.pipe(Layer.provide(BackendServicesBaseLive)),
  HttpRunEventSinkLive
);

export const AppLayerLive = CoreServicesLive;

export type AppServices = Layer.Success<typeof AppLayerLive>;

export const appRuntime = ManagedRuntime.make(AppLayerLive);

export const runAppEffect = <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> =>
  appRuntime.runPromise(effect as unknown as Effect.Effect<A, E, AppServices>);
