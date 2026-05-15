/**
 * Project-level storage operations for Relay repositories.
 */
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import type { BoardSnapshot, ProjectConfig, ProjectSummary } from "@shared/schemas";
import * as FileSystemStorage from "../filesystem";
import { projectConfigPath, projectRelayPath, ticketPath } from "../paths";
import { mapStoreReadError, storeRead, storeWrite, type StoreEffect } from "./effects";

export type ProjectStoreService = {
  readonly isGitRepository: (projectPath: string) => StoreEffect<boolean, FileSystem.FileSystem | Path.Path>;
  readonly isInitialized: (projectPath: string) => StoreEffect<boolean, FileSystem.FileSystem | Path.Path>;
  readonly initialize: (projectPath: string) => StoreEffect<ProjectConfig, Path.Path>;
  readonly summarize: (projectPath: string, lastOpenedAt?: string) => StoreEffect<ProjectSummary, Path.Path>;
  readonly readConfig: (projectPath: string) => StoreEffect<ProjectConfig, Path.Path>;
  readonly writeConfig: (projectPath: string, config: ProjectConfig) => StoreEffect<ProjectConfig, Path.Path>;
  readonly readBoard: (projectPath: string, lastOpenedAt?: string) => StoreEffect<BoardSnapshot, Path.Path>;
};

export const ProjectStore = Context.Service<ProjectStoreService>("relay/storage/ProjectStore");

const readAt = <A>(target: (path: Path.Path) => string, operation: string, evaluate: () => PromiseLike<A>): StoreEffect<A, Path.Path> =>
  Path.Path.use((path) => storeRead(target(path), operation, evaluate));

const writeAt = <A>(target: (path: Path.Path) => string, operation: string, evaluate: () => PromiseLike<A>): StoreEffect<A, Path.Path> =>
  Path.Path.use((path) => storeWrite(target(path), operation, evaluate));

export const makeFileSystemProjectStore = (): ProjectStoreService => ({
  isGitRepository: (projectPath) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const target = path.join(projectPath, ".git");
      return yield* fs.exists(target).pipe(Effect.mapError(mapStoreReadError(target, "Check Git repository")));
    }),
  isInitialized: (projectPath) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const target = projectConfigPath(path, projectPath);
      return yield* fs.exists(target).pipe(Effect.mapError(mapStoreReadError(target, "Check Relay project initialization")));
    }),
  initialize: (projectPath) =>
    writeAt((path) => projectRelayPath(path, projectPath), "Initialize Relay project storage", () => FileSystemStorage.initializeProject(projectPath)),
  summarize: (projectPath, lastOpenedAt) =>
    readAt((path) => projectRelayPath(path, projectPath), "Summarize Relay project", () => FileSystemStorage.summarizeProject(projectPath, lastOpenedAt)),
  readConfig: (projectPath) =>
    readAt((path) => projectConfigPath(path, projectPath), "Read Relay project config", () => FileSystemStorage.readProjectConfig(projectPath)),
  writeConfig: (projectPath, config) =>
    writeAt((path) => projectConfigPath(path, projectPath), "Write Relay project config", () =>
      FileSystemStorage.writeProjectConfig(projectPath, config)
    ),
  readBoard: (projectPath, lastOpenedAt) =>
    readAt((path) => ticketPath(path, projectPath, "*"), "Read Relay board", () => FileSystemStorage.readBoard(projectPath, lastOpenedAt))
});

export const FileSystemProjectStoreLive = Layer.succeed(ProjectStore)(makeFileSystemProjectStore());
