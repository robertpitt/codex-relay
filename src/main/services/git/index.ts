import { Context, Effect, Layer } from "effect";
import type { GitMetadata } from "../../../shared/types";
import { BackendConfig, fromPromise, runBackendEffect } from "../runtime";
import { CommandExecutor, pathResolve, statPathEffect } from "../io";

export type GitCommandResult = {
  stdout: string;
  stderr: string;
};

export type GitCommandRunner = (projectPath: string, args: string[]) => Promise<GitCommandResult>;

type GitMetadataDependencies = {
  execGit?: GitCommandRunner;
  now?: () => string;
};

const defaultGitRunner: GitCommandRunner = (projectPath, args) =>
  runBackendEffect(
    CommandExecutor.use((executor) =>
      executor.execFile("git", ["-C", projectPath, ...args], {
        maxBuffer: 1024 * 1024,
        timeoutMs: 5_000
      })
    )
  );

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

const commandMessage = (error: unknown): string => {
  if (typeof error === "object" && error && "stderr" in error && typeof (error as { stderr?: unknown }).stderr === "string") {
    const stderr = (error as { stderr: string }).stderr.trim();
    if (stderr) return stderr.split("\n")[0];
  }
  if (error instanceof Error) return error.message;
  return "Git command failed.";
};

const isMissingGitBinary = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";

const isNotGitRepositoryError = (error: unknown): boolean => /not a git repository|not a git dir/i.test(commandMessage(error));

const isUnbornHeadError = (error: unknown): boolean =>
  /needed a single revision|ambiguous argument 'HEAD'|unknown revision or path/i.test(commandMessage(error));

export const parsePorcelainChangedFileCount = (output: string): number => {
  const records = output.split("\0").filter((record) => record.length > 0);
  let count = 0;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.length < 3) continue;
    count += 1;

    const stagedStatus = record[0];
    const unstagedStatus = record[1];
    if (stagedStatus === "R" || stagedStatus === "C" || unstagedStatus === "R" || unstagedStatus === "C") {
      index += 1;
    }
  }

  return count;
};

const readGitMetadataPromise = async (
  projectPath: string,
  dependencies: GitMetadataDependencies = {}
): Promise<GitMetadata> => {
  const resolved = pathResolve(projectPath);
  const execGit = dependencies.execGit ?? defaultGitRunner;
  const updatedAt = dependencies.now?.() ?? new Date().toISOString();

  try {
    const info = await runBackendEffect(statPathEffect(resolved));
    if (!info.isDirectory) {
      return baseMetadata("missing", updatedAt, {
        message: "Project path is not a directory."
      });
    }
  } catch (error) {
    return baseMetadata("missing", updatedAt, {
      message: error instanceof Error ? error.message : "Project path is unavailable.",
      error: error instanceof Error ? error.message : "Project path is unavailable."
    });
  }

  try {
    const insideWorkTree = (await execGit(resolved, ["rev-parse", "--is-inside-work-tree"])).stdout.trim();
    if (insideWorkTree !== "true") {
      return baseMetadata("not_git", updatedAt, {
        message: "Project path is not a Git repository."
      });
    }
  } catch (error) {
    if (isMissingGitBinary(error)) {
      return baseMetadata("unavailable", updatedAt, {
        message: "Git command is unavailable.",
        error: commandMessage(error)
      });
    }
    if (isNotGitRepositoryError(error)) {
      return baseMetadata("not_git", updatedAt, {
        message: "Project path is not a Git repository."
      });
    }
    return baseMetadata("error", updatedAt, {
      message: "Unable to inspect Git repository.",
      error: commandMessage(error)
    });
  }

  let branchName: string | null = null;
  let commitSha: string | null = null;

  try {
    branchName = (await execGit(resolved, ["branch", "--show-current"])).stdout.trim() || null;

    try {
      commitSha = (await execGit(resolved, ["rev-parse", "--short=8", "HEAD"])).stdout.trim() || null;
    } catch (error) {
      if (!isUnbornHeadError(error)) throw error;
    }

    const statusOutput = (await execGit(resolved, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])).stdout;
    const changedFileCount = parsePorcelainChangedFileCount(statusOutput);
    const isDetachedHead = branchName === null && commitSha !== null;

    return baseMetadata("ready", updatedAt, {
      isGitRepository: true,
      branchName,
      isDetachedHead,
      commitSha,
      isDirty: changedFileCount > 0,
      changedFileCount,
      message: changedFileCount > 0 ? `${changedFileCount} uncommitted file change(s).` : "Working tree clean."
    });
  } catch (error) {
    if (isMissingGitBinary(error)) {
      return baseMetadata("unavailable", updatedAt, {
        message: "Git command is unavailable.",
        error: commandMessage(error)
      });
    }
    return baseMetadata("error", updatedAt, {
      isGitRepository: true,
      branchName,
      isDetachedHead: branchName === null && commitSha !== null,
      commitSha,
      message: "Unable to inspect Git repository.",
      error: commandMessage(error)
    });
  }
};

