import { Effect, Logger, Path } from "effect";
import { ElectronApp } from "../platform";
import { runBackendEffect } from ".";
export {
  formatRelayLogLine,
  logWithRelayAnnotations,
  relayLogger,
  type RelayLogLevel,
  type RelayLogRecord
} from "./RelayLogger";
import { logWithRelayAnnotations, relayLogger, type RelayLogLevel } from "./RelayLogger";

export const getLogPath = Effect.gen(function*() {
  const electronApp = yield* ElectronApp;
  const path = yield* Path.Path;
  const userData = yield* electronApp.getPath("userData");
  return path.join(userData, "relay.log");
});

export const LoggerLive = Logger.layer([
  Logger.withLeveledConsole(relayLogger),
  Effect.flatMap(getLogPath, (target) => Logger.toFile(relayLogger, target, { flag: "a" }))
]);

export const log = (level: RelayLogLevel, scope: string, message: string, meta?: unknown): Promise<void> =>
  runBackendEffect(logWithRelayAnnotations(level, scope, message, meta));

export const logInfo = (scope: string, message: string, meta?: unknown): Promise<void> => log("info", scope, message, meta);
export const logWarn = (scope: string, message: string, meta?: unknown): Promise<void> => log("warn", scope, message, meta);
export const logError = (scope: string, message: string, error?: unknown, meta?: unknown): Promise<void> =>
  log("error", scope, message, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    meta
  });
