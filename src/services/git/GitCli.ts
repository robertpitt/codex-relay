/**
 * Git command execution service.
 *
 * Domain services consume this abstraction instead of invoking `git` directly.
 */
import { Context, Effect, Layer, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { BackendConfig } from "../../runtime";
import { gitCommandError, type GitCommandError, type GitUnavailable } from "./GitError";

export type GitCommandResult = {
  readonly stdout: string;
  readonly stderr: string;
};

export type GitCommandRunner = (projectPath: string, args: readonly string[]) => Promise<GitCommandResult>;

export type GitCliLiveServices =
  | Context.Service.Identifier<typeof ChildProcessSpawner.ChildProcessSpawner>
  | Context.Service.Identifier<typeof BackendConfig>;

export type GitCliService = {
  readonly exec: (
    projectPath: string,
    args: readonly string[]
  ) => Effect.Effect<GitCommandResult, GitCommandError | GitUnavailable, GitCliLiveServices>;
};

export const GitCli = Context.Service<GitCliService>("relay/GitCli");

const streamText = (stream: Stream.Stream<Uint8Array, unknown>): Effect.Effect<string, unknown> =>
  stream.pipe(Stream.decodeText(), Stream.mkString);

const nonZeroExitError = (exitCode: ChildProcessSpawner.ExitCode, stdout: string, stderr: string): Error & GitCommandResult & {
  readonly exitCode: ChildProcessSpawner.ExitCode;
} =>
  Object.assign(new Error(`Git command exited with code ${exitCode}.`), {
    exitCode,
    stdout,
    stderr
  });

const runGit = (
  projectPath: string,
  args: readonly string[],
  timeoutMs: number
): Effect.Effect<GitCommandResult, unknown, Context.Service.Identifier<typeof ChildProcessSpawner.ChildProcessSpawner>> =>
  Effect.scoped(
    Effect.gen(function*() {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const command = ChildProcess.make("git", ["-C", projectPath, ...args]);
      const handle = yield* spawner.spawn(command);
      const output = yield* Effect.all({
        stdout: streamText(handle.stdout),
        stderr: streamText(handle.stderr),
        exitCode: handle.exitCode
      }, { concurrency: "unbounded" });

      if (output.exitCode !== ChildProcessSpawner.ExitCode(0)) {
        return yield* Effect.fail(nonZeroExitError(output.exitCode, output.stdout, output.stderr));
      }

      return {
        stdout: output.stdout,
        stderr: output.stderr
      };
    })
  ).pipe(Effect.timeout(timeoutMs));

export const GitCliLive = Layer.succeed(GitCli)({
  exec: (projectPath, args) =>
    Effect.gen(function*() {
      const config = yield* BackendConfig;
      return yield* runGit(projectPath, args, config.gitCommandTimeoutMs).pipe(
        Effect.mapError((cause) => gitCommandError("git", ["-C", projectPath, ...args], cause))
      );
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
