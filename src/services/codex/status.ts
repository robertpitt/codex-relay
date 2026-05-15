import { Effect, FileSystem, Path } from "effect";
import type { CodexStatus } from "@shared/schemas";
import { ElectronApp } from "../../platform";
import { runBackendEffect } from "../../runtime";
import { resolveAvailableCodexCli, type CodexCliResolution } from "./cli";

export type CodexStatusDependencies = {
  resolveCodexCli?: () => Promise<CodexCliResolution | null>;
};

const getCodexStatusPromise = async (dependencies: CodexStatusDependencies = {}): Promise<CodexStatus> => {
  const cliResolution = await (dependencies.resolveCodexCli ?? resolveAvailableCodexCli)();
  const cliAvailable = Boolean(cliResolution);
  const cliVersion = cliResolution?.version ?? null;

  let authenticated: boolean | null = null;
  const hasApiKey = await runBackendEffect(
    ElectronApp.use((electronApp) => electronApp.env.pipe(Effect.map((env) => Boolean(env.OPENAI_API_KEY || env.CODEX_API_KEY))))
  );
  try {
    await runBackendEffect(
      Effect.gen(function*() {
        const electronApp = yield* ElectronApp;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* electronApp.homeDirectory;
        yield* fs.readFileString(path.join(home, ".codex", "auth.json"), "utf8");
      })
    );
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
      : "Codex CLI was not found in the SDK bundle or on PATH."
  };
};

export const getCodexStatus = (dependencies: CodexStatusDependencies = {}): Promise<CodexStatus> =>
  getCodexStatusPromise(dependencies);
