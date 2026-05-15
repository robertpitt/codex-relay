import { Cause, Effect } from "effect";
import { RelayWindow } from "./app/RelayWindow";
import { appRuntime, runAppEffect } from "./app/AppRuntime";
import { HttpRestApi } from "./http";
import { ElectronApp } from "./platform";
import { getLogPath } from "./runtime/Logging";
import { wakeRecoveredCodexWork } from "./services/codex";
import { WorkEngine } from "./services/work";

const relayApp = Effect.scoped(Effect.gen(function* () {
  const electronApp = yield* ElectronApp;
  const relayWindow = yield* RelayWindow;
  const workEngine = yield* WorkEngine;
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
  const recovered = yield* workEngine.recoverAll();
  const recoveredCount = recovered.reduce((count, report) => count + report.recovered.length, 0);
  if (recoveredCount > 0) {
    yield* Effect.logInfo("Recovered backend work").pipe(Effect.annotateLogs({ scope: "app", count: recoveredCount }));
  }
  yield* Effect.promise(() => wakeRecoveredCodexWork(recovered));

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
