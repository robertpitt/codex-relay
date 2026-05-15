import { Effect, Logger, Path } from "effect";
import { CurrentLogAnnotations } from "effect/References";
import { ElectronApp } from "../../platform";
import { runBackendEffect } from "../../runtime";

export type RelayLogLevel = "info" | "warn" | "error";

export type RelayLogRecord = {
  readonly timestamp: string;
  readonly level: RelayLogLevel;
  readonly scope: string;
  readonly message: string;
  readonly meta?: unknown;
};

type LogAnnotations = Readonly<Record<string, unknown>>;
const LogScopeAnnotation = "logScope";

const safeJson = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
};

export const formatRelayLogLine = ({ timestamp, level, scope, message, meta }: RelayLogRecord): string =>
  `${timestamp} ${level.toUpperCase()} [${scope}] ${message}${meta === undefined ? "" : ` ${safeJson(meta)}`}`;

const annotationsMeta = (annotations: LogAnnotations): unknown => {
  const { [LogScopeAnnotation]: logScope, ...rest } = annotations;
  if (logScope !== undefined) {
    return Object.keys(rest).length === 0 ? undefined : rest;
  }

  const { scope: _, ...meta } = rest;
  if (Object.keys(meta).length === 0) return undefined;
  return meta;
};

const annotationsScope = (annotations: LogAnnotations): string => {
  const logScope = annotations[LogScopeAnnotation];
  if (typeof logScope === "string") return logScope;
  if (typeof annotations.scope === "string") return annotations.scope;
  return "effect";
};

const relayAnnotations = (scope: string, meta?: unknown): Record<string, unknown> => {
  if (meta === undefined) return { [LogScopeAnnotation]: scope };
  if (typeof meta === "object" && meta !== null && !Array.isArray(meta)) {
    return { [LogScopeAnnotation]: scope, ...meta };
  }
  return { [LogScopeAnnotation]: scope, meta };
};

export const relayLogger = Logger.make<unknown, string>((options) => {
  const annotations = options.fiber.getRef(CurrentLogAnnotations);
  const message = Array.isArray(options.message) ? options.message.map(String).join(" ") : String(options.message);
  const level: RelayLogLevel =
    options.logLevel === "Warn" ? "warn" : options.logLevel === "Error" || options.logLevel === "Fatal" ? "error" : "info";
  return formatRelayLogLine({
    timestamp: options.date.toISOString(),
    level,
    scope: annotationsScope(annotations),
    message,
    meta: annotationsMeta(annotations)
  });
});

export const logWithRelayAnnotations = (
  level: RelayLogLevel,
  scope: string,
  message: string,
  meta?: unknown
): Effect.Effect<void> => {
  const log =
    level === "error" ? Effect.logError(message) : level === "warn" ? Effect.logWarning(message) : Effect.logInfo(message);
  return log.pipe(Effect.annotateLogs(relayAnnotations(scope, meta)));
};

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
