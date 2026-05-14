import { Effect, Layer, Logger } from "effect";
import { getElectronPath } from "../../platform/electron";
import { formatRelayLogLine, relayLogger } from "../../runtime";
import {
  BackendClock,
  BackendLogger,
  type BackendEffect,
  type BackendIoServices,
  type BackendLogLevel,
  type BackendServicesBase,
  fromSync,
  runBackendEffect
} from "../../runtime";
import { appendTextFileEffect, makeDirectoryEffect, pathDirname, pathJoin } from "../../io";

type LogLevel = BackendLogLevel;

export const getLogPath = (): string => pathJoin(getElectronPath("userData"), "relay.log");

export const RelayEffectLoggerLive = Logger.layer([
  Logger.withLeveledConsole(relayLogger),
  Effect.flatMap(Effect.sync(getLogPath), (target) => Logger.toFile(relayLogger, target, { flag: "a" }))
]);

const fileLogEffect = (
  level: LogLevel,
  scope: string,
  message: string,
  meta?: unknown
): Effect.Effect<void, unknown, BackendServicesBase | BackendIoServices> =>
  Effect.gen(function*() {
    const clock = yield* BackendClock;
    const line = `${formatRelayLogLine({ timestamp: clock.nowIso(), level, scope, message, meta })}\n`;

    yield* fromSync(() => {
      if (level === "error") {
        console.error(line.trimEnd());
      } else {
        console.log(line.trimEnd());
      }
    });

    yield* Effect.catch(
      Effect.gen(function*() {
        const target = getLogPath();
        yield* makeDirectoryEffect(pathDirname(target));
        yield* appendTextFileEffect(target, line);
      }),
      (error) => fromSync(() => console.error("Failed to write Relay log", error))
    );
  });

export const BackendLoggerLive = Layer.succeed(BackendLogger)({
  log: fileLogEffect
});

export const logEffect = (level: LogLevel, scope: string, message: string, meta?: unknown): BackendEffect<void> =>
  BackendLogger.use((logger) => logger.log(level, scope, message, meta));

export const log = (level: LogLevel, scope: string, message: string, meta?: unknown): Promise<void> =>
  runBackendEffect(logEffect(level, scope, message, meta));

export const logInfo = (scope: string, message: string, meta?: unknown): Promise<void> => log("info", scope, message, meta);
export const logWarn = (scope: string, message: string, meta?: unknown): Promise<void> => log("warn", scope, message, meta);
export const logError = (scope: string, message: string, error?: unknown, meta?: unknown): Promise<void> =>
  log("error", scope, message, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    meta
  });
