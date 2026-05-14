/**
 * Git command execution service.
 *
 * Domain services consume this abstraction instead of invoking `git` directly.
 */
import { Context, Effect, Layer } from "effect";
import { ChildProcess } from "effect/unstable/process";
import { CommandExecutor, type CommandResult } from "../../io";
import { BackendConfig } from "../../runtime";
import { gitCommandError, type GitCommandError, type GitUnavailable } from "./GitError";

export type GitCommandResult = CommandResult;

export type GitCommandRunner = (projectPath: string, args: readonly string[]) => Promise<GitCommandResult>;

export type GitCliLiveServices = Context.Service.Identifier<typeof CommandExecutor> | Context.Service.Identifier<typeof BackendConfig>;

export type GitCliService = {
  readonly exec: (
    projectPath: string,
    args: readonly string[]
  ) => Effect.Effect<GitCommandResult, GitCommandError | GitUnavailable, GitCliLiveServices>;
};

export const GitCli = Context.Service<GitCliService>("relay/GitCli");

export const GitCliLive = Layer.succeed(GitCli)({
  exec: (projectPath, args) =>
    Effect.gen(function*() {
      const config = yield* BackendConfig;
      const executor = yield* CommandExecutor;
      return yield* executor.run(ChildProcess.make("git", ["-C", projectPath, ...args]), {
        maxBuffer: 1024 * 1024,
        timeoutMs: config.gitCommandTimeoutMs
      }).pipe(Effect.mapError((cause) => gitCommandError("git", ["-C", projectPath, ...args], cause)));
    })
});

export const GitCliFromRunner = (runner: GitCommandRunner): Layer.Layer<Context.Service.Identifier<typeof GitCli>> =>
  Layer.succeed(GitCli)({
    exec: (projectPath, args) =>
      Effect.tryPromise({
        try: () => runner(projectPath, args),
        catch: (cause) => gitCommandError("git", ["-C", projectPath, ...args], cause)
      })
  });
