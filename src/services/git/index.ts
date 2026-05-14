import { Effect, Layer } from "effect";
import type { GitMetadata } from "@shared/types";
import { Git, GitLive } from "./Git";
import { GitCliFromRunner, GitCliLive, type GitCommandResult, type GitCommandRunner } from "./GitCli";
import { GitMetadataCacheLive } from "./GitMetadataCache";
import { parsePorcelainChangedFileCount } from "./GitStatus";
import { BackendServicesBaseLive, runBackendEffect } from "../../runtime";
import { IoLive } from "../../io";

export { Git, GitCliFromRunner, GitCliLive, GitLive, GitMetadataCacheLive, parsePorcelainChangedFileCount };
export type { GitCommandResult, GitCommandRunner };

type GitMetadataDependencies = {
  readonly execGit?: GitCommandRunner;
  readonly now?: () => string;
};

export type GitServiceService = {
  readonly readMetadata: (projectPath: string, dependencies?: GitMetadataDependencies) => Effect.Effect<GitMetadata, never>;
  readonly readCachedMetadata: (projectPath: string, options?: { force?: boolean }) => Effect.Effect<GitMetadata, never>;
  readonly clearCache: () => Effect.Effect<void>;
};

export const GitService = Git;

export const GitServiceLive = Layer.mergeAll(GitLive, GitCliLive, GitMetadataCacheLive);

const layerForDependencies = (dependencies: GitMetadataDependencies = {}) =>
  Layer.mergeAll(GitLive, dependencies.execGit ? GitCliFromRunner(dependencies.execGit) : GitCliLive, GitMetadataCacheLive);

const runGit = <A>(effect: Effect.Effect<A, unknown, any>, layer = GitServiceLive): Promise<A> =>
  runBackendEffect(Effect.provide(effect, layer.pipe(Layer.provideMerge(BackendServicesBaseLive), Layer.provideMerge(IoLive))));

export const readGitMetadata = (projectPath: string, dependencies: GitMetadataDependencies = {}): Promise<GitMetadata> =>
  runGit(Git.use((service) => service.readMetadata(projectPath, { now: dependencies.now })), layerForDependencies(dependencies));

export const readCachedGitMetadata = (projectPath: string, options: { force?: boolean } = {}): Promise<GitMetadata> =>
  runGit(Git.use((service) => service.readCachedMetadata(projectPath, options)));

export const clearGitMetadataCache = (): void => {
  void runGit(Git.use((service) => service.clearMetadataCache()));
};
