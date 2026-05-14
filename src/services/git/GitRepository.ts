/**
 * Opened Git repository operations.
 */
import { Context, Effect } from "effect";
import { GitCli, type GitCliLiveServices } from "./GitCli";
import { detachedHead, namedBranch, unbornBranch, type GitBranch } from "./GitBranch";
import { GitCommitSha } from "./GitRef";
import { GitTree } from "./GitTree";
import {
  commandMessage,
  isNotGitRepositoryMessage,
  isUnbornHeadMessage,
  NotGitRepository,
  UnbornGitHead,
  type GitError
} from "./GitError";
import { parsePorcelainStatus } from "./GitStatus";

type GitRepositoryServices = Context.Service.Identifier<typeof GitCli> | GitCliLiveServices;

export type GitRepository = {
  readonly projectPath: string;
  readonly branch: () => Effect.Effect<GitBranch, GitError, GitRepositoryServices>;
  readonly tree: () => Effect.Effect<GitTree, GitError, GitRepositoryServices>;
};

const readHead = (projectPath: string): Effect.Effect<GitCommitSha | null, GitError, GitRepositoryServices> =>
  GitCli.use((git) =>
    git.exec(projectPath, ["rev-parse", "--short=8", "HEAD"]).pipe(
      Effect.map((result) => {
        const short = result.stdout.trim();
        return short ? GitCommitSha(short) : null;
      }),
      Effect.catch((error): Effect.Effect<GitCommitSha | null, GitError> => {
        const message = commandMessage(error);
        if (isUnbornHeadMessage(message)) return Effect.succeed(null);
        return Effect.fail(error);
      })
    )
  );

const readBranch = (projectPath: string): Effect.Effect<GitBranch, GitError, GitRepositoryServices> =>
  Effect.gen(function*() {
    const branchName = yield* GitCli.use((git) => git.exec(projectPath, ["branch", "--show-current"])).pipe(
      Effect.map((result) => result.stdout.trim() || null)
    );
    const head = yield* readHead(projectPath);

    if (branchName && head) return namedBranch(branchName, head);
    if (branchName) return unbornBranch(branchName);
    if (head) return detachedHead(head);
    return unbornBranch(null);
  });

const readTree = (projectPath: string): Effect.Effect<GitTree, GitError, GitRepositoryServices> =>
  GitCli.use((git) => git.exec(projectPath, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])).pipe(
    Effect.map((result) => GitTree(projectPath, parsePorcelainStatus(result.stdout)))
  );

export const makeGitRepository = (projectPath: string): GitRepository => ({
  projectPath,
  branch: () => readBranch(projectPath),
  tree: () => readTree(projectPath)
});

export const verifyGitRepository = (projectPath: string): Effect.Effect<void, GitError, GitRepositoryServices> =>
  GitCli.use((git) => git.exec(projectPath, ["rev-parse", "--is-inside-work-tree"])).pipe(
    Effect.flatMap((result) => {
      if (result.stdout.trim() === "true") return Effect.void;
      return Effect.fail(
        new NotGitRepository({
          projectPath,
          message: "Project path is not a Git repository."
        })
      );
    }),
    Effect.catch((error): Effect.Effect<void, GitError> => {
      const message = commandMessage(error);
      if (isNotGitRepositoryMessage(message)) {
        return Effect.fail(new NotGitRepository({ projectPath, message: "Project path is not a Git repository.", cause: error }));
      }
      if (isUnbornHeadMessage(message)) {
        return Effect.fail(new UnbornGitHead({ projectPath, message, cause: error }));
      }
      return Effect.fail(error);
    })
  );
