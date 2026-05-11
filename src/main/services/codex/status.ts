import os from "node:os";
import type { CodexStatus } from "../../../shared/types";
import { CommandExecutor, pathJoin, readTextFileEffect } from "../io";
import { runBackendEffect } from "../runtime";

const getCodexStatusPromise = async (): Promise<CodexStatus> => {
  let cliAvailable = false;
  let cliVersion: string | null = null;
  try {
    const { stdout } = await runBackendEffect(
      CommandExecutor.use((executor) => executor.execFile("codex", ["--version"], { timeoutMs: 5_000 }))
    );
    cliAvailable = true;
    cliVersion = stdout.trim();
  } catch {
    cliAvailable = false;
  }

  let authenticated: boolean | null = null;
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY);
  try {
    await runBackendEffect(readTextFileEffect(pathJoin(os.homedir(), ".codex", "auth.json")));
    authenticated = true;
  } catch {
    authenticated = hasApiKey ? true : false;
  }

  return {
    sdkAvailable: true,
    cliAvailable,
    cliVersion,
    authenticated,
    message: cliAvailable
      ? authenticated === true
        ? "Codex is available."
        : "Codex CLI is available, but no Codex auth file or API key was found."
      : "Codex CLI was not found on PATH."
  };
};

export const getCodexStatus = (): Promise<CodexStatus> => getCodexStatusPromise();
