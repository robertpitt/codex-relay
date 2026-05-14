/**
 * Relay log formatting and Effect logger construction.
 *
 * The file format remains compatible with the existing `relay.log` lines while
 * allowing Effect log annotations to be folded into the metadata payload.
 */
import { Effect, Logger } from "effect";
import { CurrentLogAnnotations } from "effect/References";

export type RelayLogLevel = "info" | "warn" | "error";

export type RelayLogRecord = {
  readonly timestamp: string;
  readonly level: RelayLogLevel;
  readonly scope: string;
  readonly message: string;
  readonly meta?: unknown;
};

const safeJson = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
};

export const formatRelayLogLine = ({ timestamp, level, scope, message, meta }: RelayLogRecord): string =>
  `${timestamp} ${level.toUpperCase()} [${scope}] ${message}${meta === undefined ? "" : ` ${safeJson(meta)}`}`;

export const relayLogger = Logger.make<unknown, string>((options) => {
  const annotations = options.fiber.getRef(CurrentLogAnnotations);
  const scope = typeof annotations.scope === "string" ? annotations.scope : "effect";
  const message = Array.isArray(options.message) ? options.message.map(String).join(" ") : String(options.message);
  const meta = Object.keys(annotations).length > 0 ? annotations : undefined;
  const level: RelayLogLevel =
    options.logLevel === "Warn" ? "warn" : options.logLevel === "Error" || options.logLevel === "Fatal" ? "error" : "info";
  return formatRelayLogLine({
    timestamp: options.date.toISOString(),
    level,
    scope,
    message,
    meta
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
  return log.pipe(Effect.annotateLogs(meta === undefined ? { scope } : { scope, meta }));
};
