import { Effect } from "effect";
import type { AddProjectResult } from "../../../shared/types";
import { ElectronDialog, ElectronShell } from "../../electron";
import { pathResolve } from "../../services/io";
import { readCachedGitMetadata } from "../../services/git";
import { readRegistry, removeProjectPath, upsertProjectPath } from "../../services/registry";
import { fromPromise } from "../../services/runtime";
import { gitMetadataOptionsSchema, parseSchema } from "../../services/schemas";
import { initializeProject, summarizeProject } from "../../services/storage";
import { defineRelayIpcMethod, type AnyRelayIpcMethod } from "../RelayIpc";
import { relayIpcChannels } from "../channels";
import { emptyArgs, ipcArgs, ipcOptionalUnknown, ipcResult, ipcString, ipcVoid } from "../schema";

const projectSummariesFromRegistry = async (): Promise<Awaited<ReturnType<typeof summarizeProject>>[]> => {
  const registry = await readRegistry();
  return Promise.all(
    [...registry.projects]
      .sort((a, b) => a.sidebarPosition - b.sidebarPosition)
      .map((project) => summarizeProject(project.path, project.lastOpenedAt))
  );
};

const addProjectFolder = () =>
  Effect.gen(function*() {
    const electronDialog = yield* ElectronDialog;
    const result = yield* electronDialog.showOpenDialog({
      title: "Add Relay Project",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const projectPath = pathResolve(result.filePaths[0]);
    const summary = yield* fromPromise(() => summarizeProject(projectPath));
    let initialized = false;

    if (!summary.relayInitialized) {
      const confirm = yield* electronDialog.showMessageBox({
        type: "question",
        buttons: ["Initialize", "Cancel"],
        defaultId: 0,
        cancelId: 1,
        title: "Initialize Relay Project",
        message: "Relay needs to create a .relay folder in this project.",
        detail: projectPath
      });
      if (confirm.response !== 0) return null;
      yield* fromPromise(() => initializeProject(projectPath));
      initialized = true;
    }

    yield* fromPromise(() => upsertProjectPath(projectPath));
    return {
      project: yield* fromPromise(() => summarizeProject(projectPath, new Date().toISOString())),
      initialized
    };
  });

export const projectIpcMethods = [
  defineRelayIpcMethod({
    channel: relayIpcChannels.projectsList,
    payload: emptyArgs(),
    result: ipcResult(),
    handler: () => fromPromise(() => projectSummariesFromRegistry())
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.projectsAddFolder,
    payload: emptyArgs(),
    result: ipcResult(),
    handler: () => addProjectFolder()
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.projectsRemoveFromSidebar,
    payload: ipcArgs([ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath) =>
      fromPromise(async () => {
        await removeProjectPath(projectPath);
        return projectSummariesFromRegistry();
      })
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.projectsRead,
    payload: ipcArgs([ipcString]),
    result: ipcResult(),
    handler: (_event, projectPath) => fromPromise(() => summarizeProject(projectPath))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.projectsGitMetadata,
    payload: ipcArgs([ipcString, ipcOptionalUnknown]),
    result: ipcResult(),
    handler: (_event, projectPath, options) =>
      fromPromise(() => readCachedGitMetadata(projectPath, parseSchema(gitMetadataOptionsSchema, options ?? {})))
  }),
  defineRelayIpcMethod({
    channel: relayIpcChannels.projectsRevealInFinder,
    payload: ipcArgs([ipcString]),
    result: ipcVoid,
    handler: (_event, projectPath) => ElectronShell.use((electronShell) => electronShell.openPath(projectPath))
  })
] satisfies ReadonlyArray<AnyRelayIpcMethod>;