const gitMetadataCache = new Map<string, { value?: GitMetadata; expiresAt: number; pending?: Promise<GitMetadata> }>();

const readCachedGitMetadataPromise = async (
  projectPath: string,
  options: { force?: boolean; cacheTtlMs?: number } = {}
): Promise<GitMetadata> => {
  const resolved = pathResolve(projectPath);
  const cached = gitMetadataCache.get(resolved);
  const now = Date.now();

  if (!options.force && cached?.value && cached.expiresAt > now) {
    return cached.value;
  }
  if (!options.force && cached?.pending) {
    return cached.pending;
  }

  const pending = readGitMetadataPromise(resolved).then((value) => {
    gitMetadataCache.set(resolved, {
      value,
      expiresAt: Date.now() + (options.cacheTtlMs ?? 3_000)
    });
    return value;
  });

  gitMetadataCache.set(resolved, {
    value: cached?.value,
    expiresAt: cached?.expiresAt ?? 0,
    pending
  });

  return pending;
};

const clearGitMetadataCacheSync = (): void => {
  gitMetadataCache.clear();
};

export type GitServiceService = {
  readonly readMetadata: (projectPath: string, dependencies?: GitMetadataDependencies) => Effect.Effect<GitMetadata, unknown>;
  readonly readCachedMetadata: (
    projectPath: string,
    options?: { force?: boolean }
  ) => Effect.Effect<GitMetadata, unknown, Context.Service.Identifier<typeof BackendConfig>>;
  readonly clearCache: () => Effect.Effect<void>;
};

export const GitService = Context.Service<GitServiceService>("relay/GitService");

export const GitServiceLive = Layer.succeed(GitService)({
  readMetadata: (projectPath, dependencies = {}) => fromPromise(() => readGitMetadataPromise(projectPath, dependencies)),
  readCachedMetadata: (projectPath, options = {}) =>
    Effect.gen(function*() {
      const config = yield* BackendConfig;
      return yield* fromPromise(() => readCachedGitMetadataPromise(projectPath, { ...options, cacheTtlMs: config.gitMetadataCacheTtlMs }));
    }),
  clearCache: () => Effect.sync(clearGitMetadataCacheSync)
});

export const readGitMetadata = (projectPath: string, dependencies: GitMetadataDependencies = {}): Promise<GitMetadata> =>
  runBackendEffect(Effect.provide(GitService.use((service) => service.readMetadata(projectPath, dependencies)), GitServiceLive));

export const readCachedGitMetadata = (projectPath: string, options: { force?: boolean } = {}): Promise<GitMetadata> =>
  runBackendEffect(Effect.provide(GitService.use((service) => service.readCachedMetadata(projectPath, options)), GitServiceLive));

export const clearGitMetadataCache = (): void => {
  clearGitMetadataCacheSync();
};
