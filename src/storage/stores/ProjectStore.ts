/**
 * Project-level storage operations for Relay repositories.
 */
import { Context, Effect, FileSystem, Layer } from "effect";
import type { BoardSnapshot, ProjectConfig, ProjectSummary } from "@shared/types";
import { pathJoin } from "../../io";
import * as FileSystemStorage from "../filesystem";
import { projectConfigPath, projectRelayPath, ticketPath } from "../paths";
import { mapStoreReadError, storeRead, storeWrite, type StoreEffect } from "./effects";

export type ProjectStoreService = {
  readonly isGitRepository: (projectPath: string) => StoreEffect<boolean, FileSystem.FileSystem>;
  readonly isInitialized: (projectPath: string) => StoreEffect<boolean, FileSystem.FileSystem>;
  readonly initialize: (projectPath: string) => StoreEffect<ProjectConfig>;
  readonly summarize: (projectPath: string, lastOpenedAt?: string) => StoreEffect<ProjectSummary>;
  readonly readConfig: (projectPath: string) => StoreEffect<ProjectConfig>;
  readonly writeConfig: (projectPath: string, config: ProjectConfig) => StoreEffect<ProjectConfig>;
  readonly readBoard: (projectPath: string, lastOpenedAt?: string) => StoreEffect<BoardSnapshot>;
};

export const ProjectStore = Context.Service<ProjectStoreService>("relay/storage/ProjectStore");

export const makeFileSystemProjectStore = (): ProjectStoreService => ({
  isGitRepository: (projectPath) =>
    FileSystem.FileSystem.use((fs) => fs.exists(pathJoin(projectPath, ".git"))).pipe(
      Effect.mapError(mapStoreReadError(pathJoin(projectPath, ".git"), "Check Git repository"))
    ),
  isInitialized: (projectPath) =>
    FileSystem.FileSystem.use((fs) => fs.exists(projectConfigPath(projectPath))).pipe(
      Effect.mapError(mapStoreReadError(projectConfigPath(projectPath), "Check Relay project initialization"))
    ),
  initialize: (projectPath) =>
    storeWrite(projectRelayPath(projectPath), "Initialize Relay project storage", () => FileSystemStorage.initializeProject(projectPath)),
  summarize: (projectPath, lastOpenedAt) =>
    storeRead(projectRelayPath(projectPath), "Summarize Relay project", () => FileSystemStorage.summarizeProject(projectPath, lastOpenedAt)),
  readConfig: (projectPath) =>
    storeRead(projectConfigPath(projectPath), "Read Relay project config", () => FileSystemStorage.readProjectConfig(projectPath)),
  writeConfig: (projectPath, config) =>
    storeWrite(projectConfigPath(projectPath), "Write Relay project config", () =>
      FileSystemStorage.writeProjectConfig(projectPath, config)
    ),
  readBoard: (projectPath, lastOpenedAt) =>
    storeRead(ticketPath(projectPath, "*"), "Read Relay board", () => FileSystemStorage.readBoard(projectPath, lastOpenedAt))
});

export const FileSystemProjectStoreLive = Layer.succeed(ProjectStore)(makeFileSystemProjectStore());
