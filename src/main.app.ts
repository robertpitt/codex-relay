import { Cause, Effect } from "effect";
import { RelayWindow } from "./app/RelayWindow";
import { appRuntime, runAppEffect } from "./app/AppRuntime";
import { HttpRestApi } from "./http";
import { ElectronApp } from "./platform";
import { getLogPath } from "./runtime/Logging";
import { JobSupervisor } from "./services/kernel";

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

  const httpApi = yield* Effect.acquireRelease(
    Effect.promise(() =>
      HttpRestApi.start({
        runEffect: runAppEffect
      })
    ),
    (api) => Effect.promise(() => api.close())
  );

  // Create main window
  yield* relayWindow.createMain({
    apiBaseUrl: httpApi.baseUrl,
    apiToken: httpApi.token
  });

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
