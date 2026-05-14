/**
 * Typed Git failures for Effect-first repository services.
 */
import { Data } from "effect";

export class GitUnavailable extends Data.TaggedError("GitUnavailable")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class GitCommandError extends Data.TaggedError("GitCommandError")<{
  readonly command: string;
  readonly args: readonly string[];
  readonly message: string;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly cause?: unknown;
}> {}

export class NotGitRepository extends Data.TaggedError("NotGitRepository")<{
  readonly projectPath: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class UnbornGitHead extends Data.TaggedError("UnbornGitHead")<{
  readonly projectPath: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type GitError = GitUnavailable | GitCommandError | NotGitRepository | UnbornGitHead;

export const commandMessage = (error: unknown, fallback = "Git command failed."): string => {
  if (typeof error === "object" && error !== null && "stderr" in error && typeof (error as { stderr?: unknown }).stderr === "string") {
    const stderr = (error as { stderr: string }).stderr.trim();
    if (stderr) return stderr.split("\n")[0];
  }
  return error instanceof Error ? error.message : fallback;
};

export const isMissingGitBinaryCause = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && (error as { code?: unknown }).code === "ENOENT") return true;
  const platformError = error as { _tag?: unknown; reason?: { _tag?: unknown; module?: unknown } };
  return platformError._tag === "PlatformError" && platformError.reason?._tag === "NotFound";
};

export const isNotGitRepositoryMessage = (message: string): boolean => /not a git repository|not a git dir/i.test(message);

export const isUnbornHeadMessage = (message: string): boolean =>
  /needed a single revision|ambiguous argument 'HEAD'|unknown revision or path/i.test(message);

export const gitCommandError = (
  command: string,
  args: readonly string[],
  cause: unknown,
  fallback = "Git command failed."
): GitUnavailable | GitCommandError => {
  const message = commandMessage(cause, fallback);
  if (isMissingGitBinaryCause(cause)) {
    return new GitUnavailable({
      message: "Git command is unavailable.",
      cause
    });
  }
  const stdout =
    typeof cause === "object" && cause !== null && "stdout" in cause && typeof (cause as { stdout?: unknown }).stdout === "string"
      ? (cause as { stdout: string }).stdout
      : undefined;
  const stderr =
    typeof cause === "object" && cause !== null && "stderr" in cause && typeof (cause as { stderr?: unknown }).stderr === "string"
      ? (cause as { stderr: string }).stderr
      : undefined;
  return new GitCommandError({
    command,
    args,
    message,
    stdout,
    stderr,
    cause
  });
};
