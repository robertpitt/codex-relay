import { Cause, Effect, Layer, ManagedRuntime } from "effect";
import { BrowserWindowsLive } from "./platform/electron/BrowserWindows";
import { ElectronApp, ElectronAppLive } from "./platform/electron/ElectronApp";
import { ElectronDialogLive } from "./platform/electron/ElectronDialog";
import { ElectronShellLive } from "./platform/electron/ElectronShell";
import { ElectronWindowLive } from "./platform/electron/ElectronWindow";
import { IpcMainRouterLive } from "./platform/electron/IpcMainRouter";
import { ProcessLifecycleLive } from "./platform/ProcessLifecycle";
import { installRelayIpcTransport } from "./ipc";
import { RelayWindow, RelayWindowLive } from "./services/window/RelayWindow";
import { BackendServicesBaseLive } from "./runtime";
import { IoLive } from "./io";
import { getLogPath, LoggerLive } from "./services/logger";
import { BackendKernelLive, JobSupervisor } from "./services/kernel";
import { GitServiceLive } from "./services/git";
import { RegistryStoreLive } from "./services/registry";
import { RunEventSinkLive } from "./services/run-events";
import { RelayRpcHandlersLive } from "./services/rpc/handlers";
import { AtomicFileLive, StorageLive } from "./storage";

/**
 * Electron Desktop Layer
 */
const ElectronDesktopLive = Layer.mergeAll(
  ElectronAppLive.pipe(Layer.provide(ProcessLifecycleLive)),
  ElectronWindowLive.pipe(Layer.provideMerge(BrowserWindowsLive)),
  ElectronDialogLive,
  ElectronShellLive,
  IpcMainRouterLive
).pipe(Layer.provide(IoLive));

/**
 * Backend Base Layer
 */
const BackendBaseLive = Layer.mergeAll(BackendServicesBaseLive, IoLive);

/**
 * Core App Services
 */
const RelayWindowServiceLive = RelayWindowLive.pipe(Layer.provide(ElectronDesktopLive));

const CoreServicesLive = Layer.mergeAll(
  BackendBaseLive,
  ElectronDesktopLive,
  RelayWindowServiceLive,
  LoggerLive.pipe(Layer.provide(IoLive)),
  AtomicFileLive,
  GitServiceLive,
  RegistryStoreLive.pipe(Layer.provide(IoLive)),
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
  yield* Effect.logInfo("Relay starting").pipe(Effect.annotateLogs({ scope: "app", logPath: getLogPath() }));

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
