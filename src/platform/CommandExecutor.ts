/**
 * Effect service for host process execution.
 *
 * This is a platform boundary: domain services depend on `CommandExecutor`,
 * while raw `node:child_process` usage stays contained here.
 */
import { execFile, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { Context, Effect, Layer } from "effect";
import { ChildProcess as EffectChildProcess } from "effect/unstable/process";

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

export type CommandRunOptions = {
  readonly timeoutMs?: number | undefined;
  readonly maxBuffer?: number | undefined;
};

export type CommandExecutorService = {
  readonly run: (command: EffectChildProcess.Command, options?: CommandRunOptions) => Effect.Effect<CommandResult, unknown>;
  readonly execFile: (command: string, args: readonly string[], options?: CommandOptions) => Effect.Effect<CommandResult, unknown>;
  readonly spawnDetached: (command: string, args: readonly string[]) => ChildProcess;
};

export const CommandExecutor = Context.Service<CommandExecutorService>("relay/CommandExecutor");

const commandEnvironment = (command: EffectChildProcess.StandardCommand): NodeJS.ProcessEnv | undefined => {
  if (!command.options.env) return undefined;
  if (command.options.extendEnv === false) return command.options.env as NodeJS.ProcessEnv;
  return { ...process.env, ...command.options.env };
};

const runStandardCommand = (
  command: EffectChildProcess.StandardCommand,
  options: CommandRunOptions = {}
): Effect.Effect<CommandResult, unknown> =>
  Effect.tryPromise({
    try: () =>
      execFileAsync(command.command, [...command.args], {
        cwd: command.options.cwd,
        encoding: "utf8",
        env: commandEnvironment(command),
        maxBuffer: options.maxBuffer ?? 1024 * 1024,
        shell: command.options.shell,
        timeout: options.timeoutMs
      }).then((result) => ({
        stdout: result.stdout,
        stderr: result.stderr
      })),
    catch: (error) => error
  });

export const CommandExecutorLive = Layer.succeed(CommandExecutor)({
  run: (command, options) =>
    command._tag === "StandardCommand"
      ? runStandardCommand(command, options)
      : Effect.fail(new Error("Piped commands are not supported by Relay's command executor yet.")),
  execFile: (command, args, options = {}) =>
    runStandardCommand(EffectChildProcess.make(command, args, { cwd: options.cwd }), {
      maxBuffer: options.maxBuffer,
      timeoutMs: options.timeoutMs
    }),
  spawnDetached: (command, args) => spawn(command, [...args], { detached: true, stdio: "ignore" })
});
