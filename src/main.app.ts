import { Effect } from "effect";
import { fileURLToPath } from "node:url";
import { ElectronApp } from "./platform/electron";
import { installRelayIpcTransport } from "./ipc";
import { RelayWindow, relayWindowPaths } from "./services/window/RelayWindow";
import { runBackendEffect } from "./runtime";
import { disposeAppRuntime, installAppRuntime } from "./runtime/appLayer";
import { getLogPath, logError, logInfo } from "./services/logger";
import { pathDirname } from "./io";
import { JobSupervisor } from "./services/kernel";

const __dirname = pathDirname(fileURLToPath(import.meta.url));
const windowOptions = relayWindowPaths(__dirname, process.env.ELECTRON_RENDERER_URL);

installAppRuntime();

process.on("uncaughtException", (error) => {
  void logError("process", "uncaught exception", error);
});

process.on("unhandledRejection", (error) => {
  void logError("process", "unhandled rejection", error);
});

const createRelayWindow = (): Promise<void> => runBackendEffect(RelayWindow.use((window) => window.createMain(windowOptions)));

const start = async (): Promise<void> => {
  await runBackendEffect(ElectronApp.use((electronApp) => electronApp.whenReady()));
  await logInfo("app", "Relay starting", { logPath: getLogPath() });
  await runBackendEffect(installRelayIpcTransport());
  await createRelayWindow();
  const recovered = await runBackendEffect(JobSupervisor.use((supervisor) => supervisor.recoverFromRegistry()));
  if (recovered.length > 0) {
    await logInfo("app", "Recovered backend kernel executions", { count: recovered.length });
  }

  await runBackendEffect(
    Effect.gen(function*() {
      const electronApp = yield* ElectronApp;
      const relayWindow = yield* RelayWindow;

      yield* electronApp.onActivate(() => {
        void runBackendEffect(relayWindow.activate(windowOptions));
      });

      yield* electronApp.onBeforeQuit(() => {
        void disposeAppRuntime();
      });

      yield* electronApp.onWindowAllClosed(() => {
        if (electronApp.platform !== "darwin") {
          void runBackendEffect(electronApp.quit());
        }
      });
    })
  );
};

void start().catch((error) => {
  void logError("app", "Relay failed to start", error);
});
