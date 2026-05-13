import { execFile, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { Context, Effect, Layer } from "effect";

const execFileAsync = promisify(execFile);

export type CommandResult = {
  readonly stdout: string;
  readonly stderr: string;
};

export type CommandOptions = {
  readonly cwd?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly maxBuffer?: number | undefined;
};

export type CommandExecutorService = {
  readonly execFile: (command: string, args: readonly string[], options?: CommandOptions) => Effect.Effect<CommandResult, unknown>;
  readonly spawnDetached: (command: string, args: readonly string[]) => ChildProcess;
};

export const CommandExecutor = Context.Service<CommandExecutorService>("relay/CommandExecutor");

export const CommandExecutorLive = Layer.succeed(CommandExecutor)({
  execFile: (command, args, options = {}) =>
    Effect.tryPromise({
      try: () =>
        execFileAsync(command, [...args], {
          cwd: options.cwd,
          encoding: "utf8",
          maxBuffer: options.maxBuffer ?? 1024 * 1024,
          timeout: options.timeoutMs
        }).then((result) => ({
          stdout: result.stdout,
          stderr: result.stderr
        })),
      catch: (error) => error
    }),
  spawnDetached: (command, args) => spawn(command, [...args], { detached: true, stdio: "ignore" })
});
