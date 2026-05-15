import { Cause, Effect, Layer, ManagedRuntime } from "effect";
import { ElectronApp, PlatformLive } from "./platform";
import { installRelayIpcTransport } from "./ipc";
import { RelayWindow, RelayWindowLive } from "./services/window/RelayWindow";
import { BackendServicesBaseLive } from "./runtime";
import { getLogPath, LoggerLive } from "./services/logger";
import { BackendKernelLive, JobSupervisor } from "./services/kernel";
import { GitServiceLive } from "./services/git";
import { RegistryStoreLive } from "./services/registry";
import { RunEventSinkLive } from "./services/run-events";
import { RelayRpcHandlersLive } from "./services/rpc/handlers";
import { AtomicFileLive, StorageLive } from "./storage";

/**
 * Backend Base Layer
 */
const BackendBaseLive = Layer.mergeAll(BackendServicesBaseLive, PlatformLive);

/**
 * Core App Services
 */
const RelayWindowServiceLive = RelayWindowLive.pipe(Layer.provide(PlatformLive));

/**
 * Core Services Layer
 */
const CoreServicesLive = Layer.mergeAll(
  BackendBaseLive,
  RelayWindowServiceLive,
  LoggerLive.pipe(Layer.provide(PlatformLive)),
  AtomicFileLive,
  GitServiceLive,
  RegistryStoreLive.pipe(Layer.provide(PlatformLive)),
  BackendKernelLive.pipe(Layer.provide(BackendBaseLive)),
  StorageLive.pipe(Layer.provide(BackendServicesBaseLive)),
  RunEventSinkLive
);

/**
 * App Layer
 */
const AppLayerLive = RelayRpcHandlersLive.pipe(Layer.provideMerge(CoreServicesLive));

/**
 * App Runtime
 */
const appRuntime = ManagedRuntime.make(AppLayerLive);

const relayApp = Effect.scoped(Effect.gen(function* () {
  const electronApp = yield* ElectronApp;
  const relayWindow = yield* RelayWindow;
  const supervisor = yield* JobSupervisor;
  yield* electronApp.startLifecycleSupervision({
    onActivate: () => relayWindow.activate()
  });

  // Wait for Electron to be ready
  yield* electronApp.whenReady();
  const logPath = yield* getLogPath;
  yield* Effect.logInfo("Relay starting").pipe(Effect.annotateLogs({ scope: "app", logPath }));

  // Install IPC transport
  yield* installRelayIpcTransport();

  // Create main window
  yield* relayWindow.createMain();

  // Recover from registry
  const recovered = yield* supervisor.recoverFromRegistry();
  if (recovered.length > 0) {
    yield* Effect.logInfo("Recovered backend kernel executions").pipe(Effect.annotateLogs({ scope: "app", count: recovered.length }));
  }

  yield* electronApp.awaitShutdown();
}));

const appFiber = appRuntime.runFork(
  relayApp.pipe(
    Effect.catchCause((cause) =>
      Effect.logError("Relay failed to start").pipe(Effect.annotateLogs({ scope: "app", cause: Cause.pretty(cause) }))
    )
  )
);

appFiber.addObserver(() => {
  Effect.runFork(appRuntime.disposeEffect);
});
