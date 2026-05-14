import { Effect } from "effect";
import type { CodexStatus } from "@shared/types";
import { HostRuntime, pathJoin, readTextFileEffect } from "../../io";
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
    HostRuntime.use((host) => host.env.pipe(Effect.map((env) => Boolean(env.OPENAI_API_KEY || env.CODEX_API_KEY))))
  );
  try {
    await runBackendEffect(
      HostRuntime.use((host) =>
        Effect.gen(function*() {
          const home = yield* host.homeDirectory;
          yield* readTextFileEffect(pathJoin(home, ".codex", "auth.json"));
        })
      )
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
