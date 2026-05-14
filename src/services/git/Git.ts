/**
 * High-level Git service for Relay.
 *
 * This module keeps Git operations Effect-first and maps repository state back
 * to the renderer-compatible `GitMetadata` shape at the edge.
 */
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import type { GitMetadata } from "@shared/schemas";
import { ProjectPathNotDirectory, ProjectPathUnavailable, errorMessage } from "../../domain/errors";
import { BackendConfig } from "../../runtime";
import { GitCli } from "./GitCli";
import { GitMetadataCache } from "./GitMetadataCache";
import { makeGitRepository, verifyGitRepository, type GitRepository } from "./GitRepository";
import { commandMessage, GitUnavailable, NotGitRepository, type GitError } from "./GitError";

export type GitMetadataReadOptions = {
  readonly now?: () => string;
};

export type GitMetadataCacheOptions = GitMetadataReadOptions & {
  readonly force?: boolean;
};

export type GitService = {
  readonly open: (projectPath: string) => Effect.Effect<GitRepository, GitError | ProjectPathNotDirectory | ProjectPathUnavailable, GitServices>;
  readonly readMetadata: (projectPath: string, options?: GitMetadataReadOptions) => Effect.Effect<GitMetadata, never, GitServices>;
  readonly readCachedMetadata: (projectPath: string, options?: GitMetadataCacheOptions) => Effect.Effect<GitMetadata, never, GitServices>;
  readonly clearMetadataCache: () => Effect.Effect<void, never, Context.Service.Identifier<typeof GitMetadataCache>>;
};

export const Git = Context.Service<GitService>("relay/Git");

type GitServices =
  | FileSystem.FileSystem
  | Path.Path
  | Context.Service.Identifier<typeof GitCli>
  | Context.Service.Identifier<typeof GitMetadataCache>
  | Context.Service.Identifier<typeof ChildProcessSpawner.ChildProcessSpawner>
  | Context.Service.Identifier<typeof BackendConfig>;

const resolveProjectPath = (projectPath: string): Effect.Effect<string, never, Path.Path> =>
  Path.Path.use((path) => Effect.succeed(path.resolve(projectPath)));

const assertProjectDirectory = (
  projectPath: string
): Effect.Effect<void, ProjectPathNotDirectory | ProjectPathUnavailable, FileSystem.FileSystem> =>
  FileSystem.FileSystem.use((fs) =>
    fs.stat(projectPath).pipe(
      Effect.flatMap((info) => {
        if (info.type === "Directory") return Effect.void;
        return Effect.fail(
          new ProjectPathNotDirectory({
            projectPath,
            message: "Project path is not a directory."
          })
        );
      }),
      Effect.mapError(
        (cause) =>
          new ProjectPathUnavailable({
            projectPath,
            message: errorMessage(cause, "Project path is unavailable."),
            cause
          })
      )
    )
  );

const openRepository = (
  projectPath: string
): Effect.Effect<GitRepository, GitError | ProjectPathNotDirectory | ProjectPathUnavailable, GitServices> =>
  Effect.gen(function*() {
    const resolved = yield* resolveProjectPath(projectPath);
    yield* assertProjectDirectory(resolved);
    yield* verifyGitRepository(resolved);
    return makeGitRepository(resolved);
  });

const baseMetadata = (
  state: GitMetadata["state"],
  updatedAt: string,
  patch: Partial<Omit<GitMetadata, "state" | "updatedAt">> = {}
): GitMetadata => ({
  state,
  isGitRepository: false,
  branchName: null,
  isDetachedHead: false,
  commitSha: null,
  isDirty: false,
  changedFileCount: null,
  message: null,
  error: null,
  updatedAt,
  ...patch
});

const metadataFromRepository = (repository: GitRepository, updatedAt: string): Effect.Effect<GitMetadata, never, GitServices> =>
  Effect.gen(function*() {
    const branch = yield* repository.branch();
    const tree = yield* repository.tree();
    const head = branch._tag === "DetachedHead" ? branch.head : branch._tag === "NamedBranch" ? branch.head : null;
    const branchName = branch._tag === "NamedBranch" ? branch.name : branch._tag === "UnbornBranch" ? branch.name : null;

    return baseMetadata("ready", updatedAt, {
      isGitRepository: true,
      branchName,
      isDetachedHead: branch._tag === "DetachedHead",
      commitSha: head?.short ?? null,
      isDirty: tree.status.isDirty,
      changedFileCount: tree.status.changedFileCount,
      message: tree.status.isDirty ? `${tree.status.changedFileCount} uncommitted file change(s).` : "Working tree clean."
    });
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed(
        baseMetadata("error", updatedAt, {
          isGitRepository: true,
          message: "Unable to inspect Git repository.",
          error: commandMessage(error)
        })
      )
    )
  );

const readMetadata = (projectPath: string, options: GitMetadataReadOptions = {}): Effect.Effect<GitMetadata, never, GitServices> =>
  Effect.gen(function*() {
    const updatedAt = options.now?.() ?? new Date().toISOString();
    return yield* openRepository(projectPath).pipe(
      Effect.flatMap((repository) => metadataFromRepository(repository, updatedAt)),
      Effect.catch((error) => {
        if (error instanceof GitUnavailable) {
          return Effect.succeed(
            baseMetadata("unavailable", updatedAt, {
              message: "Git command is unavailable.",
              error: commandMessage(error)
            })
          );
        }
        if (error instanceof NotGitRepository) {
          return Effect.succeed(
            baseMetadata("not_git", updatedAt, {
              message: "Project path is not a Git repository."
            })
          );
        }
        if (error instanceof ProjectPathNotDirectory || error instanceof ProjectPathUnavailable) {
          return Effect.succeed(
            baseMetadata("missing", updatedAt, {
              message: error.message,
              error: error instanceof ProjectPathUnavailable ? error.message : undefined
            })
          );
        }
        return Effect.succeed(
          baseMetadata("error", updatedAt, {
            message: "Unable to inspect Git repository.",
            error: commandMessage(error)
          })
        );
      })
    );
  });

const readCachedMetadata = (
  projectPath: string,
  options: GitMetadataCacheOptions = {}
): Effect.Effect<GitMetadata, never, GitServices> =>
  Effect.gen(function*() {
    const resolved = yield* resolveProjectPath(projectPath);
    const config = yield* BackendConfig;
    const cache = yield* GitMetadataCache;
    const nowMs = Date.now();

    if (!options.force) {
      const cached = yield* cache.get(resolved, nowMs);
      if (cached) return cached;
    }

    const metadata = yield* readMetadata(resolved, options);
    yield* cache.set(resolved, metadata, Date.now() + config.gitMetadataCacheTtlMs);
    return metadata;
  });

export const GitLive = Layer.succeed(Git)({
  open: openRepository,
  readMetadata,
  readCachedMetadata,
  clearMetadataCache: () => GitMetadataCache.use((cache) => cache.clear())
});
