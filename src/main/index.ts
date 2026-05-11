import { Effect } from "effect";
import { fileURLToPath } from "node:url";
import { ElectronApp } from "./electron";
import { installRelayIpcHandlers } from "./ipc";
import { RelayWindow, relayWindowPaths } from "./window/RelayWindow";
import { runBackendEffect } from "./services/runtime";
import { disposeAppRuntime, installAppRuntime } from "./services/runtime/appLayer";
import { getLogPath, logError, logInfo } from "./services/logger";
import { pathDirname } from "./services/io";

const __dirname = pathDirname(fileURLToPath(import.meta.url));
const windowOptions = relayWindowPaths(__dirname);

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
  await runBackendEffect(installRelayIpcHandlers());
  await createRelayWindow();

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
