import { app } from "electron";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

type LogLevel = "info" | "warn" | "error";

const safeJson = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
};

export const getLogPath = (): string => path.join(app.getPath("userData"), "relay.log");

export const log = async (level: LogLevel, scope: string, message: string, meta?: unknown): Promise<void> => {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} [${scope}] ${message}${meta === undefined ? "" : ` ${safeJson(meta)}`}\n`;
  if (level === "error") {
    console.error(line.trimEnd());
  } else {
    console.log(line.trimEnd());
  }

  try {
    const target = getLogPath();
    await mkdir(path.dirname(target), { recursive: true });
    await appendFile(target, line, "utf8");
  } catch (error) {
    console.error("Failed to write Relay log", error);
  }
};

export const logInfo = (scope: string, message: string, meta?: unknown): Promise<void> => log("info", scope, message, meta);
export const logWarn = (scope: string, message: string, meta?: unknown): Promise<void> => log("warn", scope, message, meta);
export const logError = (scope: string, message: string, error?: unknown, meta?: unknown): Promise<void> =>
  log("error", scope, message, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    meta
  });
